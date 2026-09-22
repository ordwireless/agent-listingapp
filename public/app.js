const app = document.getElementById('app');

function statusBadgeClass(status) {
  if (status === 'Active') return 'badge-active';
  if (status === 'Under Contract') return 'badge-undercontract';
  if (status === 'Closed') return 'badge-closed';
  return 'badge-preparing';
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
  const priceLine = p.list_price ? escapeHtml(p.list_price) : '<span style="color:#9ca3af">No price yet</span>';
  const nextLine = p.next_date ? `Next: ${formatDate(p.next_date)}` : 'Next: —';
  const missingLine = p.missing_count > 0
    ? `<span class="text-red">${p.missing_count} item${p.missing_count === 1 ? '' : 's'} missing</span>`
    : '<span class="text-green">Complete</span>';

  return `
    <button class="card" data-id="${p.id}" type="button">
      <div class="card-top">
        <span class="card-addr">${escapeHtml(p.address)}</span>
        <span class="badge ${statusBadgeClass(p.status)}">${escapeHtml(p.status)}</span>
      </div>
      <div class="card-price">${priceLine}</div>
      <div class="card-line">${nextLine}</div>
      <div class="card-line">${missingLine}</div>
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
  app.innerHTML = `<div class="page"><p class="empty">Loading…</p></div>`;

  let data;
  try {
    data = await fetchJSON(`/api/properties/${id}`);
  } catch (err) {
    app.innerHTML = `<div class="page"><p class="empty text-red">Could not load property: ${escapeHtml(err.message)}</p></div>`;
    return;
  }

  const { property, template, values, statuses } = data;

  const statusOptions = statuses
    .map((s) => `<option value="${s}" ${s === property.status ? 'selected' : ''}>${s}</option>`)
    .join('');

  const categoriesHtml = template.map((cat) => renderCategory(cat, values, property.id)).join('');

  app.innerHTML = `
    <div class="page">
      <button class="back-link" id="back-btn">&larr; Back to properties</button>
      <div class="property-header">
        <div>
          <p class="eyebrow">QUICK VIEW</p>
          <h1 style="margin-bottom:4px">${escapeHtml(property.address)}</h1>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
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

  wireCategoryToggles(property.id);
  wireFieldEditing(property.id);
}

function renderCategory(cat, values, propertyId) {
  const isCollapsed = !!collapsedCategories[cat.id];
  const rows = cat.fields.map((field) => renderFieldRow(field, values[field.id], propertyId)).join('');

  return `
    <div class="category" data-cat-id="${cat.id}">
      <button class="category-header" data-cat-id="${cat.id}" type="button">
        <span class="category-title">${escapeHtml(cat.title)}</span>
        <span class="category-toggle">${isCollapsed ? 'Show' : 'Hide'}</span>
      </button>
      <div class="category-body" style="${isCollapsed ? 'display:none' : ''}">
        ${rows}
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
        <span class="field-label">${escapeHtml(field.label)}</span>
        <button type="button" class="field-value ${emptyClass}" data-field-id="${field.id}" data-field-type="${inputType}" data-raw-value="${escapeHtml(value)}">${display}</button>
      </div>
    `;
  }

  const isExpanded = !!expandedLongFields[field.id];
  const preview = value ? escapeHtml(value.length > 40 ? value.slice(0, 40) + '…' : value) : (field.important ? 'Unknown' : '—');

  return `
    <div class="long-row" data-field-id="${field.id}">
      <div class="long-top">
        <span class="field-label">${escapeHtml(field.label)}</span>
        <div style="display:flex;align-items:center;gap:6px;min-width:0">
          <span class="long-preview">${preview}</span>
          <button class="expand-btn" data-long-toggle="${field.id}" type="button">${isExpanded ? 'Collapse' : 'Expand'}</button>
        </div>
      </div>
      ${isExpanded ? `<div class="long-full"><textarea data-field-id="${field.id}" data-field-type="long_text">${escapeHtml(value)}</textarea></div>` : ''}
    </div>
  `;
}

function wireCategoryToggles(propertyId) {
  app.querySelectorAll('.category-header').forEach((btn) => {
    btn.addEventListener('click', () => {
      const catId = btn.dataset.catId;
      collapsedCategories[catId] = !collapsedCategories[catId];
      renderPropertyPage(propertyId);
    });
  });

  app.querySelectorAll('[data-long-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const fieldId = btn.dataset.longToggle;
      expandedLongFields[fieldId] = !expandedLongFields[fieldId];
      renderPropertyPage(propertyId);
    });
  });
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
  renderPropertyPage(propertyId);
}
