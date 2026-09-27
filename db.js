const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const uploadsDir = path.join(dataDir, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const db = new Database(path.join(dataDir, 'app.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const contactsTableExisted = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'contacts'").get();

db.exec(`
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  property_id INTEGER REFERENCES properties(id)
);

CREATE TABLE IF NOT EXISTS fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text',
  important INTEGER NOT NULL DEFAULT 0,
  property_id INTEGER REFERENCES properties(id),
  sort_order INTEGER NOT NULL,
  UNIQUE(category_id, key)
);

CREATE TABLE IF NOT EXISTS properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Preparing',
  list_price TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  photo_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS property_field_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  field_id INTEGER NOT NULL REFERENCES fields(id),
  value TEXT,
  UNIQUE(property_id, field_id)
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime_type TEXT,
  size INTEGER,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'Other',
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  pw_fp TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// One-time migration: names typed into the old text-only "Contacts" category become real contact records.
if (!contactsTableExisted) {
  const roleForLabel = {
    'Seller': 'Seller',
    'Buyer': 'Buyer',
    'Closing attorney': 'Closing Attorney',
    'Lender': 'Lender',
    'HOA': 'HOA Contact'
  };
  const oldValues = db.prepare(`
    SELECT pfv.property_id AS property_id, f.label AS label, pfv.value AS value
    FROM property_field_values pfv
    JOIN fields f ON f.id = pfv.field_id
    JOIN categories c ON c.id = f.category_id
    WHERE c.key = 'contacts' AND pfv.value IS NOT NULL AND TRIM(pfv.value) <> ''
    ORDER BY pfv.property_id, f.sort_order
  `).all();
  const insertContact = db.prepare('INSERT INTO contacts (property_id, role, name) VALUES (?, ?, ?)');
  oldValues.forEach((row) => {
    insertContact.run(row.property_id, roleForLabel[row.label] || 'Other', row.value.trim());
  });
}

// Migration: add updated_at to properties created before this column existed.
const propertyColumns = db.prepare("PRAGMA table_info(properties)").all().map((c) => c.name);
if (!propertyColumns.includes('updated_at')) {
  db.exec("ALTER TABLE properties ADD COLUMN updated_at TEXT");
  db.exec("UPDATE properties SET updated_at = created_at WHERE updated_at IS NULL");
}

const fieldColumns = db.prepare("PRAGMA table_info(fields)").all().map((c) => c.name);
if (!fieldColumns.includes('property_id')) {
  db.exec("ALTER TABLE fields ADD COLUMN property_id INTEGER REFERENCES properties(id)");
}

if (!propertyColumns.includes('photo_name')) {
  db.exec("ALTER TABLE properties ADD COLUMN photo_name TEXT");
}

const categoryColumns = db.prepare("PRAGMA table_info(categories)").all().map((c) => c.name);
if (!categoryColumns.includes('property_id')) {
  db.exec("ALTER TABLE categories ADD COLUMN property_id INTEGER REFERENCES properties(id)");
}

// Seed the master template once, on first run only.
const categoryCount = db.prepare('SELECT COUNT(*) AS n FROM categories').get().n;
if (categoryCount === 0) {
  const insertCategory = db.prepare('INSERT INTO categories (key, title, sort_order) VALUES (?, ?, ?)');
  const insertField = db.prepare(
    'INSERT INTO fields (category_id, key, label, field_type, important, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const template = [
    {
      key: 'structure',
      title: 'Structure',
      fields: [
        ['price', 'Price', 'money', 1],
        ['beds_baths', 'Beds / baths', 'text', 1],
        ['sqft', 'Sq ft', 'text', 1],
        ['year_built', 'Year built', 'text', 1],
        ['foundation', 'Foundation', 'text', 0],
        ['construction', 'Construction', 'text', 0],
        ['major_updates', 'Major updates', 'long_text', 0]
      ]
    },
    {
      key: 'systems',
      title: 'Systems',
      fields: [
        ['roof', 'Roof', 'text', 1],
        ['hvac_unit_1', 'HVAC unit 1', 'text', 1],
        ['hvac_unit_2', 'HVAC unit 2', 'text', 0],
        ['water_heater', 'Water heater', 'text', 1],
        ['fireplace', 'Fireplace', 'text', 0]
      ]
    },
    {
      key: 'utilities',
      title: 'Utilities',
      fields: [
        ['water', 'Water', 'text', 0],
        ['sewer', 'Sewer', 'text', 0],
        ['gas', 'Gas', 'text', 0]
      ]
    },
    {
      key: 'hoa',
      title: 'HOA and legal',
      fields: [
        ['hoa', 'HOA', 'text', 0],
        ['restrictive_covenants', 'Restrictive covenants', 'long_text', 0],
        ['flood_zone', 'Flood zone', 'text', 0]
      ]
    },
    {
      key: 'dates',
      title: 'Dates',
      fields: [
        ['listing_agreement_signed', 'Listing agreement signed (exclusive)', 'date', 0],
        ['otp_contract_date', 'OTP / contract date', 'date', 0],
        ['dd_fee_received', 'DD fee received', 'date', 0],
        ['dd_period_ends', 'DD period ends', 'date', 1],
        ['inspection', 'Inspection', 'date', 0],
        ['appraisal', 'Appraisal', 'date', 0],
        ['closing', 'Closing', 'date', 1]
      ]
    },
    {
      key: 'contacts',
      title: 'Contacts',
      fields: [
        ['seller', 'Seller', 'text', 0],
        ['buyer', 'Buyer', 'text', 0],
        ['closing_attorney', 'Closing attorney', 'text', 0],
        ['lender', 'Lender', 'text', 0],
        ['hoa_contact', 'HOA', 'text', 0]
      ]
    }
  ];

  template.forEach((cat, catIndex) => {
    const { lastInsertRowid: categoryId } = insertCategory.run(cat.key, cat.title, catIndex);
    cat.fields.forEach((f, fieldIndex) => {
      const [key, label, fieldType, important] = f;
      insertField.run(categoryId, key, label, fieldType, important, fieldIndex);
    });
  });
}

// One-time additions to the master checklist. Each runs once and is recorded, so a field you later
// remove is not put back on the next start.
db.exec('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY)');

const migrationErrors = []; // shown on the signed-in /api/system page

// Runs atomically. A failing migration is logged and skipped (tried again next start) instead of stopping the app.
function runOnce(name, work) {
  if (db.prepare('SELECT 1 FROM migrations WHERE name = ?').get(name)) return;
  db.exec('BEGIN');
  try {
    work();
    db.prepare('INSERT INTO migrations (name) VALUES (?)').run(name);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    migrationErrors.push({ name, error: String(err && err.message ? err.message : err) });
    console.error(`Migration "${name}" failed and was rolled back:`, err);
  }
}

function freeFieldKey(categoryId, base) {
  let key = base;
  let n = 2;
  while (db.prepare('SELECT 1 FROM fields WHERE category_id = ? AND key = ?').get(categoryId, key)) {
    key = `${base}_${n}`;
    n += 1;
  }
  return key;
}

// Adds a shared field to a category, placed after the first of `afterKeys` that exists (or at the end).
function addSharedField(categoryKey, afterKeys, key, label) {
  const category = db.prepare('SELECT id FROM categories WHERE key = ?').get(categoryKey);
  if (!category) return;
  if (db.prepare('SELECT 1 FROM fields WHERE category_id = ? AND key = ?').get(category.id, key)) return;
  let position = null;
  for (const afterKey of afterKeys) {
    const row = db.prepare('SELECT sort_order FROM fields WHERE category_id = ? AND key = ?').get(category.id, afterKey);
    if (row) { position = row.sort_order + 1; break; }
  }
  if (position === null) {
    position = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM fields WHERE category_id = ?').get(category.id).n;
  }
  db.prepare('UPDATE fields SET sort_order = sort_order + 1 WHERE category_id = ? AND sort_order >= ?').run(category.id, position);
  db.prepare('INSERT INTO fields (category_id, key, label, field_type, important, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
    .run(category.id, key, label, 'text', 0, position);
}

// A combined "Rooms" field was added and then dropped again: Bedrooms and Bathrooms cover it.
runOnce('remove_rooms_field', () => {
  const category = db.prepare("SELECT id FROM categories WHERE key = 'structure'").get();
  if (!category) return;
  const field = db.prepare("SELECT id FROM fields WHERE category_id = ? AND key = 'rooms' AND property_id IS NULL").get(category.id);
  if (!field) return;
  db.prepare('DELETE FROM property_field_values WHERE field_id = ?').run(field.id);
  db.prepare('DELETE FROM fields WHERE id = ?').run(field.id);
});
runOnce('add_bathrooms_field', () => addSharedField('structure', ['rooms', 'beds_baths'], 'bathrooms', 'Bathrooms'));

// "Beds / baths" becomes two separate fields. Values like "4 / 3" are split into Bedrooms = 4 and
// Bathrooms = 3; anything else stays in Bedrooms as it was typed, for you to fix by hand.
runOnce('split_beds_baths', () => {
  const category = db.prepare("SELECT id FROM categories WHERE key = 'structure'").get();
  if (!category) return;
  const combined = db.prepare("SELECT id, label FROM fields WHERE category_id = ? AND key = 'beds_baths'").get(category.id);
  if (!combined) return; // already removed or renamed by hand

  addSharedField('structure', ['beds_baths'], 'bathrooms', 'Bathrooms'); // no-op when it already exists
  const bathrooms = db.prepare("SELECT id FROM fields WHERE category_id = ? AND key = 'bathrooms'").get(category.id);

  // If someone already made their own "Bedrooms" field, this one gets a free key instead of clashing with it.
  db.prepare('UPDATE fields SET key = ?, label = ? WHERE id = ?')
    .run(freeFieldKey(category.id, 'bedrooms'), combined.label === 'Beds / baths' ? 'Bedrooms' : combined.label, combined.id);
  db.prepare('UPDATE fields SET important = 1 WHERE id = ?').run(bathrooms.id); // the combined field was important

  const rows = db.prepare(
    "SELECT property_id, value FROM property_field_values WHERE field_id = ? AND TRIM(COALESCE(value, '')) <> ''"
  ).all(combined.id);
  const setValue = db.prepare(
    `INSERT INTO property_field_values (property_id, field_id, value) VALUES (?, ?, ?)
     ON CONFLICT(property_id, field_id) DO UPDATE SET value = excluded.value`
  );
  const bathroomValue = db.prepare('SELECT value FROM property_field_values WHERE property_id = ? AND field_id = ?');
  rows.forEach((row) => {
    const match = row.value.match(/^\s*(\d+(?:\.\d+)?)\s*[/,\-x&]\s*(\d+(?:\.\d+)?)\s*$/i);
    if (!match) return;
    setValue.run(row.property_id, combined.id, match[1]);
    const existing = bathroomValue.get(row.property_id, bathrooms.id);
    if (!existing || !String(existing.value || '').trim()) setValue.run(row.property_id, bathrooms.id, match[2]);
  });
});

module.exports = db;
module.exports.uploadsDir = uploadsDir;
module.exports.migrationErrors = migrationErrors;
