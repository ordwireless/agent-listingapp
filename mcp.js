// Remote connector (MCP over HTTP) so the Cowork "MLS agent" can send a finished property straight into
// this app and ask what is still missing. Reached at /mcp/<MCP_SECRET>. It is deliberately small and safe:
//  - it can create a property and fill EMPTY fields and notes; it never deletes anything and never
//    overwrites a value that is already filled in (set_field is the one explicit exception: it is David's answer).
//  - it never touches photos, documents or contacts.
const express = require('express');

const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const MAX_FIELDS = 100;
const MAX_LINES = 200;
const MAX_TEXT = 4000;

const SUFFIX = {
  drive: 'dr', street: 'st', road: 'rd', lane: 'ln', court: 'ct', avenue: 'ave', boulevard: 'blvd', circle: 'cir',
  place: 'pl', trail: 'trl', highway: 'hwy', parkway: 'pkwy', terrace: 'ter', north: 'n', south: 's', east: 'e', west: 'w'
};

// Names the agent may use that differ from the app's own labels. Keys and values are normalized (see norm).
const ALIASES = {
  'hvac': 'hvac unit 1', 'hvac 1': 'hvac unit 1', 'hvac unit': 'hvac unit 1', 'hvac 2': 'hvac unit 2',
  'beds': 'bedrooms', 'bedroom': 'bedrooms', 'baths': 'bathrooms', 'bathroom': 'bathrooms',
  'sqft': 'sq ft', 'square feet': 'sq ft', 'square footage': 'sq ft', 'living area': 'sq ft', 'heated sq ft': 'sq ft',
  'list price': 'price', 'asking price': 'price', 'listing price': 'price',
  'covenants': 'restrictive covenants', 'hoa name': 'hoa', 'flood': 'flood zone',
  'built': 'year built', 'year': 'year built'
};

