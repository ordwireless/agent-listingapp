const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'app.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL
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
`);

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

module.exports = db;
