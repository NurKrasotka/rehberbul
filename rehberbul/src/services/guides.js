'use strict';
const config = require('../config');
const v = require('../validation');
const { badRequest, forbidden, notFound } = require('../errors');

function toGuide(row) {
  return {
    id: row.user_id,
    name: row.name,
    licenseNo: row.license_no,
    city: row.city,
    languages: JSON.parse(row.languages),
    specialties: JSON.parse(row.specialties),
    dailyRate: row.daily_rate,
    maxGroup: row.max_group,
    experience: row.experience,
    bio: row.bio,
    rating: row.rating_count ? Math.round((row.rating_sum / row.rating_count) * 10) / 10 : null,
    ratingCount: row.rating_count,
  };
}

const BASE_SELECT = 'SELECT g.*, u.name FROM guides g JOIN users u ON u.id = g.user_id';

function upsertProfile(db, user, body) {
  if (user.role !== 'rehber') throw forbidden('Yalnızca rehber hesapları profil oluşturabilir');
  const licenseNo = v.requireString(body.licenseNo, 'Ruhsat (kokart) numarası', { min: 3, max: 30 });
  const city = v.requireOneOf(body.city, 'Şehir', config.CITIES);
  const languages = v.requireSubset(body.languages, 'Diller', config.LANGUAGES);
  const specialties = v.requireSubset(body.specialties, 'Uzmanlık alanları', config.SPECIALTIES);
  const dailyRate = v.requireInt(body.dailyRate, 'Günlük ücret', { min: 1, max: 100000 });
  const maxGroup = v.requireInt(body.maxGroup ?? 20, 'Maksimum grup', { min: 1, max: 200 });
  const experience = v.requireInt(body.experience ?? 0, 'Deneyim yılı', { min: 0, max: 60 });
  const bio = typeof body.bio === 'string' ? body.bio.trim().slice(0, 1000) : '';
  db.prepare(`
    INSERT INTO guides (user_id, license_no, city, languages, specialties, daily_rate, max_group, experience, bio)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      license_no = excluded.license_no, city = excluded.city, languages = excluded.languages,
      specialties = excluded.specialties, daily_rate = excluded.daily_rate, max_group = excluded.max_group,
      experience = excluded.experience, bio = excluded.bio`)
    .run(user.id, licenseNo, city, JSON.stringify(languages), JSON.stringify(specialties),
      dailyRate, maxGroup, experience, bio);
  return getGuide(db, user.id);
}

function getGuide(db, id) {
  const row = db.prepare(`${BASE_SELECT} WHERE g.user_id = ?`).get(Number(id));
  if (!row) throw notFound('Rehber bulunamadı');
  const guide = toGuide(row);
  guide.reviews = db.prepare(
    `SELECT r.rating, r.comment, r.created_at AS createdAt, u.name AS author
     FROM reviews r JOIN users u ON u.id = r.author_id
     WHERE r.guide_id = ? ORDER BY r.created_at DESC LIMIT 20`).all(guide.id).map((r) => ({ ...r }));
  guide.unavailableDays = db.prepare(
    'SELECT day FROM unavailable_days WHERE guide_id = ? AND day >= ? ORDER BY day')
    .all(guide.id, new Date().toISOString().slice(0, 10)).map((r) => r.day);
  return guide;
}

/** Rehber verilen tarih aralığında müsait mi? (kapalı gün veya onaylı rezervasyon çakışması yok) */
function isAvailable(db, guideId, start, end, { ignoreBookingId = 0 } = {}) {
  const closed = db.prepare(`SELECT 1 FROM unavailable_days
    WHERE guide_id = ? AND day BETWEEN ? AND ? LIMIT 1`)
    .get(guideId, start, end);
  if (closed) return false;
  const overlap = db.prepare(`SELECT 1 FROM bookings
    WHERE guide_id = ? AND status = 'onaylandi' AND id <> ?
      AND start_date <= ? AND end_date >= ? LIMIT 1`)
    .get(guideId, ignoreBookingId, end, start);
  return !overlap;
}

