const path = require('path');
const express = require('express');
const db = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const STATUSES = ['Preparing', 'Active', 'Under Contract', 'Closed'];

function getTemplate() {
  const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order').all();
  const fields = db.prepare('SELECT * FROM fields ORDER BY sort_order').all();
  return categories.map((cat) => ({
    ...cat,
    fields: fields.filter((f) => f.category_id === cat.id)
  }));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function summarizeProperty(property) {
  const template = getTemplate();
  const values = db
    .prepare('SELECT field_id, value FROM property_field_values WHERE property_id = ?')
    .all(property.id);
  const valueByFieldId = {};
  values.forEach((v) => { valueByFieldId[v.field_id] = v.value; });

  let missingCount = 0;
  let nextDate = null;
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
    next_date: nextDate
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
    .prepare('INSERT INTO properties (address, status) VALUES (?, ?)')
    .run(address, 'Preparing');
  const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(summarizeProperty(property));
});

app.get('/api/properties/:id', (req, res) => {
  const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
  if (!property) return res.status(404).json({ error: 'Not found' });

  const template = getTemplate();
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
      archived: !!property.archived
    },
    template,
    values: valueByFieldId,
    statuses: STATUSES
  });
});

app.patch('/api/properties/:id', (req, res) => {
  const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(req.params.id);
  if (!property) return res.status(404).json({ error: 'Not found' });

  const next = {
    address: req.body.address !== undefined ? req.body.address : property.address,
    status: req.body.status !== undefined ? req.body.status : property.status,
    list_price: req.body.list_price !== undefined ? req.body.list_price : property.list_price,
    archived: req.body.archived !== undefined ? (req.body.archived ? 1 : 0) : property.archived
  };

  db.prepare('UPDATE properties SET address = ?, status = ?, list_price = ?, archived = ? WHERE id = ?').run(
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

  res.json({ ok: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`agent-listingapp listening on port ${port}`);
});
