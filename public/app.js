const app = document.getElementById('app');

// ---------- helpers ----------

function statusBadgeClass(status) {
  if (status === 'Active') return 'badge-active';
  if (status === 'Under Contract') return 'badge-undercontract';
  if (status === 'Closed') return 'badge-closed';
  return 'badge-preparing';
}

function statusTheme(status) {
  if (status === 'Active') return { tint: '#dff7fc', ink: '#0e7490' };
  if (status === 'Under Contract') return { tint: '#fff2c7', ink: '#854d0e' };
  if (status === 'Closed') return { tint: '#dcfce7', ink: '#166534' };
  return { tint: '#e5e7eb', ink: '#6b7280' };
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function daysBetween(fromISO, toISO) {
  const a = new Date(fromISO + 'T00:00:00');
  const b = new Date(toISO + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

function relativeDateLabel(iso) {
  if (!iso) return null;
  const diff = daysBetween(todayISO(), iso);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff > 1 && diff <= 13) return `In ${diff} days`;
  return formatDate(iso);
}

function timeAgo(iso) {
  if (!iso) return '';
  const then = new Date(iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(then.getTime())) return '';
  const diffMs = Date.now() - then.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Updated just now';
  if (mins < 60) return `Updated ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Updated ${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `Updated ${weeks}w ago`;
  return `Updated ${formatDate(then.toISOString().slice(0, 10))}`;
}

async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Request failed');
  }
  return res.json();
}

function navigate(hash) {
  window.location.hash = hash;
}

const ICONS = {
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  file: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/>',
  note: '<path d="M5 4h14v16H5z"/><path d="M8.5 9h7M8.5 13h7M8.5 17h4"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13.5" r="3.5"/>',
  custom: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  structure: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9h14v-9"/><path d="M9.5 19v-5h5v5"/>',
  systems: '<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/>',
  utilities: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/>',
  hoa: '<path d="M12 3 4 6.5V11c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V6.5L12 3Z"/>',
  dates: '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 9.5h17"/><path d="M8 3v4M16 3v4"/>',
  contacts: '<circle cx="9" cy="8.5" r="3.2"/><path d="M2.8 20c0-3.4 2.8-6 6.2-6s6.2 2.6 6.2 6"/><path d="M16.5 4.3a3.2 3.2 0 0 1 0 6.2M21.2 20c0-2.8-1.9-5.1-4.5-5.8"/>'
};

function iconSvg(key, cls) {
  const path = ICONS[key] || ICONS.custom;
  return `<svg class="${cls || 'icon'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

// Top bar: navy with a neon line. On a property page it carries the back button and the (editable) address.
function appbarHtml(opts) {
  if (opts && opts.back) {
    return `
      <header class="appbar">
        <div class="appbar-inner">
          <button type="button" class="appbar-back" id="back-btn" aria-label="Back to properties">${iconSvg('back')}</button>
          <button type="button" class="appbar-title" id="address-btn" data-raw-value="${escapeHtml(opts.title)}" title="Click to edit the address">${escapeHtml(opts.title)}</button>
        </div>
      </header>
    `;
  }
  return `
    <header class="appbar">
      <div class="appbar-inner">
        <span class="appbar-mark">AL</span>
        <span class="appbar-title static">${escapeHtml((opts && opts.title) || 'My properties')}</span>
      </div>
    </header>
  `;
}

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', render);

function render() {
  const hash = window.location.hash;
  const match = hash.match(/^#\/property\/(\d+)/);
  if (match) {
    renderPropertyPage(Number(match[1]));
  } else {
    renderHome();
  }
}

// ---------- Home ----------

let homeTab = 'active';

async function renderHome() {
  app.innerHTML = `
    ${appbarHtml({ title: 'My properties' })}
    <div class="page">
      <div class="stats" id="stats"></div>
      <div class="tabs">
        <button class="tab-btn ${homeTab === 'active' ? 'active' : ''}" data-tab="active">Active</button>
        <button class="tab-btn ${homeTab === 'archive' ? 'active' : ''}" data-tab="archive">Archive</button>
      </div>
      <div class="grid" id="cards"><p class="empty">Loading…</p></div>
      <button class="add-card" id="add-property-btn">+ Add property</button>
    </div>
  `;

  app.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      homeTab = btn.dataset.tab;
      renderHome();
    });
  });

  app.querySelector('#add-property-btn').addEventListener('click', addPropertyPrompt);

  fetchJSON('/api/stats')
    .then((stats) => {
      const statsEl = app.querySelector('#stats');
      if (!statsEl) return;
      statsEl.innerHTML = `
        <span class="stat-pill"><strong>${stats.total}</strong> total</span>
        <span class="stat-pill"><strong>${stats.Active}</strong> active</span>
        <span class="stat-pill"><strong>${stats['Under Contract']}</strong> under contract</span>
        <span class="stat-pill"><strong>${stats.Closed}</strong> closed</span>
      `;
    })
    .catch(() => {});

  const cardsEl = app.querySelector('#cards');
  try {
    const properties = await fetchJSON(`/api/properties?archived=${homeTab === 'archive' ? '1' : '0'}`);
    if (properties.length === 0) {
      cardsEl.innerHTML = `<p class="empty">${homeTab === 'archive' ? 'No archived properties.' : 'No properties yet. Add your first one below.'}</p>`;
      return;
    }
    cardsEl.innerHTML = properties.map(renderCard).join('');
    cardsEl.querySelectorAll('.card').forEach((el) => {
      el.addEventListener('click', () => navigate(`#/property/${el.dataset.id}`));
    });
  } catch (err) {
    cardsEl.innerHTML = `<p class="empty text-red">Could not load properties: ${escapeHtml(err.message)}</p>`;
  }
}

