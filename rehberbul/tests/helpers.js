'use strict';
const { open } = require('../src/db');
const auth = require('../src/auth');
const guides = require('../src/services/guides');

function freshDb() { return open(':memory:'); }

function makeUser(db, role, email, extra = {}) {
  return auth.register(db, { name: 'Test ' + role, email, password: 'sifre1234', role, company: 'Test Turizm', ...extra }).user;
}

function makeGuide(db, email, profile = {}) {
  const user = makeUser(db, 'rehber', email);
  guides.upsertProfile(db, user, {
    licenseNo: 'TR-123', city: 'Nevşehir', languages: ['Türkçe', 'Rusça'], specialties: ['Tarih ve kültür'],
    dailyRate: 2000, maxGroup: 10, experience: 5, ...profile,
  });
  return user;
}

module.exports = { freshDb, makeUser, makeGuide };
