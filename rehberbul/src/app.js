'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');
const Router = require('./router');
const auth = require('./auth');
const guides = require('./services/guides');
const bookings = require('./services/bookings');
const { AppError, unauthorized, badRequest } = require('./errors');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function buildRouter() {
  const r = new Router();
  const needUser = (ctx) => { if (!ctx.user) throw unauthorized(); return ctx.user; };

  r.get('/api/meta', () => ({ cities: config.CITIES, languages: config.LANGUAGES, specialties: config.SPECIALTIES }));
  r.post('/api/auth/register', ({ db, body }) => auth.register(db, body));
  r.post('/api/auth/login', ({ db, body }) => auth.login(db, body));
  r.post('/api/auth/logout', ({ db, req }) => { auth.logout(db, req); return { ok: true }; });
  r.get('/api/me', (ctx) => {
    const user = needUser(ctx);
    let guide = null;
    if (user.role === 'rehber') { try { guide = guides.getGuide(ctx.db, user.id); } catch { guide = null; } }
    return { user, guide };
  });

  r.get('/api/guides', ({ db, query }) => guides.search(db, query));
  r.put('/api/guides/me', (ctx) => guides.upsertProfile(ctx.db, needUser(ctx), ctx.body));
  r.post('/api/guides/me/unavailable', (ctx) => guides.setUnavailable(ctx.db, needUser(ctx), ctx.body));
  r.get('/api/guides/:id', ({ db, params }) => guides.getGuide(db, params.id));

  r.get('/api/bookings', (ctx) => bookings.listForUser(ctx.db, needUser(ctx)));
  r.post('/api/bookings', (ctx) => bookings.create(ctx.db, needUser(ctx), ctx.body));
  r.post('/api/bookings/:id/review', (ctx) => bookings.addReview(ctx.db, needUser(ctx), ctx.params.id, ctx.body));
  r.post('/api/bookings/:id/:action', (ctx) => {
    if (!['accept', 'decline', 'cancel', 'complete'].includes(ctx.params.action)) throw badRequest('Geçersiz işlem');
    return bookings.changeStatus(ctx.db, needUser(ctx), ctx.params.id, ctx.params.action);
  });
  return r;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > config.MAX_BODY_BYTES) { reject(new AppError(413, 'İstek gövdesi çok büyük')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(badRequest('Geçersiz JSON')); }
    });
    req.on('error', reject);
  });
}

function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function serveStatic(res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath).replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403).end(); return; } // dizin dışına çıkmayı engelle
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Bulunamadı'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }).end(data);
  });
}

function createServer(db) {
  const router = buildRouter();
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return serveStatic(res, url.pathname);
    try {
      const { handler, params, methodNotAllowed } = router.match(req.method, url.pathname);
      if (!handler) throw new AppError(methodNotAllowed ? 405 : 404, methodNotAllowed ? 'Yöntem desteklenmiyor' : 'Uç nokta bulunamadı');
      const body = ['POST', 'PUT'].includes(req.method) ? await readBody(req) : {};
      const ctx = { db, req, params, body, query: Object.fromEntries(url.searchParams), user: auth.userFromRequest(db, req) };
      const result = await handler(ctx);
      send(res, req.method === 'POST' && /\/api\/(bookings|auth\/register)$/.test(url.pathname) ? 201 : 200, result);
    } catch (err) {
      if (err instanceof AppError) return send(res, err.status, { error: err.message });
      if (/constraint failed/i.test(err.message || '')) return send(res, 400, { error: 'Geçersiz veri' });
      console.error(err);
      send(res, 500, { error: 'Sunucu hatası' });
    }
  });
}

module.exports = { createServer };