function renderCard(p) {
  const theme = statusTheme(p.status);
  const priceLine = p.list_price
    ? `<div class="card-price">${escapeHtml(p.list_price)}</div>`
    : `<div class="card-price muted">No price yet</div>`;

  let dateLine;
  if (p.overdue_date) {
    dateLine = `<div class="card-line text-red">Overdue: ${escapeHtml(p.overdue_label)} (${formatDate(p.overdue_date)})</div>`;
  } else if (p.next_date) {
    dateLine = `<div class="card-line card-ink">${escapeHtml(p.next_date_label)}: ${escapeHtml(relativeDateLabel(p.next_date))}</div>`;
  } else {
    dateLine = `<div class="card-line card-muted">No upcoming dates</div>`;
  }

  const missingLine = p.missing_count > 0
    ? `<div class="card-line text-red">${p.missing_count} item${p.missing_count === 1 ? '' : 's'} missing</div>`
    : `<div class="card-line text-green">Complete</div>`;

  const photo = p.photo_name
    ? `<img class="card-photo-img" src="${photoUrl(p.id, p.photo_name)}" alt="" loading="lazy">`
    : iconSvg('structure', 'card-photo-icon');

  return `
    <button class="card" data-id="${p.id}" type="button" style="--tint:${theme.tint};--card-ink:${theme.ink}">
      <div class="card-photo">
        ${photo}
        <span class="badge ${statusBadgeClass(p.status)}">${escapeHtml(p.status)}</span>
      </div>
      <div class="card-body">
        <div class="card-addr">${escapeHtml(p.address)}</div>
        ${priceLine}
        ${dateLine}
        ${missingLine}
        <div class="card-updated">${escapeHtml(timeAgo(p.updated_at))}</div>
      </div>
    </button>
  `;
}

function photoUrl(propertyId, photoName) {
  return `/api/properties/${propertyId}/photo?v=${encodeURIComponent(photoName)}`;
}

// Shrinks a phone photo before uploading (max 1280px, JPEG) so uploads stay small and fast.
async function shrinkImage(file, maxSide = 1280, quality = 0.85) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob || file;
  } catch (e) {
    return file; // format the browser can't decode: send the original
  }
}

async function addPropertyPrompt() {
  const address = window.prompt('Property address:');
  if (!address || !address.trim()) return;
  try {
    const property = await fetchJSON('/api/properties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: address.trim() })
    });
    navigate(`#/property/${property.id}`);
  } catch (err) {
    window.alert('Could not add property: ' + err.message);
  }
}

// ---------- Property page ----------

const collapsedCategories = {};
const expandedLongFields = {};

// Per-property UI state (reset when you open a different property).
let uiPropertyId = null;
let contactFormId = null; // 'new' | contact id | null
let expandedNotes = {};
let addFieldFor = null; // category id whose "add field" form is open
let editingFieldId = null; // field id whose editor is open
let addCategoryOpen = false;

function valueByKey(template, values, key) {
  for (const cat of template) {
    for (const f of cat.fields) {
      if (f.key === key) return values[f.id] || '';
    }
  }
  return '';
}

// Build the "Missing" and "Upcoming / Overdue" summary strip from the template + values.
function summaryStrip(property, template, values) {
  const today = todayISO();
  const missing = [];
  let next = null;
  let overdue = null;

  template.forEach((cat) => {
    cat.fields.forEach((f) => {
      const v = values[f.id];
      if (f.important && !v) missing.push(f.label);
      if (f.field_type === 'date' && v) {
        if (v >= today && (!next || v < next.date)) next = { date: v, label: f.label };
        if (f.important && v < today && property.status !== 'Closed') {
          if (!overdue || v > overdue.date) overdue = { date: v, label: f.label };
        }
      }
    });
  });

  const missingText = missing.length === 0
    ? 'Nothing missing'
    : missing.slice(0, 3).map(escapeHtml).join(' · ') + (missing.length > 3 ? ` · +${missing.length - 3} more` : '');

  const missingCard = missing.length === 0
    ? `<div class="strip-card strip-ok"><div class="strip-label">Missing</div><div class="strip-text">${missingText}</div></div>`
    : `<div class="strip-card strip-missing"><div class="strip-label">Missing</div><div class="strip-text">${missingText}</div></div>`;

  let dateCard;
  if (overdue) {
    dateCard = `<div class="strip-card strip-missing"><div class="strip-label">Overdue</div><div class="strip-text">${escapeHtml(overdue.label)} · ${escapeHtml(formatDate(overdue.date))}</div></div>`;
  } else if (next) {
    dateCard = `<div class="strip-card strip-upcoming"><div class="strip-label">Upcoming</div><div class="strip-text">${escapeHtml(next.label)} · ${escapeHtml(relativeDateLabel(next.date))}</div></div>`;
  } else {
    dateCard = `<div class="strip-card strip-none"><div class="strip-label">Upcoming</div><div class="strip-text">No upcoming dates</div></div>`;
  }

  return `<div class="strip">${missingCard}${dateCard}</div>`;
}