/**
 * Eşleşme puanı (0-100):
 *  %40 puan ortalaması, %25 uzmanlık uyumu, %20 deneyim, %15 fiyat uygunluğu.
 * Henüz değerlendirmesi olmayan rehberler nötr (3/5) kabul edilir.
 */
function matchScore(guide, { specialty, maxPrice }) {
  const rating = (guide.rating ?? 3) / 5;
  const spec = specialty ? (guide.specialties.includes(specialty) ? 1 : 0) : 0.5;
  const exp = Math.min(guide.experience, 15) / 15;
  const price = maxPrice ? Math.max(0, 1 - guide.dailyRate / maxPrice) : 0.5;
  return Math.round((0.4 * rating + 0.25 * spec + 0.2 * exp + 0.15 * price) * 100);
}

function search(db, q = {}) {
  const where = [];
  const params = [];
  if (q.city) { where.push('g.city = ?'); params.push(v.requireOneOf(q.city, 'Şehir', config.CITIES)); }
  if (q.language) {
    v.requireOneOf(q.language, 'Dil', config.LANGUAGES);
    where.push('EXISTS (SELECT 1 FROM json_each(g.languages) WHERE value = ?)');
    params.push(q.language);
  }
  if (q.specialty) v.requireOneOf(q.specialty, 'Uzmanlık', config.SPECIALTIES);
  let maxPrice = null;
  if (q.maxPrice) {
    maxPrice = v.requireInt(q.maxPrice, 'Maksimum ücret', { min: 1, max: 100000 });
    where.push('g.daily_rate <= ?'); params.push(maxPrice);
  }
  if (q.groupSize) {
    where.push('g.max_group >= ?'); params.push(v.requireInt(q.groupSize, 'Grup büyüklüğü', { min: 1, max: 200 }));
  }
  const sql = BASE_SELECT + (where.length ? ` WHERE ${where.join(' AND ')}` : '');
  let guides = db.prepare(sql).all(...params).map(toGuide);

  if (q.start || q.end) {
    const start = v.requireDate(q.start, 'Başlangıç tarihi');
    const end = v.requireDate(q.end || q.start, 'Bitiş tarihi');
    if (start > end) throw badRequest('Başlangıç tarihi bitişten sonra olamaz');
    guides = guides.filter((g) => isAvailable(db, g.id, start, end));
  }
  for (const g of guides) g.score = matchScore(g, { specialty: q.specialty, maxPrice });

  const sorters = {
    score: (a, b) => b.score - a.score,
    price: (a, b) => a.dailyRate - b.dailyRate,
    rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.ratingCount - a.ratingCount,
    experience: (a, b) => b.experience - a.experience,
  };
  guides.sort(sorters[q.sort] || sorters.score);
  return guides;
}

function setUnavailable(db, user, body) {
  if (user.role !== 'rehber') throw forbidden();
  if (!db.prepare('SELECT 1 FROM guides WHERE user_id = ?').get(user.id)) throw badRequest('Önce rehber profilinizi oluşturun');
  const add = Array.isArray(body.add) ? body.add : [];
  const remove = Array.isArray(body.remove) ? body.remove : [];
  for (const d of [...add, ...remove]) v.requireDate(d, 'Tarih');
  const ins = db.prepare('INSERT OR IGNORE INTO unavailable_days (guide_id, day) VALUES (?, ?)');
  const del = db.prepare('DELETE FROM unavailable_days WHERE guide_id = ? AND day = ?');
  for (const d of add) ins.run(user.id, d);
  for (const d of remove) del.run(user.id, d);
  return getGuide(db, user.id).unavailableDays;
}

module.exports = { upsertProfile, getGuide, search, isAvailable, matchScore, setUnavailable };
