'use strict';
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('turist','acenta','rehber')),
  company       TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS guides (
  user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  license_no   TEXT NOT NULL,
  city         TEXT NOT NULL,
  languages    TEXT NOT NULL,          -- JSON dizi
  specialties  TEXT NOT NULL,          -- JSON dizi
  daily_rate   INTEGER NOT NULL CHECK (daily_rate > 0),
  max_group    INTEGER NOT NULL DEFAULT 20 CHECK (max_group > 0),
  experience   INTEGER NOT NULL DEFAULT 0 CHECK (experience >= 0),
  bio          TEXT NOT NULL DEFAULT '',
  rating_sum   INTEGER NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS unavailable_days (
  guide_id INTEGER NOT NULL REFERENCES guides(user_id) ON DELETE CASCADE,
  day      TEXT NOT NULL,
  PRIMARY KEY (guide_id, day)
);
CREATE TABLE IF NOT EXISTS bookings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  guide_id    INTEGER NOT NULL REFERENCES guides(user_id),
  customer_id INTEGER NOT NULL REFERENCES users(id),
  start_date  TEXT NOT NULL,
  end_date    TEXT NOT NULL,
  group_size  INTEGER NOT NULL CHECK (group_size > 0),
  note        TEXT NOT NULL DEFAULT '',
  total_price INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'beklemede'
              CHECK (status IN ('beklemede','onaylandi','reddedildi','iptal','tamamlandi')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (start_date <= end_date)
);
CREATE INDEX IF NOT EXISTS idx_bookings_guide ON bookings(guide_id, status, start_date);
CREATE TABLE IF NOT EXISTS reviews (
  booking_id INTEGER PRIMARY KEY REFERENCES bookings(id),
  guide_id   INTEGER NOT NULL REFERENCES guides(user_id),
  author_id  INTEGER NOT NULL REFERENCES users(id),
  rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

function open(path = config.DB_PATH) {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

/** Fonksiyonu tek bir işlem (transaction) içinde çalıştırır. */
function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { open, transaction };