async function renderPropertyPage(id) {
  app.innerHTML = `${appbarHtml({ title: 'Loading…' })}<div class="page"><p class="empty">Loading…</p></div>`;

  if (uiPropertyId !== id) {
    uiPropertyId = id;
    contactFormId = null;
    expandedNotes = {};
    addFieldFor = null;
    editingFieldId = null;
    addCategoryOpen = false;
  }

  let data;
  let documents = [];
  let docTypes = [];
  let contacts = [];
  let contactRoles = [];
  let notes = [];
  try {
    [data, documents, docTypes, contacts, contactRoles, notes] = await Promise.all([
      fetchJSON(`/api/properties/${id}`),
      fetchJSON(`/api/properties/${id}/documents`),
      fetchJSON('/api/document-types'),
      fetchJSON(`/api/properties/${id}/contacts`),
      fetchJSON('/api/contact-roles'),
      fetchJSON(`/api/properties/${id}/notes`)
    ]);
  } catch (err) {
    app.innerHTML = `${appbarHtml({ title: 'Error' })}<div class="page"><p class="empty text-red">Could not load property: ${escapeHtml(err.message)}</p></div>`;
    return;
  }

  const { property, template, values, statuses } = data;

  const statusOptions = statuses
    .map((s) => `<option value="${s}" ${s === property.status ? 'selected' : ''}>${s}</option>`)
    .join('');

  const ctx = { status: property.status, today: todayISO() };
  // The old text-only "Contacts" category is replaced by the real Contacts section below.
  const visibleTemplate = template.filter((c) => c.key !== 'contacts');
  const categoriesHtml = visibleTemplate.map((cat, idx) => renderCategory(cat, values, idx, ctx)).join('');
  const price = valueByKey(template, values, 'price');
  const datesCat = visibleTemplate.find((c) => c.key === 'dates');

  const jumpChips = [
    ['top', 'Quick view'],
    datesCat ? [`cat-${datesCat.id}`, 'Dates'] : null,
    ['sec-contacts', 'Contacts'],
    ['sec-notes', 'Notes'],
    ['sec-docs', 'Documents']
  ].filter(Boolean);

  app.innerHTML = `
    ${appbarHtml({ back: true, title: property.address })}
    <div class="page" id="top">
      <div class="prop-head">
        <div class="prop-head-main">
          <div class="photo-thumb-wrap">
            <label class="photo-thumb ${property.photo_name ? 'has' : ''}" title="${property.photo_name ? 'Change photo' : 'Add a photo'}">
              ${property.photo_name
                ? `<img src="${photoUrl(property.id, property.photo_name)}" alt="Property photo">`
                : `${iconSvg('camera', 'photo-thumb-icon')}<span>Add photo</span>`}
              <input type="file" accept="image/*" id="photo-input" hidden>
            </label>
            ${property.photo_name ? '<button type="button" class="photo-remove" id="photo-remove-btn" aria-label="Remove photo">×</button>' : ''}
          </div>
          <div>
            <div class="prop-price ${price ? '' : 'muted'}">${price ? escapeHtml(price) : 'No price yet'}</div>
            <div class="prop-updated">${escapeHtml(timeAgo(property.updated_at))}</div>
          </div>
        </div>
        <div class="property-controls">
          <select class="status-select" id="status-select" aria-label="Listing status">${statusOptions}</select>
          <button class="archive-btn" id="archive-btn">${property.archived ? 'Unarchive' : 'Archive'}</button>
          <button class="delete-btn" id="delete-btn" aria-label="Delete property">Delete</button>
        </div>
      </div>

      ${summaryStrip(property, template, values)}

      <nav class="jump" aria-label="Jump to section">
        ${jumpChips.map(([target, label], i) => `<button type="button" class="jump-chip ${i === 0 ? 'active' : ''}" data-jump="${target}">${escapeHtml(label)}</button>`).join('')}
      </nav>

      <div id="categories">${categoriesHtml}</div>
      ${renderAddCategory()}

      ${renderContactsSection(contacts, contactRoles)}
      ${renderNotesSection(notes)}

      <div class="category" id="sec-docs" style="--accent:var(--cyan)">
        <div class="category-header static">
          <span class="category-title-wrap">${iconSvg('file', 'category-icon')}<span class="category-title">Documents</span></span>
        </div>
        <div class="category-body">
          <div id="documents-list">${renderDocumentsList(documents)}</div>
          <button type="button" class="add-field-btn" id="show-upload-btn">+ Add document</button>
          <div class="upload-row" id="upload-row" style="display:none">
            <select id="doc-type-select">${docTypes.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}</select>
            <input type="file" id="doc-file-input">
            <button type="button" class="upload-btn" id="doc-upload-btn">Upload</button>
          </div>
          <p class="upload-status" id="upload-status"></p>
        </div>
      </div>
    </div>
  `;

  app.querySelector('#back-btn').addEventListener('click', () => navigate('#/'));

  app.querySelector('#status-select').addEventListener('change', async (e) => {
    await fetchJSON(`/api/properties/${property.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: e.target.value })
    });
    rerenderPropertyPreservingScroll(property.id);
  });

  app.querySelector('#archive-btn').addEventListener('click', async () => {
    await fetchJSON(`/api/properties/${property.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: !property.archived })
    });
    navigate('#/');
  });

  app.querySelector('#delete-btn').addEventListener('click', async () => {
    const sure = window.confirm(`Delete "${property.address}" permanently? This cannot be undone.`);
    if (!sure) return;
    await fetchJSON(`/api/properties/${property.id}`, { method: 'DELETE' });
    navigate('#/');
  });

  wireTemplateEditing(property.id);

  app.querySelector('#photo-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const blob = await shrinkImage(file);
      const formData = new FormData();
      formData.append('photo', blob, 'photo.jpg');
      const res = await fetch(`/api/properties/${property.id}/photo`, { method: 'POST', body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Upload failed');
      }
    } catch (err) {
      window.alert('Could not upload the photo: ' + err.message);
    }
    rerenderPropertyPreservingScroll(property.id);
  });

  const photoRemove = app.querySelector('#photo-remove-btn');
  if (photoRemove) {
    photoRemove.addEventListener('click', async () => {
      if (!window.confirm('Remove this photo?')) return;
      await fetchJSON(`/api/properties/${property.id}/photo`, { method: 'DELETE' });
      rerenderPropertyPreservingScroll(property.id);
    });
  }

  app.querySelector('#address-btn').addEventListener('click', (e) => {
    startEditingAddress(e.currentTarget, property.id);
  });

  app.querySelector('#show-upload-btn').addEventListener('click', () => {
    app.querySelector('#upload-row').style.display = 'flex';
    app.querySelector('#show-upload-btn').style.display = 'none';
  });

  app.querySelector('#doc-upload-btn').addEventListener('click', () => uploadDocument(property.id));

  app.querySelectorAll('[data-jump]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const target = document.getElementById(chip.dataset.jump);
      if (!target) return;
      app.querySelectorAll('.jump-chip').forEach((c) => c.classList.toggle('active', c === chip));
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  wireContacts(property.id);
  wireNotes(property.id);
  wireDocumentDeletes(property.id);
  wireCategoryToggles(property.id);
  wireFieldEditing(property.id);
}

