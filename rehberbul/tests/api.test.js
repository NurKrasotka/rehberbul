'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { open } = require('../src/db');
const { createServer } = require('../src/app');

test('HTTP API: kayıt, profil, arama ve talep akışı', async (t) => {
  const server = createServer(open(':memory:'));
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { method = 'GET', body, token } = {}) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      body: body && JSON.stringify(body) });
    return { status: res.status, data: await res.json() };
  };

  const g = await call('/api/auth/register', { method: 'POST', body: { name: 'Rehber Bir', email: 'r@x.com', password: 'sifre1234', role: 'rehber' } });
  assert.equal(g.status, 201);
  const p = await call('/api/guides/me', { method: 'PUT', token: g.data.token, body: {
    licenseNo: 'TR-9', city: 'İstanbul', languages: ['Kırgızca'], specialties: ['Müze'], dailyRate: 3000 } });
  assert.equal(p.status, 200);

  const s = await call('/api/guides?' + new URLSearchParams({ city: 'İstanbul', language: 'Kırgızca' }));
  assert.equal(s.data.length, 1);

  assert.equal((await call('/api/bookings', { method: 'POST', body: {} })).status, 401);
  const a = await call('/api/auth/register', { method: 'POST', body: { name: 'Acenta', email: 'a@x.com', password: 'sifre1234', role: 'acenta', company: 'X Tur' } });
  const b = await call('/api/bookings', { method: 'POST', token: a.data.token, body: { guideId: p.data.id, startDate: '2099-03-01', groupSize: 4 } });
  assert.equal(b.status, 201);
  assert.equal(b.data.totalPrice, 3000);

  const acc = await call(`/api/bookings/${b.data.id}/accept`, { method: 'POST', token: g.data.token });
  assert.equal(acc.data.status, 'onaylandi');

  assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'a@x.com', password: 'yanlis' } })).status, 401);
  assert.equal((await call('/api/yok')).status, 404);
  const dup = await call('/api/auth/register', { method: 'POST', body: { name: 'Acenta', email: 'a@x.com', password: 'sifre1234', role: 'turist' } });
  assert.equal(dup.status, 409);
});

test('statik dosya sunucusu dizin dışına çıkmaya izin vermez', async (t) => {
  const server = createServer(open(':memory:'));
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + '/')).status, 200);
  const res = await fetch(base + '/%2e%2e/src/db.js');
  assert.notEqual(res.status, 200);
});
