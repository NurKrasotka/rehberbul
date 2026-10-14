'use strict';
const crypto = require('node:crypto');
const config = require('./config');
const { badRequest, unauthorized, conflict } = require('./errors');
const v = require('./validation');

const ITERATIONS = 120000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256').toString('hex');
  return `${ITERATIONS}:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [iter, salt, hash] = stored.split(':');
  const candidate = crypto.pbkdf2Sync(password, salt, Number(iter), 32, 'sha256');
  return crypto.timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, company: u.company || null };
}

function register(db, body) {
  const name = v.requireString(body.name, 'Ad soyad', { min: 2, max: 80 });
  const email = v.requireString(body.email, 'E-posta', { max: 120 }).toLowerCase();
  if (!EMAIL.test(email)) throw badRequest('E-posta adresi geçersiz');
  const password = v.requireString(body.password, 'Şifre', { min: 8, max: 128 });
  const role = v.requireOneOf(body.role, 'Rol', config.ROLES);
  const company = role === 'acenta' ? v.requireString(body.company, 'Acenta adı', { min: 2, max: 120 }) : null;
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw conflict('Bu e-posta ile kayıtlı bir hesap var');
  const r = db.prepare('INSERT INTO users (name, email, password_hash, role, company) VALUES (?, ?, ?, ?, ?)')
    .run(name, email, hashPassword(password), role, company);
  return createSession(db, Number(r.lastInsertRowid));
}

function login(db, body) {
  const email = String(body.email || '').trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !verifyPassword(String(body.password || ''), user.password_hash)) {
    throw unauthorized('E-posta veya şifre hatalı');
  }
  return createSession(db, user.id);
}

function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + config.SESSION_DAYS * 86400000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  return { token, user: publicUser(user) };
}

/** Authorization: Bearer <token> başlığından kullanıcıyı bulur; yoksa null. */
function userFromRequest(db, req) {
  const m = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '');
  if (!m) return null;
  const row = db.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ?`).get(m[1], new Date().toISOString());
  return row ? publicUser(row) : null;
}

function logout(db, req) {
  const m = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '');
  if (m) db.prepare('DELETE FROM sessions WHERE token = ?').run(m[1]);
}

module.exports = { hashPassword, verifyPassword, register, login, logout, userFromRequest, publicUser };