// ---------- Contacts ----------

const ROLE_TONE = {
  'Seller': 'cyan',
  'Buyer': 'amber',
  'Buyer Agent': 'amber',
  'Closing Attorney': 'cyan',
  'Lender': 'cyan'
};

function phoneHref(phone) {
  const digits = String(phone || '').replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : '';
}

function renderContactForm(contact, roles) {
  const c = contact || { role: 'Seller', name: '', phone: '', email: '', notes: '' };
  return `
    <form class="contact-form" data-contact-form="${contact ? contact.id : 'new'}">
      <div class="form-row">
        <select name="role" aria-label="Role">${roles.map((r) => `<option value="${escapeHtml(r)}" ${r === c.role ? 'selected' : ''}>${escapeHtml(r)}</option>`).join('')}</select>
        <input name="name" type="text" placeholder="Name" value="${escapeHtml(c.name)}" required>
      </div>
      <div class="form-row">
        <input name="phone" type="tel" placeholder="Phone" value="${escapeHtml(c.phone)}">
        <input name="email" type="email" placeholder="Email" value="${escapeHtml(c.email)}">
      </div>
      <textarea name="notes" placeholder="Notes (optional)">${escapeHtml(c.notes)}</textarea>
      <div class="form-actions">
        <button type="submit" class="upload-btn">Save</button>
        <button type="button" class="link-btn" data-cancel-contact>Cancel</button>
        ${contact ? `<button type="button" class="doc-delete-btn" data-delete-contact="${contact.id}">Delete</button>` : ''}
      </div>
    </form>
  `;
}

