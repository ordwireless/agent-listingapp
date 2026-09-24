const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const db = require('./db');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const SESSION_DAYS = 90;

const app = express();
app.set('trust proxy', 1); // Railway terminates HTTPS in front of the app
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': [
      "default-src 'self'",
      "img-src 'self' data:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      'font-src https://fonts.gstatic.com',
      "script-src 'self'",
      "connect-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'"
    ].join('; ')
  });
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

const STATUSES = ['Preparing', 'Active', 'Under Contract', 'Closed'];
const DOC_TYPES = [
  'Listing Agreement', 'Contract', 'Seller Disclosure', 'Survey',
  'HOA Documents', 'Restrictive Covenants', 'Septic Permit', 'Inspection', 'Other'
];

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, db.uploadsDir),
    filename: (req, file, cb) => {
      const safeExt = path.extname(file.originalname).slice(0, 10);
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${safeExt}`);
    }
  }),
  limits: { fileSize: 20 * 1024 * 1024 }
});

// ----- Sign-in: random server-side sessions, rate-limited, constant-time password check -----

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function safeEqual(a, b) {
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(String(a)).digest(), crypto.createHash('sha256').update(String(b)).digest());
}

// Changing APP_PASSWORD changes this value, which signs out every existing session.
function passwordFingerprint() {
  return crypto.createHmac('sha256', 'agent-listingapp-fp').update(process.env.APP_PASSWORD).digest('hex');
}

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('INSERT INTO sessions (token_hash, pw_fp, expires_at) VALUES (?, ?, ?)')
    .run(sha256(token), passwordFingerprint(), Date.now() + SESSION_DAYS * 86400000);
  return token;
}

function sessionIsValid(token) {
  if (!token || typeof token !== 'string') return false;
  const row = db.prepare('SELECT pw_fp, expires_at FROM sessions WHERE token_hash = ?').get(sha256(token));
  return !!row && row.expires_at > Date.now() && row.pw_fp === passwordFingerprint();
}

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 8;
const loginFailures = new Map(); // ip -> { count, resetAt }

function loginBlocked(ip) {
  const entry = loginFailures.get(ip);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    loginFailures.delete(ip);
    return false;
  }
  return entry.count >= LOGIN_MAX_FAILURES;
}

function recordLoginFailure(ip) {
  const now = Date.now();
  if (loginFailures.size > 1000) loginFailures.clear();
  const entry = loginFailures.get(ip);
  if (!entry || now > entry.resetAt) loginFailures.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  else entry.count += 1;
}

function loginPageHtml(error) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent listing app — sign in</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f6f7f8;font-family:'Inter',-apple-system,sans-serif}
.card{background:#fff;border:1px solid #eceef1;border-radius:14px;padding:32px;width:100%;max-width:320px;box-shadow:0 1px 2px rgba(20,21,26,0.04)}
.mark{width:32px;height:32px;border-radius:8px;background:#1d4ed8;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600;margin-bottom:16px}
h1{font-size:17px;font-weight:600;margin:0 0 18px;color:#14151a}
input{width:100%;box-sizing:border-box;font:inherit;font-size:14px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:12px}
button{width:100%;font:inherit;font-size:14px;font-weight:600;padding:10px;border:none;border-radius:8px;background:#1d4ed8;color:#fff;cursor:pointer}
.err{color:#dc2626;font-size:13px;margin:-6px 0 12px}
</style>
</head>
<body>
<form class="card" method="POST" action="/login">
<div class="mark">AL</div>
<h1>Agent listing app</h1>
${error ? `<p class="err">${error}</p>` : ''}
<input type="password" name="password" placeholder="Password" autocomplete="current-password" autofocus>
<button type="submit">Sign in</button>
</form>
</body>
</html>`;
}

app.get('/healthz', (req, res) => {
  res.json({ ok: true, version: process.env.RAILWAY_GIT_COMMIT_SHA || 'local' });
});

app.get('/login', (req, res) => {
  res.type('html').send(loginPageHtml());
});

