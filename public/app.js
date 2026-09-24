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
  structure: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9h14v-9"/><path d="M9.5 19v-5h5v5"/>',
  systems: '<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/>',
  utilities: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/>',
  hoa: '<path d="M12 3 4 6.5V11c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V6.5L12 3Z"/>',
  dates: '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 9.5h17"/><path d="M8 3v4M16 3v4"/>',
  contacts: '<circle cx="9" cy="8.5" r="3.2"/><path d="M2.8 20c0-3.4 2.8-6 6.2-6s6.2 2.6 6.2 6"/><path d="M16.5 4.3a3.2 3.2 0 0 1 0 6.2M21.2 20c0-2.8-1.9-5.1-4.5-5.8"/>'
};

function iconSvg(key, cls) {
  const path = ICONS[key] || ICONS.dates;
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

  return `
    <button class="card" data-id="${p.id}" type="button" style="--tint:${theme.tint};--card-ink:${theme.ink}">
      <div class="card-top">
        <span class="card-addr">${escapeHtml(p.address)}</span>
        <span class="badge ${statusBadgeClass(p.status)}">${escapeHtml(p.status)}</span>
      </div>
      ${priceLine}
      ${dateLine}
      ${missingLine}
      <div class="card-updated">${escapeHtml(timeAgo(p.updated_at))}</div>
    </button>
  `;
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

  let data;
  let documents = [];
  let docTypes = [];
  try {
    [data, documents, docTypes] = await Promise.all([
      fetchJSON(`/api/properties/${id}`),
      fetchJSON(`/api/properties/${id}/documents`),
      fetchJSON('/api/document-types')
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
  const categoriesHtml = template.map((cat, idx) => renderCategory(cat, values, idx, ctx)).join('');
  const price = valueByKey(template, values, 'price');
  const datesCat = template.find((c) => c.key === 'dates');

  const jumpChips = [
    ['top', 'Quick view'],
    datesCat ? [`cat-${datesCat.id}`, 'Dates'] : null,
    ['sec-docs', 'Documents']
  ].filter(Boolean);

  app.innerHTML = `
    ${appbarHtml({ back: true, title: property.address })}
    <div class="page" id="top">
      <div class="prop-head">
        <div>
          <div class="prop-price ${price ? '' : 'muted'}">${price ? escapeHtml(price) : 'No price yet'}</div>
          <div class="prop-updated">${escapeHtml(timeAgo(property.updated_at))}</div>
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
      <button class="add-category-btn" id="add-category-btn">+ Add category</button>

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

  app.querySelector('#add-category-btn').addEventListener('click', () => {
    window.alert('Adding new categories to the template is coming next — for now the checklist is fixed.');
  });

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

  wireDocumentDeletes(property.id);
  wireCategoryToggles(property.id);
  wireFieldEditing(property.id);
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

function renderCategory(cat, values, idx, ctx) {
  const isCollapsed = !!collapsedCategories[cat.id];
  const rows = cat.fields.map((field) => renderFieldRow(field, values[field.id], ctx)).join('');
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
        <button type="button" class="add-field-btn" data-add-field-cat="${cat.id}">+ Add field</button>
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
        <button type="button" class="field-label-btn" data-rename-field="${field.id}" data-current-label="${escapeHtml(field.label)}">${escapeHtml(field.label)}</button>
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
      ${isExpanded ? `<div class="long-full"><textarea data-field-id="${field.id}" data-field-type="long_text" placeholder="Full details…">${escapeHtml(value)}</textarea></div>` : ''}
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

  app.querySelectorAll('[data-rename-field]').forEach((btn) => {
    btn.addEventListener('click', () => renameField(btn, propertyId));
  });

  app.querySelectorAll('[data-add-field-cat]').forEach((btn) => {
    btn.addEventListener('click', () => addFieldPrompt(btn.dataset.addFieldCat, propertyId));
  });
}

async function renameField(btn, propertyId) {
  const fieldId = btn.dataset.renameField;
  const current = btn.dataset.currentLabel || '';
  const next = window.prompt('Rename this field:', current);
  if (!next || !next.trim() || next.trim() === current) return;
  try {
    await fetchJSON(`/api/fields/${fieldId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: next.trim() })
    });
  } catch (err) {
    window.alert('Could not rename field: ' + err.message);
  }
  rerenderPropertyPreservingScroll(propertyId);
}

async function addFieldPrompt(categoryId, propertyId) {
  const label = window.prompt('New field name:');
  if (!label || !label.trim()) return;
  const forAll = window.confirm(
    'Add to ALL properties (this property\'s shared checklist)?\n\nOK = all properties\nCancel = this property only'
  );
  try {
    await fetchJSON(`/api/categories/${categoryId}/fields`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: label.trim(),
        scope: forAll ? 'all' : 'property',
        property_id: propertyId
      })
    });
  } catch (err) {
    window.alert('Could not add field: ' + err.message);
  }
  rerenderPropertyPreservingScroll(propertyId);
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