function renderContactRow(c, roles) {
  if (contactFormId === c.id) return renderContactForm(c, roles);
  const tone = ROLE_TONE[c.role] || 'gray';
  const href = phoneHref(c.phone);
  const meta = [
    c.phone ? `<a href="${href}">${escapeHtml(c.phone)}</a>` : '',
    c.email ? `<a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>` : ''
  ].filter(Boolean).join('');
  return `
    <div class="contact-row">
      <div class="contact-main">
        <span class="role-chip role-${tone}">${escapeHtml(c.role)}</span>
        <div class="contact-name">${escapeHtml(c.name)}</div>
        ${meta ? `<div class="contact-meta">${meta}</div>` : ''}
        ${c.notes ? `<div class="contact-notes">${escapeHtml(c.notes)}</div>` : ''}
      </div>
      ${href ? `<a class="call-btn" href="${href}" aria-label="Call ${escapeHtml(c.name)}">${iconSvg('phone')}</a>` : ''}
      <button type="button" class="link-btn" data-edit-contact="${c.id}">Edit</button>
    </div>
  `;
}

function renderContactsSection(contacts, roles) {
  const rows = contacts.length === 0 && contactFormId !== 'new'
    ? '<p class="empty" style="padding:8px 0">No contacts yet.</p>'
    : contacts.map((c) => renderContactRow(c, roles)).join('');
  const footer = contactFormId === 'new'
    ? renderContactForm(null, roles)
    : '<button type="button" class="add-field-btn" id="add-contact-btn">+ Add contact</button>';
  return `
    <div class="category" id="sec-contacts" style="--accent:var(--amber)">
      <div class="category-header static">
        <span class="category-title-wrap">${iconSvg('contacts', 'category-icon')}<span class="category-title">Contacts</span></span>
      </div>
      <div class="category-body">${rows}${footer}</div>
    </div>
  `;
}

function wireContacts(propertyId) {
  const addBtn = app.querySelector('#add-contact-btn');
  if (addBtn) addBtn.addEventListener('click', () => { contactFormId = 'new'; rerenderPropertyPreservingScroll(propertyId); });

  app.querySelectorAll('[data-edit-contact]').forEach((btn) => {
    btn.addEventListener('click', () => { contactFormId = Number(btn.dataset.editContact); rerenderPropertyPreservingScroll(propertyId); });
  });

  app.querySelectorAll('[data-cancel-contact]').forEach((btn) => {
    btn.addEventListener('click', () => { contactFormId = null; rerenderPropertyPreservingScroll(propertyId); });
  });

  app.querySelectorAll('[data-delete-contact]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Delete this contact?')) return;
      await fetchJSON(`/api/contacts/${btn.dataset.deleteContact}`, { method: 'DELETE' });
      contactFormId = null;
      rerenderPropertyPreservingScroll(propertyId);
    });
  });

  app.querySelectorAll('.contact-form').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      const id = form.dataset.contactForm;
      try {
        if (id === 'new') {
          await fetchJSON(`/api/properties/${propertyId}/contacts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
        } else {
          await fetchJSON(`/api/contacts/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
        }
        contactFormId = null;
      } catch (err) {
        window.alert('Could not save contact: ' + err.message);
        return;
      }
      rerenderPropertyPreservingScroll(propertyId);
    });
  });
}

// ---------- Notes ----------

function renderNotesSection(notes) {
  const cards = notes.length === 0
    ? '<p class="empty" style="padding:8px 0">No notes yet.</p>'
    : notes.map((n) => {
      const open = !!expandedNotes[n.id];
      return `
        <div class="note-card">
          <button type="button" class="note-head" data-note-toggle="${n.id}" aria-expanded="${open}">
            <span class="note-title">${escapeHtml(n.title)}</span>
            <span class="note-toggle">${open ? 'Close' : 'Open'}</span>
          </button>
          ${open ? `
            <div class="note-body">
              <textarea data-note-body="${n.id}" placeholder="Write here…">${escapeHtml(n.body)}</textarea>
              <div class="note-actions">
                <button type="button" class="link-btn" data-note-rename="${n.id}" data-note-title="${escapeHtml(n.title)}">Rename</button>
                <button type="button" class="doc-delete-btn" data-note-delete="${n.id}">Delete</button>
              </div>
            </div>` : ''}
        </div>
      `;
    }).join('');
  return `
    <div class="category" id="sec-notes" style="--accent:var(--amber)">
      <div class="category-header static">
        <span class="category-title-wrap">${iconSvg('note', 'category-icon')}<span class="category-title">Notes</span></span>
      </div>
      <div class="category-body">${cards}<button type="button" class="add-field-btn" id="add-note-btn">+ New note</button></div>
    </div>
  `;
}