app.post('/login', express.urlencoded({ extended: false }), (req, res) => {
  if (loginBlocked(req.ip)) {
    return res.status(429).type('html').send(loginPageHtml('Too many attempts. Try again in 15 minutes.'));
  }
  const supplied = req.body && typeof req.body.password === 'string' ? req.body.password : '';
  if (!process.env.APP_PASSWORD || !safeEqual(supplied, process.env.APP_PASSWORD)) {
    recordLoginFailure(req.ip);
    return res.status(401).type('html').send(loginPageHtml('Wrong password. Try again.'));
  }
  loginFailures.delete(req.ip);
  res.cookie('session', createSession(), {
    httpOnly: true,
    secure: req.secure,
    maxAge: SESSION_DAYS * 86400000,
    sameSite: 'lax'
  });
  res.redirect('/');
});

// The gate. In production a missing APP_PASSWORD locks the app instead of opening it.
app.use((req, res, next) => {
  if (!process.env.APP_PASSWORD) {
    if (!IS_PRODUCTION) return next(); // local development only
    const message = 'The app is locked: APP_PASSWORD is not set on the server.';
    if (req.path.startsWith('/api/')) return res.status(503).json({ error: message });
    return res.status(503).type('text').send(message);
  }
  if (sessionIsValid(req.cookies && req.cookies.session)) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Not authenticated' });
  return res.redirect('/login');
});

app.post('/logout', (req, res) => {
  const token = req.cookies && req.cookies.session;
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  res.clearCookie('session');
  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, 'public')));

function getTemplate(propertyId) {
  const categories = propertyId
    ? db.prepare('SELECT * FROM categories WHERE property_id IS NULL OR property_id = ? ORDER BY sort_order').all(propertyId)
    : db.prepare('SELECT * FROM categories WHERE property_id IS NULL ORDER BY sort_order').all();
  const fields = propertyId
    ? db.prepare('SELECT * FROM fields WHERE property_id IS NULL OR property_id = ? ORDER BY sort_order').all(propertyId)
    : db.prepare('SELECT * FROM fields WHERE property_id IS NULL ORDER BY sort_order').all();
  return categories.map((cat) => ({
    ...cat,
    fields: fields.filter((f) => f.category_id === cat.id)
  }));
}

function slugify(label) {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field';
}

