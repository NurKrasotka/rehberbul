'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { freshDb, makeUser, makeGuide } = require('./helpers');
const bookings = require('../src/services/bookings');

const TODAY = '2099-01-01';
function setup() {
  const db = freshDb();
  return { db, guide: makeGuide(db, 'g@x.com'), tourist: makeUser(db, 'turist', 't@x.com'), agency: makeUser(db, 'acenta', 'a@x.com') };
}

test('toplam ücret gün sayısı × günlük ücret olarak hesaplanır', () => {
  const { db, guide, agency } = setup();
  const b = bookings.create(db, agency, { guideId: guide.id, startDate: '2099-06-01', endDate: '2099-06-03', groupSize: 8 }, TODAY);
  assert.equal(b.days, 3);
  assert.equal(b.totalPrice, 6000);
  assert.equal(b.status, 'beklemede');
  assert.equal(b.customerCompany, 'Test Turizm');
});

test('maksimum grup sınırı ve geçmiş tarih reddedilir', () => {
  const { db, guide, tourist } = setup();
  assert.throws(() => bookings.create(db, tourist, { guideId: guide.id, startDate: '2099-06-01', groupSize: 11 }, TODAY), /en fazla 10/);
  assert.throws(() => bookings.create(db, tourist, { guideId: guide.id, startDate: '2098-12-31', groupSize: 2 }, TODAY), /Geçmiş/);
});

test('çakışan iki talepten yalnızca biri onaylanabilir', () => {
  const { db, guide, tourist, agency } = setup();
  const a = bookings.create(db, tourist, { guideId: guide.id, startDate: '2099-06-01', endDate: '2099-06-02', groupSize: 2 }, TODAY);
  const b = bookings.create(db, agency, { guideId: guide.id, startDate: '2099-06-02', endDate: '2099-06-04', groupSize: 5 }, TODAY);
  bookings.changeStatus(db, guide, a.id, 'accept', TODAY);
  assert.throws(() => bookings.changeStatus(db, guide, b.id, 'accept', TODAY), { status: 409 });
  assert.throws(() => bookings.create(db, tourist, { guideId: guide.id, startDate: '2099-06-02', groupSize: 1 }, TODAY), /müsait değil/);
});

test('müşteri talebini onaylayamaz, başkasının talebine erişemez', () => {
  const { db, guide, tourist, agency } = setup();
  const b = bookings.create(db, tourist, { guideId: guide.id, startDate: '2099-06-01', groupSize: 2 }, TODAY);
  assert.throws(() => bookings.changeStatus(db, tourist, b.id, 'accept', TODAY), { status: 403 });
  assert.throws(() => bookings.changeStatus(db, agency, b.id, 'cancel', TODAY), { status: 403 });
});

test('geçersiz durum geçişi engellenir', () => {
  const { db, guide, tourist } = setup();
  const b = bookings.create(db, tourist, { guideId: guide.id, startDate: '2099-06-01', groupSize: 2 }, TODAY);
  bookings.changeStatus(db, guide, b.id, 'decline', TODAY);
  assert.throws(() => bookings.changeStatus(db, guide, b.id, 'accept', TODAY), { status: 409 });
});

test('tur bitmeden tamamlanamaz; tamamlanınca bir kez değerlendirilebilir', () => {
  const { db, guide, tourist } = setup();
  const b = bookings.create(db, tourist, { guideId: guide.id, startDate: '2099-06-01', endDate: '2099-06-02', groupSize: 2 }, TODAY);
  bookings.changeStatus(db, guide, b.id, 'accept', TODAY);
  assert.throws(() => bookings.addReview(db, tourist, b.id, { rating: 5 }), /tamamlanmış/);
  assert.throws(() => bookings.changeStatus(db, guide, b.id, 'complete', '2099-06-02'), /bitmeden/);
  bookings.changeStatus(db, guide, b.id, 'complete', '2099-06-03');
  bookings.addReview(db, tourist, b.id, { rating: 4, comment: 'Güzeldi' });
  assert.throws(() => bookings.addReview(db, tourist, b.id, { rating: 5 }), /zaten/);
  const g = require('../src/services/guides').getGuide(db, guide.id);
  assert.equal(g.rating, 4);
  assert.equal(g.ratingCount, 1);
});