function wireNotes(propertyId) {
  app.querySelector('#add-note-btn').addEventListener('click', async () => {
    const title = window.prompt('Note title:');
    if (!title || !title.trim()) return;
    try {
      const note = await fetchJSON(`/api/properties/${propertyId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), body: '' })
      });
      expandedNotes[note.id] = true;
    } catch (err) {
      window.alert('Could not add note: ' + err.message);
    }
    rerenderPropertyPreservingScroll(propertyId);
  });

  app.querySelectorAll('[data-note-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.noteToggle;
      expandedNotes[id] = !expandedNotes[id];
      rerenderPropertyPreservingScroll(propertyId);
    });
  });

  // Saves quietly (no re-render) so a click on Rename/Delete right after typing is not lost.
  app.querySelectorAll('[data-note-body]').forEach((ta) => {
    ta.addEventListener('blur', async () => {
      try {
        await fetchJSON(`/api/notes/${ta.dataset.noteBody}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: ta.value })
        });
      } catch (err) {
        window.alert('Could not save note: ' + err.message);
      }
    });
  });

  app.querySelectorAll('[data-note-rename]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const next = window.prompt('Rename this note:', btn.dataset.noteTitle || '');
      if (!next || !next.trim()) return;
      try {
        await fetchJSON(`/api/notes/${btn.dataset.noteRename}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: next.trim() })
        });
      } catch (err) {
        window.alert('Could not rename note: ' + err.message);
      }
      rerenderPropertyPreservingScroll(propertyId);
    });
  });

  app.querySelectorAll('[data-note-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Delete this note?')) return;
      await fetchJSON(`/api/notes/${btn.dataset.noteDelete}`, { method: 'DELETE' });
      rerenderPropertyPreservingScroll(propertyId);
    });
  });
}

function startEditingAddress(btn, propertyId) {
  const rawValue = btn.dataset.rawValue || '';
  const input = document.createElement('input');
  input.className = 'appbar-input';
  input.type = 'text';
  input.value = rawValue;
  btn.replaceWith(input);
  input.focus();
  input.select();

  const commit = async () => {
    const next = input.value.trim();
    if (next && next !== rawValue) {
      await fetchJSON(`/api/properties/${propertyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: next })
      });
    }
    renderPropertyPage(propertyId);
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') { input.value = rawValue; input.blur(); }
  });
}

function checkboxHtml(name, checked, label) {
  return `<label class="check"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}> ${escapeHtml(label)}</label>`;
}

function fieldEditorHtml(field) {
  const shared = !field.property_id;
  return `
    <form class="field-editor" data-field-editor="${field.id}">
      <input name="label" type="text" value="${escapeHtml(field.label)}" placeholder="Field name" required aria-label="Field name">
      ${checkboxHtml('important', field.important, 'Important — show under Missing when empty')}
      <div class="form-actions">
        <button type="submit" class="upload-btn">Save</button>
        <button type="button" class="link-btn" data-cancel-form>Cancel</button>
        ${field.key === 'price' ? '' : `<button type="button" class="doc-delete-btn" data-remove-field="${field.id}" data-remove-label="${escapeHtml(field.label)}" data-remove-shared="${shared ? '1' : ''}">Remove</button>`}
      </div>
    </form>
  `;
}

function addFieldFormHtml(cat) {
  return `
    <form class="field-editor" data-add-field-form="${cat.id}">
      <input name="label" type="text" placeholder="Field name (e.g. Generator)" required aria-label="Field name">
      <div class="form-row">
        <select name="field_type" aria-label="Field type">
          <option value="text">Short text</option>
          <option value="long_text">Long text</option>
          <option value="date">Date</option>
        </select>
        ${cat.property_id
          ? '<span class="form-hint">This category belongs to this property only.</span>'
          : `<select name="scope" aria-label="Applies to">
              <option value="all">All properties</option>
              <option value="property">This property only</option>
            </select>`}
      </div>
      ${checkboxHtml('important', false, 'Important — show under Missing when empty')}
      <div class="form-actions">
        <button type="submit" class="upload-btn">Add field</button>
        <button type="button" class="link-btn" data-cancel-form>Cancel</button>
      </div>
    </form>
  `;
}

function renderAddCategory() {
  if (!addCategoryOpen) {
    return '<button class="add-category-btn" id="add-category-btn">+ Add category</button>';
  }
  return `
    <form class="field-editor add-category-form" id="add-category-form">
      <input name="title" type="text" placeholder="Category name (e.g. Pool)" required aria-label="Category name">
      <select name="scope" aria-label="Applies to">
        <option value="all">All properties</option>
        <option value="property">This property only</option>
      </select>
      <div class="form-actions">
        <button type="submit" class="upload-btn">Add category</button>
        <button type="button" class="link-btn" data-cancel-form>Cancel</button>
      </div>
    </form>
  `;
}

function renderCategory(cat, values, idx, ctx) {
  const isCollapsed = !!collapsedCategories[cat.id];
  const rows = cat.fields
    .map((field) => (editingFieldId === field.id ? fieldEditorHtml(field) : renderFieldRow(field, values[field.id], ctx)))
    .join('');
  const footer = addFieldFor === cat.id
    ? addFieldFormHtml(cat)
    : `<button type="button" class="add-field-btn" data-add-field-cat="${cat.id}">+ Add field</button>`;
  const accent = idx % 2 === 0 ? 'var(--cyan)' : 'var(--amber)';

  return `
    <div class="category" id="cat-${cat.id}" data-cat-id="${cat.id}" style="--accent:${accent}">
      <button class="category-header" data-cat-id="${cat.id}" type="button" aria-expanded="${isCollapsed ? 'false' : 'true'}">
        <span class="category-title-wrap">
          ${iconSvg(cat.key, 'category-icon')}
          <span class="category-title">${escapeHtml(cat.title)}</span>
        </span>
        <span class="category-toggle">${isCollapsed ? 'Show' : 'Hide'}</span>
      </button>
      <div class="category-body" style="${isCollapsed ? 'display:none' : ''}">
        ${rows}
        ${footer}
      </div>
    </div>
  `;
}

