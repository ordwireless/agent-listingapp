const app = document.getElementById('app');

function statusBadgeClass(status) {
  if (status === 'Active') return 'badge-active';
  if (status === 'Under Contract') return 'badge-undercontract';
  if (status === 'Closed') return 'badge-closed';
  return 'badge-preparing';
}

function statusStripeColor(status) {
  if (status === 'Active') return '#1d4ed8';
  if (status === 'Under Contract') return '#c2600b';
  if (status === 'Closed') return '#157a3c';
  return '#c9cbd1';
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
  const today = new Date().toISOString().slice(0, 10);
  const diff = daysBetween(today, iso);
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

function topbarHtml() {
  return `
    <div class="topbar">
      <div class="topbar-mark">AL</div>
      <span class="topbar-name">Agent listing app</span>
    </div>
  `;
}

const CATEGORY_ICONS = {
  structure: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9h14v-9"/><path d="M9.5 19v-5h5v5"/>',
  systems: '<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/>',
  utilities: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/>',
  hoa: '<path d="M12 3 4 6.5V11c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V6.5L12 3Z"/>',
  dates: '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 9.5h17"/><path d="M8 3v4M16 3v4"/>',
  contacts: '<circle cx="9" cy="8.5" r="3.2"/><path d="M2.8 20c0-3.4 2.8-6 6.2-6s6.2 2.6 6.2 6"/><path d="M16.5 4.3a3.2 3.2 0 0 1 0 6.2M21.2 20c0-2.8-1.9-5.1-4.5-5.8"/>'
};

function categoryIconSvg(key) {
  const path = CATEGORY_ICONS[key] || CATEGORY_ICONS.dates;
  return `<svg class="category-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
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
    <div class="page">
      ${topbarHtml()}
      <p class="eyebrow">HOME</p>
      <h1>Properties</h1>
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
  const priceLine = p.list_price
    ? `<div class="card-price">${escapeHtml(p.list_price)}</div>`
    : `<div class="card-price muted">No price yet</div>`;

  let dateLine;
  if (p.overdue_date) {
    dateLine = `<div class="card-line text-red">Overdue: ${escapeHtml(p.overdue_label)} (${formatDate(p.overdue_date)})</div>`;
  } else if (p.next_date) {
    const rel = relativeDateLabel(p.next_date);
    const soon = daysBetween(new Date().toISOString().slice(0, 10), p.next_date) <= 3;
    dateLine = `<div class="card-line ${soon ? 'text-orange' : ''}">${escapeHtml(p.next_date_label)}: ${rel}</div>`;
  } else {
    dateLine = `<div class="card-line">No upcoming dates</div>`;
  }

  const missingLine = p.missing_count > 0
    ? `<div class="card-line text-red">${p.missing_count} item${p.missing_count === 1 ? '' : 's'} missing</div>`
    : `<div class="card-line text-green">Complete</div>`;

  return `
    <button class="card" data-id="${p.id}" type="button" style="--stripe:${statusStripeColor(p.status)}">
      <div class="card-top">
        <div class="card-addr-wrap">
          ${p.missing_count > 0 ? '<span class="missing-dot"></span>' : ''}
          <span class="card-addr">${escapeHtml(p.address)}</span>
        </div>
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

// ---------- Property quick view ----------

const collapsedCategories = {};
const expandedLongFields = {};

async function renderPropertyPage(id) {
  app.innerHTML = `<div class="page">${topbarHtml()}<p class="empty">Loading…</p></div>`;

  let data;
  try {
    data = await fetchJSON(`/api/properties/${id}`);
  } catch (err) {
    app.innerHTML = `<div class="page">${topbarHtml()}<p class="empty text-red">Could not load property: ${escapeHtml(err.message)}</p></div>`;
    return;
  }

  const { property, template, values, statuses } = data;

  const statusOptions = statuses
    .map((s) => `<option value="${s}" ${s === property.status ? 'selected' : ''}>${s}</option>`)
    .join('');

  const categoriesHtml = template.map((cat) => renderCategory(cat, values, property.id)).join('');

  app.innerHTML = `
    <div class="page">
      ${topbarHtml()}
      <button class="back-link" id="back-btn">&larr; Back to properties</button>
      <div class="property-header">
        <div>
          <p class="eyebrow">QUICK VIEW</p>
          <button type="button" class="property-title" id="address-btn" data-raw-value="${escapeHtml(property.address)}">${escapeHtml(property.address)}</button>
          <div class="property-updated">${escapeHtml(timeAgo(property.updated_at))}</div>
        </div>
        <div class="property-controls">
          <select class="status-select" id="status-select">${statusOptions}</select>
          <button class="archive-btn" id="archive-btn">${property.archived ? 'Unarchive' : 'Archive'}</button>
        </div>
      </div>
      <div id="categories">${categoriesHtml}</div>
      <button class="add-category-btn" id="add-category-btn">+ Add category</button>
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

  app.querySelector('#add-category-btn').addEventListener('click', () => {
    window.alert('Adding new categories to the template is coming next — for now the checklist is fixed.');
  });

  app.querySelector('#address-btn').addEventListener('click', (e) => {
    startEditingAddress(e.target, property.id);
  });

  wireCategoryToggles(property.id);
  wireFieldEditing(property.id);
}

function startEditingAddress(btn, propertyId) {
  const rawValue = btn.dataset.rawValue || '';
  const input = document.createElement('input');
  input.className = 'property-title-input';
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

function renderCategory(cat, values, propertyId) {
  const isCollapsed = !!collapsedCategories[cat.id];
  const rows = cat.fields.map((field) => renderFieldRow(field, values[field.id], propertyId)).join('');

  return `
    <div class="category" data-cat-id="${cat.id}">
      <button class="category-header" data-cat-id="${cat.id}" type="button">
        <span class="category-title-wrap">
          ${categoryIconSvg(cat.key)}
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

function renderFieldRow(field, rawValue, propertyId) {
  const value = rawValue || '';
  const isLong = field.field_type === 'long_text';

  if (!isLong) {
    const display = value ? escapeHtml(field.field_type === 'date' ? (formatDate(value) || value) : value)
      : (field.important ? 'Unknown' : '—');
    const emptyClass = !value && field.important ? 'empty' : '';
    const inputType = field.field_type === 'date' ? 'date' : 'text';
    return `
      <div class="field-row">
        <button type="button" class="field-label-btn" data-rename-field="${field.id}" data-current-label="${escapeHtml(field.label)}">${escapeHtml(field.label)}</button>
        <button type="button" class="field-value ${emptyClass}" data-field-id="${field.id}" data-field-type="${inputType}" data-raw-value="${escapeHtml(value)}">${display}</button>
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
  app.querySelectorAll('.category-header').forEach((btn) => {
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