function norm(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function streetKey(address) {
  return norm(String(address).split(',')[0]).split(' ').map((w) => SUFFIX[w] || w).join(' ');
}

function isUnknown(value) {
  return !value || /^(unknown|n\/a|tbd|not set|not available|not confirmed|-+|—|\?)(\b|$)/i.test(value);
}

function cleanValue(value, longText) {
  let v = String(value == null ? '' : value).replace(/\r\n/g, '\n');
  v = longText ? v.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n') : v.replace(/\s+/g, ' ');
  return v.trim().slice(0, MAX_TEXT);
}

function lineList(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((l) => String(l == null ? '' : l).replace(/\s+/g, ' ').replace(/^[-•*]\s*/, '').trim().slice(0, 1000))
    .filter(Boolean)
    .slice(0, MAX_LINES);
}

module.exports = function createMcp({ db, getTemplate, safeEqual, statuses, getContactRoles }) {
  const router = express.Router();

  // ----- data helpers -----

  function fieldCandidates(propertyId) {
    const list = [];
    getTemplate(propertyId || null).forEach((cat) => {
      if (cat.key === 'contacts') return; // contact names live in the Contacts section, not here
      cat.fields.forEach((f) => list.push({ ...f, category_title: cat.title }));
    });
    return list;
  }

  function resolveField(label, candidates) {
    const key = norm(label);
    const wanted = ALIASES[key] || key;
    return candidates.find((f) => norm(f.label) === wanted) || null;
  }

  function findProperty(address) {
    const key = streetKey(address);
    if (!key) return { error: 'Address is required' };
    const hasComma = String(address).includes(',');
    const rows = db.prepare('SELECT * FROM properties ORDER BY archived ASC, id ASC').all();
    const hits = rows.filter((p) => {
      const k = streetKey(p.address);
      if (!k) return false;
      if (k === key) return true;
      return !hasComma && k.split(' ').length >= 3 && key.startsWith(k + ' ');
    });
    if (hits.length === 0) return { property: null };
    const active = hits.filter((p) => !p.archived);
    if ((active.length || hits.length) > 1) {
      return { error: 'More than one property matches this address. Use the full street address exactly as it appears in the app.' };
    }
    return { property: active[0] || hits[0] };
  }

  function valuesFor(propertyId) {
    const map = {};
    db.prepare('SELECT field_id, value FROM property_field_values WHERE property_id = ?').all(propertyId)
      .forEach((r) => { map[r.field_id] = r.value; });
    return map;
  }

  function writeValue(propertyId, fieldId, value) {
    db.prepare(
      `INSERT INTO property_field_values (property_id, field_id, value) VALUES (?, ?, ?)
       ON CONFLICT(property_id, field_id) DO UPDATE SET value = excluded.value`
    ).run(propertyId, fieldId, value);
  }

  function touch(propertyId) {
    db.prepare("UPDATE properties SET updated_at = datetime('now') WHERE id = ?").run(propertyId);
  }

  function mergeNote(propertyId, title, lines) {
    if (!lines.length) return null;
    const existing = db.prepare('SELECT * FROM notes WHERE property_id = ? AND title = ?').get(propertyId, title);
    if (!existing) {
      db.prepare('INSERT INTO notes (property_id, title, body) VALUES (?, ?, ?)')
        .run(propertyId, title, lines.map((l) => '- ' + l).join('\n'));
      return { note: title, lines_added: lines.length };
    }
    const have = new Set(String(existing.body || '').split('\n').map((l) => norm(l.replace(/^[-•*]\s*/, ''))));
    const fresh = lines.filter((l) => !have.has(norm(l)));
    if (fresh.length) {
      const body = String(existing.body || '').replace(/\s+$/, '');
      db.prepare("UPDATE notes SET body = ?, updated_at = datetime('now') WHERE id = ?")
        .run((body ? body + '\n' : '') + fresh.map((l) => '- ' + l).join('\n'), existing.id);
    }
    return { note: title, lines_added: fresh.length };
  }

  function gaps(property) {
    const values = valuesFor(property.id);
    const empty = (f) => { const v = values[f.id]; return v === undefined || v === null || String(v).trim() === ''; };
    const candidates = fieldCandidates(property.id);
    // Contract dates (DD period, closing...) only exist once there is a contract, so they are not research gaps.
    const isDate = (f) => f.field_type === 'date';
    return {
      missing_important: candidates.filter((f) => f.important && !isDate(f) && empty(f)).map((f) => ({ label: f.label, section: f.category_title })),
      empty_optional: candidates.filter((f) => !f.important && !isDate(f) && empty(f)).map((f) => f.label),
      contract_dates_empty: candidates.filter((f) => isDate(f) && empty(f)).map((f) => f.label)
    };
  }

  function propertyUrl(req, id) {
    return `${req.protocol}://${req.get('host')}/#/property/${id}`;
  }

  // ----- tools -----

  function labelHelp() {
    return fieldCandidates(null).map((f) => f.label).join(', ');
  }

  function toolList() {
    return [
      {
        name: 'import_property',
        title: 'Send a property to the listing app',
        description:
          'Create (or find, by street address) a property in the listing app and fill its EMPTY fields from the research. ' +
          'Never overwrites a value David already entered. Use the app\'s own field labels: ' + labelHelp() + '. ' +
          'Put the whole HOA picture (name, amount, frequency, what it includes) in the single "HOA" field. ' +
          'Fields with no real value must be left out (do not send "unknown"). ' +
          'Mark shaky values with confidence "Weak" so they are flagged as unverified in the app. ' +
          'Data that has no matching field is not imported: leave it out. Do not send phone numbers or personal contact details. ' +
          'After this, call get_missing and ask David about what is still missing.',
        inputSchema: {
          type: 'object',
          properties: {
            address: { type: 'string', description: 'Full street address, e.g. "1026 Statler Dr, Durham, NC 27703"' },
            fields: {
              type: 'array',
              description: 'One entry per data point that has a real value',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string', description: 'App field label, e.g. "Bedrooms", "Year built", "HVAC unit 1"' },
                  value: { type: 'string' },
                  confidence: { type: 'string', enum: ['Strong', 'Medium', 'Weak'] },
                  source: { type: 'string', description: 'Where it came from (not stored, kept in the tool result log only)' }
                },
                required: ['label', 'value']
              }
            },
            open_items: { type: 'array', items: { type: 'string' }, description: 'ONLY facts that are missing in the app and still need to be found or confirmed (e.g. "Roof age - ask seller"). Not research caveats or general commentary. Saved as the note "Open items".' }
          },
          required: ['address', 'fields']
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
      },
      {
        name: 'get_missing',
        title: 'What is still missing on a property',
        description: 'List the important fields still empty on a property in the listing app (missing_important) plus other empty fields. Ask David about missing_important in chat, then save his answers with set_field.',
        inputSchema: {
          type: 'object',
          properties: { address: { type: 'string', description: 'Street address of the property' } },
          required: ['address']
        },
        annotations: { readOnlyHint: true, openWorldHint: false }
      },
      {
        name: 'set_field',
        title: 'Save David\'s answer into a field',
        description: 'Write one field on an existing property with the value David just told you. Replaces whatever is there (the previous value is returned). Use only for answers David gave you in chat.',
        inputSchema: {
          type: 'object',
          properties: {
            address: { type: 'string' },
            label: { type: 'string', description: 'App field label' },
            value: { type: 'string' }
          },
          required: ['address', 'label', 'value']
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
      },
      {
        name: 'add_contact',
        title: 'Add a contact to a property',
        description:
          'Add a person or company to the Contacts section of an existing property (for example from an OTP or other contract: Buyer, Buyer Agent, Seller, Closing Attorney, Lender, HOA Contact, Contractor). ' +
          'Include phone and email when the document has them; leave them out when it does not. Never invent details. ' +
          'If the same role and name already exist, only empty phone/email are filled. Nothing is ever deleted or overwritten.',
        inputSchema: {
          type: 'object',
          properties: {
            address: { type: 'string' },
            role: { type: 'string', description: 'One of: ' + getContactRoles().join(', ') },
            name: { type: 'string' },
            phone: { type: 'string' },
            email: { type: 'string' },
            notes: { type: 'string', description: 'Short extra detail, e.g. company or file number' }
          },
          required: ['address', 'role', 'name']
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
      },
      {
        name: 'save_note',
        title: 'Add lines to a titled note on a property',
        description:
          'Add lines to a note with the given title on an existing property (created if missing). Lines already in the note are not repeated, and nothing is removed. ' +
          'Use for contract facts that have no field, e.g. title "Contract summary": purchase price, earnest money, DD fee amount.',
        inputSchema: {
          type: 'object',
          properties: {
            address: { type: 'string' },
            title: { type: 'string', description: 'Note title, e.g. "Contract summary"' },
            lines: { type: 'array', items: { type: 'string' } }
          },
          required: ['address', 'title', 'lines']
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
      },
      {
        name: 'set_status',
        title: 'Change the status of a property',
        description: 'Set the property status (' + statuses.join(', ') + ') when a document shows it changed, e.g. "Under Contract" once there is a signed OTP. Tell David when you change it. The previous status is returned.',
        inputSchema: {
          type: 'object',
          properties: { address: { type: 'string' }, status: { type: 'string', enum: statuses } },
          required: ['address', 'status']
        },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
      }
    ];
  }

  function importProperty(args, req) {
    const address = cleanValue(args.address).slice(0, 300);
    if (!address) throw new Error('address is required');
    const items = Array.isArray(args.fields) ? args.fields.slice(0, MAX_FIELDS) : [];

    const found = findProperty(address);
    if (found.error) throw new Error(found.error);

    const result = { created: false, filled: [], kept_existing: [], skipped_unknown: [], unmatched: [], notes: [] };
    db.exec('BEGIN');
    try {
      let property = found.property;
      if (!property) {
        const info = db.prepare("INSERT INTO properties (address, status, updated_at) VALUES (?, 'Preparing', datetime('now'))").run(address);
        property = db.prepare('SELECT * FROM properties WHERE id = ?').get(info.lastInsertRowid);
        result.created = true;
      }
      const candidates = fieldCandidates(property.id);
      const values = valuesFor(property.id);
      const seen = new Set();

      items.forEach((item) => {
        const label = cleanValue(item && item.label).slice(0, 100);
        if (!label) return;
        const field = resolveField(label, candidates);
        if (!field) { result.unmatched.push({ label, reason: 'no field with this name in the app' }); return; }
        if (seen.has(field.id)) return; // first value for a field wins
        seen.add(field.id);

        let value = cleanValue(item.value, field.field_type === 'long_text');
        if (isUnknown(value)) { result.skipped_unknown.push(field.label); return; }
        if (field.field_type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          result.unmatched.push({ label, reason: 'date fields need YYYY-MM-DD' });
          return;
        }
        if (String(item.confidence || '').toLowerCase() === 'weak' && !/unverified/i.test(value)) value += ' ⚠ unverified';

        const current = values[field.id];
        if (current !== undefined && current !== null && String(current).trim() !== '') {
          result.kept_existing.push({ label: field.label, in_app: String(current), offered: value });
          return;
        }
        writeValue(property.id, field.id, value);
        result.filled.push(field.label);
      });

      // David's choice: no "MLS notes" note (the app is for quick answers); any `notes` argument is ignored.
      const openNote = mergeNote(property.id, 'Open items', lineList(args.open_items));
      if (openNote) result.notes.push(openNote);

      touch(property.id);
      db.exec('COMMIT');

      result.property_id = property.id;
      result.address_in_app = property.address;
      result.link = propertyUrl(req, property.id);
      Object.assign(result, gaps(property));
      if (result.unmatched.length) result.valid_labels = fieldCandidates(property.id).map((f) => f.label);
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  function getMissing(args, req) {
    const found = findProperty(cleanValue(args.address));
    if (found.error) throw new Error(found.error);
    if (!found.property) throw new Error('No property with this address in the app yet. Call import_property first.');
    return { property_id: found.property.id, address_in_app: found.property.address, link: propertyUrl(req, found.property.id), ...gaps(found.property) };
  }

  function setField(args, req) {
    const found = findProperty(cleanValue(args.address));
    if (found.error) throw new Error(found.error);
    if (!found.property) throw new Error('No property with this address in the app. Call import_property first.');
    const property = found.property;
    const candidates = fieldCandidates(property.id);
    const field = resolveField(cleanValue(args.label).slice(0, 100), candidates);
    if (!field) throw new Error('No field with that name. Valid labels: ' + candidates.map((f) => f.label).join(', '));
    const value = cleanValue(args.value, field.field_type === 'long_text');
    if (isUnknown(value)) throw new Error('Send a real value, or leave the field alone.');
    if (field.field_type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Date fields need YYYY-MM-DD');

    const previous = valuesFor(property.id)[field.id];
    writeValue(property.id, field.id, value);
    touch(property.id);
    return { ok: true, label: field.label, previous: previous == null || previous === '' ? null : previous, now: value, link: propertyUrl(req, property.id), ...gaps(property) };
  }

  function existingProperty(address) {
    const found = findProperty(cleanValue(address));
    if (found.error) throw new Error(found.error);
    if (!found.property) throw new Error('No property with this address in the app. Call import_property first.');
    return found.property;
  }

  function addContact(args, req) {
    const property = existingProperty(args.address);
    const name = cleanValue(args.name).slice(0, 200);
    if (!name) throw new Error('name is required');
    const roles = getContactRoles();
    const role = roles.find((r) => norm(r) === norm(args.role)) || 'Other';
    const phone = cleanValue(args.phone).slice(0, 40);
    const email = cleanValue(args.email).slice(0, 200);
    const notes = cleanValue(args.notes).slice(0, 500);

    const existing = db.prepare('SELECT * FROM contacts WHERE property_id = ? AND lower(role) = lower(?) AND lower(name) = lower(?)').get(property.id, role, name);
    let outcome;
    if (existing) {
      const filled = [];
      if (phone && !String(existing.phone || '').trim()) { db.prepare('UPDATE contacts SET phone = ? WHERE id = ?').run(phone, existing.id); filled.push('phone'); }
      if (email && !String(existing.email || '').trim()) { db.prepare('UPDATE contacts SET email = ? WHERE id = ?').run(email, existing.id); filled.push('email'); }
      outcome = { already_existed: true, filled_now: filled };
    } else {
      db.prepare('INSERT INTO contacts (property_id, role, name, phone, email, notes) VALUES (?, ?, ?, ?, ?, ?)').run(property.id, role, name, phone, email, notes);
      outcome = { already_existed: false };
    }
    touch(property.id);
    const all = db.prepare('SELECT role, name, phone, email FROM contacts WHERE property_id = ? ORDER BY id').all(property.id);
    return { ok: true, role, name, ...outcome, contacts_on_property: all.map((c) => ({ role: c.role, name: c.name, has_phone: !!c.phone, has_email: !!c.email })), link: propertyUrl(req, property.id) };
  }

  function saveNote(args, req) {
    const property = existingProperty(args.address);
    const title = cleanValue(args.title).slice(0, 100);
    if (!title) throw new Error('title is required');
    const lines = lineList(args.lines);
    if (!lines.length) throw new Error('lines is empty');
    const result = mergeNote(property.id, title, lines);
    touch(property.id);
    return { ok: true, ...result, link: propertyUrl(req, property.id) };
  }

  function setStatus(args, req) {
    const property = existingProperty(args.address);
    if (!statuses.includes(args.status)) throw new Error('Status must be one of: ' + statuses.join(', '));
    db.prepare("UPDATE properties SET status = ?, updated_at = datetime('now') WHERE id = ?").run(args.status, property.id);
    return { ok: true, previous: property.status, now: args.status, link: propertyUrl(req, property.id) };
  }

  function callTool(name, args, req) {
    const a = args && typeof args === 'object' ? args : {};
    try {
      let out;
      if (name === 'import_property') out = importProperty(a, req);
      else if (name === 'get_missing') out = getMissing(a, req);
      else if (name === 'set_field') out = setField(a, req);
      else if (name === 'add_contact') out = addContact(a, req);
      else if (name === 'save_note') out = saveNote(a, req);
      else if (name === 'set_status') out = setStatus(a, req);
      else return { content: [{ type: 'text', text: 'Unknown tool: ' + name }], isError: true };
      return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: 'Could not do that: ' + (err && err.message ? err.message : 'error') }], isError: true };
    }
  }

  // ----- JSON-RPC plumbing -----

  function handle(msg, req) {
    const hasId = msg && Object.prototype.hasOwnProperty.call(msg, 'id') && msg.id !== null;
    const reply = (result) => ({ jsonrpc: '2.0', id: msg.id, result });
    const fail = (code, message) => ({ jsonrpc: '2.0', id: hasId ? msg.id : null, error: { code, message } });

    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(-32600, 'Invalid request');
    if (!hasId) return null; // notifications (e.g. notifications/initialized) need no answer

    switch (msg.method) {
      case 'initialize': {
        const asked = msg.params && msg.params.protocolVersion;
        return reply({
          protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
          capabilities: { tools: {} },
          serverInfo: { name: 'listing-app', version: '1.0.0' },
          instructions:
            'This is David\'s personal listing-agent app. After finishing a property package: call import_property once with every data point that has a real value, ' +
            'then call get_missing and ask David in chat about the missing_important items, then save each answer with set_field. Never invent values, and leave unknown ones out.'
        });
      }
      case 'ping':
        return reply({});
      case 'tools/list':
        return reply({ tools: toolList() });
      case 'tools/call': {
        const p = msg.params || {};
        return reply(callTool(p.name, p.arguments, req));
      }
      default:
        return fail(-32601, 'Method not found');
    }
  }

  // ----- the door: /mcp/<secret> -----

  const failures = new Map(); // ip -> { count, resetAt }
  const WINDOW_MS = 15 * 60 * 1000;
  const MAX_FAILURES = 20;

  router.all('/:secret', (req, res) => {
    const secret = process.env.MCP_SECRET;
    const blocked = (() => {
      const e = failures.get(req.ip);
      return !!e && Date.now() <= e.resetAt && e.count >= MAX_FAILURES;
    })();
    if (blocked) return res.status(429).json({ error: 'Too many attempts' });

    if (!secret || secret.length < 24 || !safeEqual(req.params.secret, secret)) {
      const now = Date.now();
      if (failures.size > 1000) failures.clear();
      const e = failures.get(req.ip);
      if (!e || now > e.resetAt) failures.set(req.ip, { count: 1, resetAt: now + WINDOW_MS });
      else e.count += 1;
      return res.status(404).json({ error: 'Not found' });
    }

    if (req.method !== 'POST') {
      res.set('Allow', 'POST');
      return res.status(405).json({ error: 'Use POST' });
    }
    const body = req.body;
    if (body === undefined || body === null || typeof body !== 'object') {
      return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    }
    if (Array.isArray(body)) {
      const out = body.map((m) => handle(m, req)).filter(Boolean);
      return out.length ? res.json(out) : res.status(202).end();
    }
    const out = handle(body, req);
    return out ? res.json(out) : res.status(202).end();
  });

  router.use((req, res) => res.status(404).json({ error: 'Not found' }));
  return router;
};
