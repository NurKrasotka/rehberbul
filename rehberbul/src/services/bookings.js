'use strict';
const v = require('../validation');
const { transaction } = require('../db');
const { isAvailable } = require('./guides');
const { badRequest, forbidden, notFound, conflict } = require('../errors');

const MAX_DAYS = 30;

const SELECT = `
  SELECT b.*, gu.name AS guide_name, cu.name AS customer_name, cu.role AS customer_role,
         cu.company AS customer_company, g.city,
         EXISTS (SELECT 1 FROM reviews r WHERE r.booking_id = b.id) AS reviewed
  FROM bookings b
  JOIN guides g ON g.user_id = b.guide_id
  JOIN users gu ON gu.id = b.guide_id
  JOIN users cu ON cu.id = b.customer_id`;

function toBooking(r) {
  return {
    id: r.id, guideId: r.guide_id, guideName: r.guide_name, city: r.city,
    customerId: r.customer_id, customerName: r.customer_name, customerRole: r.customer_role,
    customerCompany: r.customer_company, startDate: r.start_date, endDate: r.end_date,
    days: v.dayCount(r.start_date, r.end_date), groupSize: r.group_size, note: r.note,
    totalPrice: r.total_price, status: r.status, reviewed: Boolean(r.reviewed), createdAt: r.created_at,
  };
}

function getRow(db, id) {
  const row = db.prepare(`${SELECT} WHERE b.id = ?`).get(Number(id));
  if (!row) throw notFound('Rezervasyon bulunamadı');
  return row;
}

function create(db, user, body, today = new Date().toISOString().slice(0, 10)) {
  if (user.role === 'rehber') throw forbidden('Rehber hesapları rezervasyon talebi oluşturamaz');
  const guideId = v.requireInt(body.guideId, 'Rehber', { min: 1 });
  const start = v.requireDate(body.startDate, 'Başlangıç tarihi');
  const end = v.requireDate(body.endDate || body.startDate, 'Bitiş tarihi');
  if (start < today) throw badRequest('Geçmiş bir tarih için talep oluşturulamaz');
  if (start > end) throw badRequest('Başlangıç tarihi bitişten sonra olamaz');
  const days = v.dayCount(start, end);
  if (days > MAX_DAYS) throw badRequest(`Bir talep en fazla ${MAX_DAYS} gün olabilir`);
  const groupSize = v.requireInt(body.groupSize, 'Grup büyüklüğü', { min: 1, max: 200 });
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';

  const guide = db.prepare('SELECT daily_rate, max_group FROM guides WHERE user_id = ?').get(guideId);
  if (!guide) throw notFound('Rehber bulunamadı');
  if (groupSize > guide.max_group) throw badRequest(`Bu rehber en fazla ${guide.max_group} kişilik gruplara hizmet veriyor`);
  if (!isAvailable(db, guideId, start, end)) throw conflict('Rehber seçilen tarihlerde müsait değil');

  const r = db.prepare(`INSERT INTO bookings (guide_id, customer_id, start_date, end_date, group_size, note, total_price)
                        VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(guideId, user.id, start, end, groupSize, note, days * guide.daily_rate);
  return toBooking(getRow(db, Number(r.lastInsertRowid)));
}

function listForUser(db, user) {
  const col = user.role === 'rehber' ? 'b.guide_id' : 'b.customer_id';
  return db.prepare(`${SELECT} WHERE ${col} = ? ORDER BY b.start_date DESC, b.id DESC`).all(user.id).map(toBooking);
}

/** İzin verilen durum geçişleri: [mevcut durum] -> { işlem: [yeni durum, işlemi yapabilecek taraf] } */
const TRANSITIONS = {
  beklemede: { accept: ['onaylandi', 'guide'], decline: ['reddedildi', 'guide'], cancel: ['iptal', 'any'] },
  onaylandi: { cancel: ['iptal', 'any'], complete: ['tamamlandi', 'guide'] },
};

function changeStatus(db, user, id, action, today = new Date().toISOString().slice(0, 10)) {
  return transaction(db, () => {
    const row = getRow(db, id);
    const isGuide = row.guide_id === user.id;
    const isCustomer = row.customer_id === user.id;
    if (!isGuide && !isCustomer) throw forbidden();
    const rule = TRANSITIONS[row.status]?.[action];
    if (!rule) throw conflict(`'${row.status}' durumundaki rezervasyona bu işlem uygulanamaz`);
    const [next, who] = rule;
    if (who === 'guide' && !isGuide) throw forbidden('Bu işlemi yalnızca rehber yapabilir');
    if (action === 'accept' && !isAvailable(db, row.guide_id, row.start_date, row.end_date, { ignoreBookingId: row.id })) {
      throw conflict('Bu tarihlerde onaylanmış başka bir rezervasyon var');
    }
    if (action === 'complete' && row.end_date >= today) throw conflict('Tur bitmeden tamamlandı olarak işaretlenemez');
    db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(next, row.id);
    return toBooking(getRow(db, row.id));
  });
}

function addReview(db, user, id, body) {
  return transaction(db, () => {
    const row = getRow(db, id);
    if (row.customer_id !== user.id) throw forbidden('Yalnızca turu satın alan kullanıcı değerlendirme yapabilir');
    if (row.status !== 'tamamlandi') throw conflict('Yalnızca tamamlanmış turlar değerlendirilebilir');
    if (row.reviewed) throw conflict('Bu tur zaten değerlendirildi');
    const rating = v.requireInt(body.rating, 'Puan', { min: 1, max: 5 });
    const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 1000) : '';
    db.prepare('INSERT INTO reviews (booking_id, guide_id, author_id, rating, comment) VALUES (?, ?, ?, ?, ?)')
      .run(row.id, row.guide_id, user.id, rating, comment);
    db.prepare('UPDATE guides SET rating_sum = rating_sum + ?, rating_count = rating_count + 1 WHERE user_id = ?')
      .run(rating, row.guide_id);
    return { bookingId: row.id, rating, comment };
  });
}

module.exports = { create, listForUser, changeStatus, addReview, TRANSITIONS };