function uniqueFieldKey(categoryId, baseKey) {
  const exists = (k) => !!db.prepare('SELECT 1 FROM fields WHERE category_id = ? AND key = ?').get(categoryId, k);
  let key = baseKey;
  let n = 2;
  while (exists(key)) {
    key = `${baseKey}_${n}`;
    n += 1;
  }
  return key;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function summarizeProperty(property) {
  const template = getTemplate(property.id);
  const values = db
    .prepare('SELECT field_id, value FROM property_field_values WHERE property_id = ?')
    .all(property.id);
  const valueByFieldId = {};
  values.forEach((v) => { valueByFieldId[v.field_id] = v.value; });

  let missingCount = 0;
  let nextDate = null;
  let nextDateLabel = null;
  let overdueDate = null;
  let overdueLabel = null;
  let priceValue = null;
  const today = todayISO();

  template.forEach((cat) => {
    cat.fields.forEach((field) => {
      const val = valueByFieldId[field.id];
      if (field.important && (val === undefined || val === null || val === '')) {
        missingCount += 1;
      }
      if (field.field_type === 'date' && val) {
        if (val >= today && (nextDate === null || val < nextDate)) {
          nextDate = val;
          nextDateLabel = field.label;
        }
        if (field.important && val < today && property.status !== 'Closed') {
          if (overdueDate === null || val > overdueDate) {
            overdueDate = val;
            overdueLabel = field.label;
          }
        }
      }
      if (field.key === 'price' && val) {
        priceValue = val;
      }
    });
  });

  return {
    id: property.id,
    address: property.address,
    status: property.status,
    list_price: priceValue,
    archived: !!property.archived,
    missing_count: missingCount,
    next_date: nextDate,
    next_date_label: nextDateLabel,
    overdue_date: overdueDate,
    overdue_label: overdueLabel,
    photo_name: property.photo_name || null,
    updated_at: property.updated_at
  };
}

app.get('/api/template', (req, res) => {
  res.json(getTemplate());
});

app.get('/api/stats', (req, res) => {
  const rows = db.prepare('SELECT status, COUNT(*) AS n FROM properties WHERE archived = 0 GROUP BY status').all();
  const counts = { Preparing: 0, Active: 0, 'Under Contract': 0, Closed: 0 };
  rows.forEach((r) => { counts[r.status] = r.n; });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  res.json({ total, ...counts });
});

app.get('/api/properties', (req, res) => {
  const archived = req.query.archived === '1' ? 1 : 0;
  const rows = db.prepare('SELECT * FROM properties WHERE archived = ? ORDER BY created_at DESC').all(archived);
  res.json(rows.map(summarizeProperty));
});

app.post('/api/properties', (req, res) => {
  const address = (req.body.address || '').trim();
  if (!address) {
    return res.status(400).json({ error: 'Address is required' });
  }
  const info = db
    .prepare("INSERT INTO properties (address, status, updated_at) VALUES (?, ?, datetime('now'))")
    .run(address, 'Preparing');
  const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(summarizeProperty(property));
});

app.get('/api/properties/:id', (req, res) => {
  const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
  if (!property) return res.status(404).json({ error: 'Not found' });

  const template = getTemplate(property.id);
  const values = db
    .prepare('SELECT field_id, value FROM property_field_values WHERE property_id = ?')
    .all(property.id);
  const valueByFieldId = {};
  values.forEach((v) => { valueByFieldId[v.field_id] = v.value; });

  res.json({
    property: {
      id: property.id,
      address: property.address,
      status: property.status,
      list_price: property.list_price,
      archived: !!property.archived,
      photo_name: property.photo_name || null,
      updated_at: property.updated_at
    },
    template,
    values: valueByFieldId,
    statuses: STATUSES
  });
});

app.patch('/api/properties/:id', (req, res) => {
  const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
  if (!property) return res.status(404).json({ error: 'Not found' });

  if (req.body.status !== undefined && !STATUSES.includes(req.body.status)) {
    return res.status(400).json({ error: 'Status must be one of: ' + STATUSES.join(', ') });
  }
  const address = req.body.address !== undefined ? cleanText(req.body.address) : property.address;
  if (!address) return res.status(400).json({ error: 'Address is required' });

  const next = {
    address,
    status: req.body.status !== undefined ? req.body.status : property.status,
    list_price: req.body.list_price !== undefined ? cleanText(req.body.list_price) : property.list_price,
    archived: req.body.archived !== undefined ? (req.body.archived ? 1 : 0) : property.archived
  };

  db.prepare('UPDATE properties SET address = ?, status = ?, list_price = ?, archived = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
    next.address,
    next.status,
    next.list_price,
    next.archived,
    property.id
  );

  const updated = db.prepare('SELECT * FROM properties WHERE id = ?').get(property.id);
  res.json(summarizeProperty(updated));
});

app.put('/api/properties/:id/values/:fieldId', (req, res) => {
  const propertyId = Number(req.params.id);
  const fieldId = Number(req.params.fieldId);
  const property = db.prepare('SELECT id FROM properties WHERE id = ?').get(propertyId);
  const field = db.prepare('SELECT id FROM fields WHERE id = ?').get(fieldId);
  if (!property || !field) return res.status(404).json({ error: 'Not found' });

  const value = req.body.value === undefined ? '' : String(req.body.value);

  db.prepare(
    `INSERT INTO property_field_values (property_id, field_id, value) VALUES (?, ?, ?)
     ON CONFLICT(property_id, field_id) DO UPDATE SET value = excluded.value`
  ).run(propertyId, fieldId, value);
  db.prepare("UPDATE properties SET updated_at = datetime('now') WHERE id = ?").run(propertyId);

  res.json({ ok: true });
});

app.delete('/api/properties/:id', (req, res) => {
  const property = db.prepare('SELECT id, photo_name FROM properties WHERE id = ?').get(req.params.id);
  if (!property) return res.status(404).json({ error: 'Not found' });
  const docs = db.prepare('SELECT stored_name FROM documents WHERE property_id = ?').all(property.id);
  docs.forEach((d) => fs.unlink(path.join(db.uploadsDir, d.stored_name), () => {}));
  if (property.photo_name) fs.unlink(path.join(db.uploadsDir, property.photo_name), () => {});
  db.prepare('DELETE FROM documents WHERE property_id = ?').run(property.id);
  db.prepare('DELETE FROM property_field_values WHERE property_id = ?').run(property.id);
  db.prepare('DELETE FROM fields WHERE property_id = ?').run(property.id);
  db.prepare('DELETE FROM categories WHERE property_id = ?').run(property.id);
  db.prepare('DELETE FROM properties WHERE id = ?').run(property.id);
  res.json({ ok: true });
});

// ----- Property cover photo -----

// The file type is decided from the file's own bytes, never from the name or type the browser claims.
const IMAGE_SIGNATURES = {
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  png: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  gif: (b) => b.subarray(0, 4).toString('latin1') === 'GIF8',
  webp: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP'
};
const IMAGE_MIME = { jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };

function sniffImageType(filePath) {
  const buf = Buffer.alloc(12);
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, buf, 0, 12, 0);
  } finally {
    fs.closeSync(fd);
  }
  return Object.keys(IMAGE_SIGNATURES).find((type) => IMAGE_SIGNATURES[type](buf)) || null;
}

const photoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, db.uploadsDir),
    filename: (req, file, cb) => cb(null, `photo-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.upload`)
  }),
  limits: { fileSize: 12 * 1024 * 1024 }
});

app.post('/api/properties/:id/photo', photoUpload.single('photo'), (req, res) => {
  const property = db.prepare('SELECT id, photo_name FROM properties WHERE id = ?').get(req.params.id);
  if (!property) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(404).json({ error: 'Property not found' });
  }
  if (!req.file) return res.status(400).json({ error: 'Choose an image file' });

  const type = sniffImageType(req.file.path);
  if (!type) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'That file is not a JPEG, PNG, GIF or WebP image' });
  }
  const finalName = req.file.filename.replace(/\.upload$/, `.${type}`);
  fs.renameSync(req.file.path, path.join(db.uploadsDir, finalName));

  if (property.photo_name) fs.unlink(path.join(db.uploadsDir, property.photo_name), () => {});
  db.prepare("UPDATE properties SET photo_name = ?, updated_at = datetime('now') WHERE id = ?").run(finalName, property.id);
  res.json({ photo_name: finalName });
});

app.get('/api/properties/:id/photo', (req, res) => {
  const property = db.prepare('SELECT photo_name FROM properties WHERE id = ?').get(req.params.id);
  if (!property || !property.photo_name) return res.status(404).json({ error: 'No photo' });
  const type = path.extname(property.photo_name).slice(1);
  res.set({
    'Content-Type': IMAGE_MIME[type] || 'application/octet-stream',
    'Content-Disposition': 'inline',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    // The URL carries ?v=<file name>, so a replaced photo always gets a new URL and this can be cached hard.
    'Cache-Control': 'private, max-age=31536000, immutable'
  });
  res.sendFile(path.join(db.uploadsDir, property.photo_name));
});

app.delete('/api/properties/:id/photo', (req, res) => {
  const property = db.prepare('SELECT id, photo_name FROM properties WHERE id = ?').get(req.params.id);
  if (!property) return res.status(404).json({ error: 'Not found' });
  if (property.photo_name) fs.unlink(path.join(db.uploadsDir, property.photo_name), () => {});
  db.prepare("UPDATE properties SET photo_name = NULL, updated_at = datetime('now') WHERE id = ?").run(property.id);
  res.json({ ok: true });
});

// ----- Template editing: categories and fields -----

const FIELD_TYPES = ['text', 'long_text', 'date'];

app.post('/api/categories', (req, res) => {
  const title = (req.body.title || '').trim();
  if (!title) return res.status(400).json({ error: 'Category name is required' });

  const scope = req.body.scope === 'property' ? 'property' : 'all';
  const propertyId = scope === 'property' ? Number(req.body.property_id) || null : null;
  if (scope === 'property' && !propertyId) {
    return res.status(400).json({ error: 'property_id is required for a property-only category' });
  }

  const baseKey = slugify(title);
  let key = baseKey;
  let n = 2;
  while (db.prepare('SELECT 1 FROM categories WHERE key = ?').get(key)) {
    key = `${baseKey}_${n}`;
    n += 1;
  }
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM categories').get().m;

  const info = db.prepare('INSERT INTO categories (key, title, sort_order, property_id) VALUES (?, ?, ?, ?)')
    .run(key, title, maxOrder + 1, propertyId);
  res.status(201).json(db.prepare('SELECT * FROM categories WHERE id = ?').get(info.lastInsertRowid));
});

