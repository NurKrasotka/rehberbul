'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { freshDb, makeUser, makeGuide } = require('./helpers');
const guides = require('../src/services/guides');
const bookings = require('../src/services/bookings');

test('şehir ve dil filtresi yalnızca uygun rehberleri döndürür', () => {
  const db = freshDb();
  makeGuide(db, 'a@x.com', { city: 'Nevşehir', languages: ['Rusça'] });
  makeGuide(db, 'b@x.com', { city: 'Nevşehir', languages: ['Almanca'] });
  makeGuide(db, 'c@x.com', { city: 'Antalya', languages: ['Rusça'] });
  const r = guides.search(db, { city: 'Nevşehir', language: 'Rusça' });
  assert.equal(r.length, 1);
  assert.equal(r[0].city, 'Nevşehir');
});

test('fiyat ve grup büyüklüğü filtresi uygulanır', () => {
  const db = freshDb();
  makeGuide(db, 'a@x.com', { dailyRate: 1500, maxGroup: 30 });
  makeGuide(db, 'b@x.com', { dailyRate: 4000, maxGroup: 30 });
  makeGuide(db, 'c@x.com', { dailyRate: 1500, maxGroup: 5 });
  assert.equal(guides.search(db, { maxPrice: 2000, groupSize: 20 }).length, 1);
});

test('kapalı gün ve onaylı rezervasyon olan rehber tarih aramasında görünmez', () => {
  const db = freshDb();
  const g1 = makeGuide(db, 'a@x.com');
  const g2 = makeGuide(db, 'b@x.com');
  makeGuide(db, 'c@x.com');
  const tourist = makeUser(db, 'turist', 't@x.com');
  guides.setUnavailable(db, g1, { add: ['2099-05-02'] });
  const b = bookings.create(db, tourist, { guideId: g2.id, startDate: '2099-05-01', endDate: '2099-05-03', groupSize: 2 });
  bookings.changeStatus(db, g2, b.id, 'accept');
  const r = guides.search(db, { start: '2099-05-02', end: '2099-05-02' });
  assert.equal(r.length, 1);
  assert.ok(r.every((g) => g.id !== g1.id && g.id !== g2.id));
});

test('eşleşme puanı uzmanlık uyumunu ödüllendirir', () => {
  const base = { rating: 4, experience: 5, dailyRate: 2000 };
  const match = guides.matchScore({ ...base, specialties: ['Gastronomi'] }, { specialty: 'Gastronomi' });
  const noMatch = guides.matchScore({ ...base, specialties: ['Müze'] }, { specialty: 'Gastronomi' });
  assert.equal(match - noMatch, 25);
});

test('geçersiz şehir ve ters tarih aralığı reddedilir', () => {
  const db = freshDb();
  assert.throws(() => guides.search(db, { city: 'Paris' }), /Şehir geçersiz/);
  assert.throws(() => guides.search(db, { start: '2099-05-03', end: '2099-05-01' }), /bitişten sonra/);
});

test('yalnızca rehber hesabı profil oluşturabilir', () => {
  const db = freshDb();
  const tourist = makeUser(db, 'turist', 't@x.com');
  assert.throws(() => guides.upsertProfile(db, tourist, {}), { status: 403 });
});