// Colors a date value: past = done (green), close = red, further out = amber, past-due deadline = red.
function dateChipClass(field, value, ctx) {
  const diff = daysBetween(ctx.today, value);
  if (diff < 0) {
    return field.important && ctx.status !== 'Closed' ? 'chip-red' : 'chip-green';
  }
  return diff <= 3 ? 'chip-red' : 'chip-amber';
}

function renderFieldRow(field, rawValue, ctx) {
  const value = rawValue || '';
  const isLong = field.field_type === 'long_text';

  if (!isLong) {
    const isDate = field.field_type === 'date';
    let display;
    let extra = '';
    if (!value) {
      display = field.important ? 'Unknown' : '—';
      if (field.important) extra = 'empty';
    } else if (isDate) {
      const diff = daysBetween(ctx.today, value);
      const rel = diff >= 0 && diff <= 13 ? ` · ${relativeDateLabel(value).toLowerCase()}` : '';
      display = escapeHtml(formatDate(value) || value) + escapeHtml(rel);
      extra = `chip-date ${dateChipClass(field, value, ctx)}`;
    } else {
      display = escapeHtml(value);
    }
    const inputType = isDate ? 'date' : 'text';
    return `
      <div class="field-row">
        <button type="button" class="field-label-btn" data-edit-field="${field.id}" title="Click to rename or remove this field">${escapeHtml(field.label)}</button>
        <button type="button" class="field-value ${extra}" data-field-id="${field.id}" data-field-type="${inputType}" data-raw-value="${escapeHtml(value)}">${display}</button>
      </div>
    `;
  }

  const isExpanded = !!expandedLongFields[field.id];
  const preview = value ? escapeHtml(value.length > 30 ? value.slice(0, 30) + '…' : value) : (field.important ? 'Unknown' : '—');
  const emptyClass = !value && field.important ? 'empty' : '';

  return `
    <div class="long-row" data-field-id="${field.id}">
      <div class="long-top">
        <button type="button" class="field-label-btn" data-long-toggle="${field.id}">${escapeHtml(field.label)}</button>
        <button type="button" class="field-value ${emptyClass}" data-field-id="${field.id}" data-field-type="text" data-raw-value="${escapeHtml(value)}">${preview}</button>
      </div>
      ${isExpanded ? `<div class="long-full"><textarea data-field-id="${field.id}" data-field-type="long_text" placeholder="Full details…">${escapeHtml(value)}</textarea><button type="button" class="link-btn" data-edit-field="${field.id}">Edit field</button></div>` : ''}
    </div>
  `;
}

async function rerenderPropertyPreservingScroll(propertyId) {
  const scrollY = window.scrollY;
  await renderPropertyPage(propertyId);
  window.scrollTo(0, scrollY);
}

function wireCategoryToggles(propertyId) {
  app.querySelectorAll('.category-header[data-cat-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const catId = btn.dataset.catId;
      collapsedCategories[catId] = !collapsedCategories[catId];
      rerenderPropertyPreservingScroll(propertyId);
    });
  });

  app.querySelectorAll('[data-long-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const fieldId = btn.dataset.longToggle;
      expandedLongFields[fieldId] = !expandedLongFields[fieldId];
      rerenderPropertyPreservingScroll(propertyId);
    });
  });

}