app.post('/api/categories/:id/fields', (req, res) => {
  const categoryId = Number(req.params.id);
  const category = db.prepare('SELECT id, property_id FROM categories WHERE id = ?').get(categoryId);
  if (!category) return res.status(404).json({ error: 'Category not found' });

  const label = (req.body.label || '').trim();
  if (!label) return res.status(400).json({ error: 'Field name is required' });

  // A property-only category can only hold property-only fields.
  let propertyId = category.property_id || null;
  if (!propertyId && req.body.scope === 'property') {
    propertyId = Number(req.body.property_id) || null;
    if (!propertyId) return res.status(400).json({ error: 'property_id is required for a property-only field' });
  }

  const fieldType = FIELD_TYPES.includes(req.body.field_type) ? req.body.field_type : 'text';
  const important = req.body.important ? 1 : 0;
  const key = uniqueFieldKey(categoryId, slugify(label));
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM fields WHERE category_id = ?').get(categoryId).m;

  const info = db.prepare(
    'INSERT INTO fields (category_id, key, label, field_type, important, sort_order, property_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(categoryId, key, label, fieldType, important, maxOrder + 1, propertyId);

  const field = db.prepare('SELECT * FROM fields WHERE id = ?').get(info.lastInsertRowid);
  if (propertyId) touchProperty(propertyId);
  res.status(201).json(field);
});

app.patch('/api/fields/:id', (req, res) => {
  const field = db.prepare('SELECT * FROM fields WHERE id = ?').get(req.params.id);
  if (!field) return res.status(404).json({ error: 'Not found' });

  const label = req.body.label !== undefined ? String(req.body.label).trim() : field.label;
  if (!label) return res.status(400).json({ error: 'Label is required' });
  const important = req.body.important !== undefined ? (req.body.important ? 1 : 0) : field.important;

  db.prepare('UPDATE fields SET label = ?, important = ? WHERE id = ?').run(label, important, field.id);
  res.json({ ok: true });
});

app.delete('/api/fields/:id', (req, res) => {
  const field = db.prepare('SELECT * FROM fields WHERE id = ?').get(req.params.id);
  if (!field) return res.status(404).json({ error: 'Not found' });
  if (field.key === 'price') {
    return res.status(400).json({ error: 'The price field is used on the property cards and cannot be removed' });
  }
  db.prepare('DELETE FROM property_field_values WHERE field_id = ?').run(field.id);
  db.prepare('DELETE FROM fields WHERE id = ?').run(field.id);
  res.json({ ok: true });
});

app.get('/api/document-types', (req, res) => {
  res.json(DOC_TYPES);
});

app.get('/api/properties/:id/documents', (req, res) => {
  const propertyId = Number(req.params.id);
  const rows = db.prepare('SELECT * FROM documents WHERE property_id = ? ORDER BY uploaded_at DESC').all(propertyId);
  res.json(rows);
});

app.post('/api/properties/:id/documents', upload.single('file'), (req, res) => {
  const propertyId = Number(req.params.id);
  const property = db.prepare('SELECT id FROM properties WHERE id = ?').get(propertyId);
  if (!property) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(404).json({ error: 'Property not found' });
  }
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const docType = DOC_TYPES.includes(req.body.doc_type) ? req.body.doc_type : 'Other';

  const info = db.prepare(
    'INSERT INTO documents (property_id, doc_type, original_name, stored_name, mime_type, size) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(propertyId, docType, req.file.originalname, req.file.filename, req.file.mimetype, req.file.size);

  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(doc);
});

app.get('/api/documents/:id/file', (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  res.download(path.join(db.uploadsDir, doc.stored_name), doc.original_name);
});

app.delete('/api/documents/:id', (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM documents WHERE id = ?').run(doc.id);
  fs.unlink(path.join(db.uploadsDir, doc.stored_name), () => {});
  res.json({ ok: true });
});

const CONTACT_ROLES = [
  'Seller', 'Buyer', 'Buyer Agent', 'Closing Attorney', 'Lender', 'HOA Contact', 'Contractor', 'Other'
];

function touchProperty(propertyId) {
  db.prepare("UPDATE properties SET updated_at = datetime('now') WHERE id = ?").run(propertyId);
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

app.get('/api/contact-roles', (req, res) => {
  res.json(CONTACT_ROLES);
});

app.get('/api/properties/:id/contacts', (req, res) => {
  const rows = db.prepare('SELECT * FROM contacts WHERE property_id = ? ORDER BY id').all(Number(req.params.id));
  res.json(rows);
});

app.post('/api/properties/:id/contacts', (req, res) => {
  const propertyId = Number(req.params.id);
  const property = db.prepare('SELECT id FROM properties WHERE id = ?').get(propertyId);
  if (!property) return res.status(404).json({ error: 'Property not found' });

  const name = cleanText(req.body.name);
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const role = CONTACT_ROLES.includes(req.body.role) ? req.body.role : 'Other';

  const info = db.prepare(
    'INSERT INTO contacts (property_id, role, name, phone, email, notes) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(propertyId, role, name, cleanText(req.body.phone), cleanText(req.body.email), cleanText(req.body.notes));
  touchProperty(propertyId);

  res.status(201).json(db.prepare('SELECT * FROM contacts WHERE id = ?').get(info.lastInsertRowid));
});

app.patch('/api/contacts/:id', (req, res) => {
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
  if (!contact) return res.status(404).json({ error: 'Not found' });

  const name = req.body.name !== undefined ? cleanText(req.body.name) : contact.name;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const role = req.body.role !== undefined && CONTACT_ROLES.includes(req.body.role) ? req.body.role : contact.role;
  const phone = req.body.phone !== undefined ? cleanText(req.body.phone) : contact.phone;
  const email = req.body.email !== undefined ? cleanText(req.body.email) : contact.email;
  const notes = req.body.notes !== undefined ? cleanText(req.body.notes) : contact.notes;

  db.prepare('UPDATE contacts SET role = ?, name = ?, phone = ?, email = ?, notes = ? WHERE id = ?')
    .run(role, name, phone, email, notes, contact.id);
  touchProperty(contact.property_id);

  res.json(db.prepare('SELECT * FROM contacts WHERE id = ?').get(contact.id));
});

app.delete('/api/contacts/:id', (req, res) => {
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
  if (!contact) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM contacts WHERE id = ?').run(contact.id);
  touchProperty(contact.property_id);
  res.json({ ok: true });
});

app.get('/api/properties/:id/notes', (req, res) => {
  const rows = db.prepare('SELECT * FROM notes WHERE property_id = ? ORDER BY id').all(Number(req.params.id));
  res.json(rows);
});

app.post('/api/properties/:id/notes', (req, res) => {
  const propertyId = Number(req.params.id);
  const property = db.prepare('SELECT id FROM properties WHERE id = ?').get(propertyId);
  if (!property) return res.status(404).json({ error: 'Property not found' });

  const title = cleanText(req.body.title);
  if (!title) return res.status(400).json({ error: 'Title is required' });

  const info = db.prepare('INSERT INTO notes (property_id, title, body) VALUES (?, ?, ?)')
    .run(propertyId, title, typeof req.body.body === 'string' ? req.body.body : '');
  touchProperty(propertyId);

  res.status(201).json(db.prepare('SELECT * FROM notes WHERE id = ?').get(info.lastInsertRowid));
});

app.patch('/api/notes/:id', (req, res) => {
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  if (!note) return res.status(404).json({ error: 'Not found' });

  const title = req.body.title !== undefined ? cleanText(req.body.title) : note.title;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  const body = typeof req.body.body === 'string' ? req.body.body : note.body;

  db.prepare("UPDATE notes SET title = ?, body = ?, updated_at = datetime('now') WHERE id = ?").run(title, body, note.id);
  touchProperty(note.property_id);

  res.json(db.prepare('SELECT * FROM notes WHERE id = ?').get(note.id));
});

app.delete('/api/notes/:id', (req, res) => {
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  if (!note) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM notes WHERE id = ?').run(note.id);
  touchProperty(note.property_id);
  res.json({ ok: true });
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'That file is too large' });
  }
  // Client mistakes from body parsing (too large, malformed JSON) are 4xx, not server errors.
  if (err && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.status === 413 ? 'That request is too large' : 'Bad request' });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

if (IS_PRODUCTION && !process.env.APP_PASSWORD) {
  console.error('WARNING: APP_PASSWORD is not set. The app will refuse all requests until it is configured.');
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`agent-listingapp listening on port ${port}`);
});