// Add / edit / remove fields and categories (the master checklist), all inline — no pop-up boxes.
function wireTemplateEditing(propertyId) {
  const rerender = () => rerenderPropertyPreservingScroll(propertyId);
  const closeForms = () => { addFieldFor = null; editingFieldId = null; addCategoryOpen = false; };
  const send = (url, method, body) => fetchJSON(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  app.querySelectorAll('[data-edit-field]').forEach((btn) => {
    btn.addEventListener('click', () => { closeForms(); editingFieldId = Number(btn.dataset.editField); rerender(); });
  });

  app.querySelectorAll('[data-add-field-cat]').forEach((btn) => {
    btn.addEventListener('click', () => { closeForms(); addFieldFor = Number(btn.dataset.addFieldCat); rerender(); });
  });

  const addCategoryBtn = app.querySelector('#add-category-btn');
  if (addCategoryBtn) addCategoryBtn.addEventListener('click', () => { closeForms(); addCategoryOpen = true; rerender(); });

  app.querySelectorAll('[data-cancel-form]').forEach((btn) => {
    btn.addEventListener('click', () => { closeForms(); rerender(); });
  });

  app.querySelectorAll('[data-remove-field]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const label = btn.dataset.removeLabel;
      const shared = !!btn.dataset.removeShared;
      const question = shared
        ? `Remove "${label}" from ALL properties? Anything already entered for it will be deleted.`
        : `Remove "${label}" from this property?`;
      if (!window.confirm(question)) return;
      try {
        await fetchJSON(`/api/fields/${btn.dataset.removeField}`, { method: 'DELETE' });
        closeForms();
      } catch (err) {
        window.alert('Could not remove the field: ' + err.message);
        return;
      }
      rerender();
    });
  });

  app.querySelectorAll('form[data-field-editor]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await send(`/api/fields/${form.dataset.fieldEditor}`, 'PATCH', {
          label: form.elements.label.value,
          important: form.elements.important.checked
        });
        closeForms();
      } catch (err) {
        window.alert('Could not save the field: ' + err.message);
        return;
      }
      rerender();
    });
  });

  app.querySelectorAll('form[data-add-field-form]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await send(`/api/categories/${form.dataset.addFieldForm}/fields`, 'POST', {
          label: form.elements.label.value,
          field_type: form.elements.field_type.value,
          scope: form.elements.scope ? form.elements.scope.value : 'property',
          important: form.elements.important.checked,
          property_id: propertyId
        });
        closeForms();
      } catch (err) {
        window.alert('Could not add the field: ' + err.message);
        return;
      }
      rerender();
    });
  });

  const addCategoryForm = app.querySelector('#add-category-form');
  if (addCategoryForm) {
    addCategoryForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await send('/api/categories', 'POST', {
          title: addCategoryForm.elements.title.value,
          scope: addCategoryForm.elements.scope.value,
          property_id: propertyId
        });
        closeForms();
      } catch (err) {
        window.alert('Could not add the category: ' + err.message);
        return;
      }
      rerender();
    });
  }
}

function wireFieldEditing(propertyId) {
  app.querySelectorAll('.field-value').forEach((span) => {
    span.addEventListener('click', () => startEditingField(span, propertyId));
  });

  app.querySelectorAll('textarea[data-field-id]').forEach((textarea) => {
    textarea.addEventListener('blur', () => saveFieldValue(propertyId, textarea.dataset.fieldId, textarea.value));
  });
}

function startEditingField(span, propertyId) {
  const fieldId = span.dataset.fieldId;
  const type = span.dataset.fieldType;
  const rawValue = span.dataset.rawValue || '';

  const input = document.createElement('input');
  input.type = type === 'date' ? 'date' : 'text';
  input.value = rawValue;
  span.replaceWith(input);
  input.focus();
  if (input.type === 'date' && typeof input.showPicker === 'function') {
    try { input.showPicker(); } catch (e) { /* not supported here, fall back to native tap */ }
  }

  const commit = () => saveFieldValue(propertyId, fieldId, input.value);
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') { input.value = rawValue; input.blur(); }
  });
}

async function saveFieldValue(propertyId, fieldId, value) {
  try {
    await fetchJSON(`/api/properties/${propertyId}/values/${fieldId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    });
  } catch (err) {
    window.alert('Could not save: ' + err.message);
  }
  rerenderPropertyPreservingScroll(propertyId);
}

// ---------- Documents ----------

function formatBytes(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function renderDocumentsList(documents) {
  if (documents.length === 0) {
    return '<p class="empty" style="padding:8px 0">No documents yet.</p>';
  }
  return documents.map((d) => `
    <div class="doc-row">
      ${iconSvg('file', 'doc-icon')}
      <div class="doc-info">
        <a class="doc-name" href="/api/documents/${d.id}/file" target="_blank" rel="noopener">${escapeHtml(d.original_name)}</a>
        <div class="doc-meta">${escapeHtml(d.doc_type)} · ${formatBytes(d.size)} · ${escapeHtml(formatDate(d.uploaded_at.slice(0, 10)) || '')}</div>
      </div>
      <button type="button" class="doc-delete-btn" data-doc-id="${d.id}" aria-label="Delete document">Delete</button>
    </div>
  `).join('');
}

function wireDocumentDeletes(propertyId) {
  app.querySelectorAll('.doc-delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const sure = window.confirm('Delete this document?');
      if (!sure) return;
      await fetchJSON(`/api/documents/${btn.dataset.docId}`, { method: 'DELETE' });
      rerenderPropertyPreservingScroll(propertyId);
    });
  });
}

async function uploadDocument(propertyId) {
  const fileInput = app.querySelector('#doc-file-input');
  const typeSelect = app.querySelector('#doc-type-select');
  const statusEl = app.querySelector('#upload-status');
  const file = fileInput.files[0];
  if (!file) {
    statusEl.textContent = 'Choose a file first.';
    statusEl.className = 'upload-status text-red';
    return;
  }
  statusEl.textContent = 'Uploading…';
  statusEl.className = 'upload-status';

  const formData = new FormData();
  formData.append('doc_type', typeSelect.value);
  formData.append('file', file);

  try {
    const res = await fetch(`/api/properties/${propertyId}/documents`, { method: 'POST', body: formData });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Upload failed');
    }
    rerenderPropertyPreservingScroll(propertyId);
  } catch (err) {
    statusEl.textContent = 'Could not upload: ' + err.message;
    statusEl.className = 'upload-status text-red';
  }
}
