'use strict';
/* RehberBul istemcisi: hash tabanlı tek sayfa uygulama (harici kütüphane yok) */

const STATUS_TEXT = { beklemede: 'Beklemede', onaylandi: 'Onaylandı', reddedildi: 'Reddedildi', iptal: 'İptal edildi', tamamlandi: 'Tamamlandı' };
const ROLE_TEXT = { turist: 'Turist', acenta: 'Seyahat acentesi', rehber: 'Rehber' };
const state = { token: null, user: null, meta: null, seq: 0 };
/** Eski bir sayfanın geç gelen yanıtı yeni sayfanın üzerine yazmasın diye her yönlendirmeye sıra numarası verilir. */
const stale = (n) => n !== state.seq;

try { state.token = localStorage.getItem('rb_token'); } catch { /* depolama kapalı olabilir */ }

const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tl = (n) => new Intl.NumberFormat('tr-TR').format(n) + ' ₺';
const trDate = (s) => s.split('-').reverse().join('.');
const today = () => new Date().toISOString().slice(0, 10);
const stars = (r) => r == null ? '<span class="muted">Yeni rehber</span>'
  : `<span class="stars">${'★'.repeat(Math.round(r))}${'☆'.repeat(5 - Math.round(r))}</span> ${r}`;

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && state.token && path === '/api/me') setSession(null, null);
    throw new Error(data.error || 'Bir hata oluştu');
  }
  return data;
}

function toast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast' + (isError ? ' error' : ''); t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 3500);
}

function setSession(token, user) {
  state.token = token; state.user = user;
  try { token ? localStorage.setItem('rb_token', token) : localStorage.removeItem('rb_token'); } catch { /* yok say */ }
  renderNav();
}

function renderNav() {
  const u = state.user;
  $('#nav').innerHTML = `<a href="#/">Rehber ara</a>` + (u
    ? `<a href="#/panel">Panelim</a><span class="muted">${esc(u.name)} · ${ROLE_TEXT[u.role]}</span><a href="#/cikis">Çıkış</a>`
    : `<a href="#/giris">Giriş</a><a class="btn" href="#/kayit">Kayıt ol</a>`);
}

const options = (list, sel, empty) => (empty ? `<option value="">${empty}</option>` : '') +
  list.map((x) => `<option ${x === sel ? 'selected' : ''}>${esc(x)}</option>`).join('');

/* ---------- Arama sayfası ---------- */
async function pageSearch(n) {
  const m = state.meta;
  const q = Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''));
  app.innerHTML = `
    <section class="hero"><h1>Size uygun lisanslı rehberi bulun</h1>
      <p>Şehir, dil, uzmanlık ve tarihe göre müsait rehberleri karşılaştırın; turist veya acente olarak doğrudan talep gönderin.</p></section>
    <form id="filters" class="card grid filters">
      <label>Şehir<select name="city">${options(m.cities, q.city, 'Tümü')}</select></label>
      <label>Dil<select name="language">${options(m.languages, q.language, 'Tümü')}</select></label>
      <label>Uzmanlık<select name="specialty">${options(m.specialties, q.specialty, 'Tümü')}</select></label>
      <label>Başlangıç<input type="date" name="start" min="${today()}" value="${esc(q.start || '')}"></label>
      <label>Bitiş<input type="date" name="end" min="${today()}" value="${esc(q.end || '')}"></label>
      <label>Kişi sayısı<input type="number" name="groupSize" min="1" value="${esc(q.groupSize || '')}"></label>
      <label>Günlük en fazla (₺)<input type="number" name="maxPrice" min="1" value="${esc(q.maxPrice || '')}"></label>
      <label>Sırala<select name="sort">
        ${[['score', 'En uygun'], ['rating', 'Puan'], ['price', 'Fiyat'], ['experience', 'Deneyim']]
          .map(([v, t]) => `<option value="${v}" ${q.sort === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <button>Ara</button>
    </form>
    <div id="results" class="grid results"></div>`;
  $('#filters').addEventListener('submit', (e) => {
    e.preventDefault();
    const params = new URLSearchParams([...new FormData(e.target)].filter(([, v]) => v));
    if (params.has('start') && !params.has('end')) params.set('end', params.get('start'));
    location.hash = '#/?' + params.toString();
  });
  const params = new URLSearchParams(Object.entries(q).filter(([, v]) => v));
  try {
    const guides = await api('/api/guides?' + params);
    if (stale(n)) return;
    $('#results').innerHTML = guides.length ? guides.map(guideCard).join('')
      : '<div class="card empty">Bu kriterlere uygun müsait rehber bulunamadı. Filtreleri genişletmeyi deneyin.</div>';
  } catch (err) { if (!stale(n)) $('#results').innerHTML = `<div class="card empty">${esc(err.message)}</div>`; }
}

function guideCard(g) {
  const q = location.hash.split('?')[1];
  return `<article class="card guide-card">
    <div class="guide-head"><div><h3>${esc(g.name)}</h3><div class="muted">${esc(g.city)} · ${g.experience} yıl deneyim</div></div>
      <div class="score" title="Eşleşme puanı">%${g.score}</div></div>
    <div>${stars(g.rating)} <span class="muted">(${g.ratingCount} değerlendirme)</span></div>
    <div class="chips">${g.languages.map((l) => `<span class="chip lang">${esc(l)}</span>`).join('')}</div>
    <div class="chips">${g.specialties.map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</div>
    <div class="row"><span class="price">${tl(g.dailyRate)} <span class="muted">/ gün</span></span>
      <a class="btn" href="#/rehber/${g.id}${q ? '?' + q : ''}">Profili gör</a></div>
  </article>`;
}

/* ---------- Rehber profili ve talep formu ---------- */
async function pageGuide(id, n) {
  const q = Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''));
  const g = await api('/api/guides/' + encodeURIComponent(id));
  if (stale(n)) return;
  const canBook = state.user && state.user.role !== 'rehber';
  app.innerHTML = `<div class="two-col">
    <section class="card grid">
      <div class="guide-head"><div><h2>${esc(g.name)}</h2><div class="muted">${esc(g.city)} · Ruhsat no: ${esc(g.licenseNo)} · ${g.experience} yıl deneyim</div></div>
        <div class="price">${tl(g.dailyRate)}<div class="muted">günlük</div></div></div>
      <div>${stars(g.rating)} <span class="muted">(${g.ratingCount} değerlendirme)</span></div>
      <p>${esc(g.bio) || '<span class="muted">Henüz açıklama eklenmemiş.</span>'}</p>
      <div class="chips">${g.languages.map((l) => `<span class="chip lang">${esc(l)}</span>`).join('')}</div>
      <div class="chips">${g.specialties.map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</div>
      <div class="muted">En fazla ${g.maxGroup} kişilik gruplar</div>
      ${g.unavailableDays.length ? `<div class="muted">Müsait olmadığı günler: ${g.unavailableDays.map(trDate).join(', ')}</div>` : ''}
      <h3>Değerlendirmeler</h3>
      <div class="list">${g.reviews.length ? g.reviews.map((r) => `<div class="card"><div class="row"><b>${esc(r.author)}</b>${stars(r.rating)}</div>
        <div>${esc(r.comment)}</div></div>`).join('') : '<div class="muted">Henüz değerlendirme yok.</div>'}</div>
    </section>
    <aside class="card">
      <h3>Rezervasyon talebi</h3>
      ${canBook ? `<form id="book" class="grid">
        <label>Başlangıç<input type="date" name="startDate" required min="${today()}" value="${esc(q.start || '')}"></label>
        <label>Bitiş<input type="date" name="endDate" required min="${today()}" value="${esc(q.end || q.start || '')}"></label>
        <label>Kişi sayısı<input type="number" name="groupSize" required min="1" max="${g.maxGroup}" value="${esc(q.groupSize || 2)}"></label>
        <label>Not<textarea name="note" placeholder="Tur programı, buluşma yeri, özel istekler…"></textarea></label>
        <div id="estimate" class="muted"></div>
        <button>Talep gönder</button></form>`
      : state.user ? '<p class="muted">Rehber hesapları talep oluşturamaz.</p>'
      : '<p class="muted">Talep göndermek için <a href="#/giris">giriş yapın</a> veya <a href="#/kayit">kayıt olun</a>.</p>'}
    </aside></div>`;
  const form = $('#book');
  if (!form) return;
  const estimate = () => {
    const { startDate: s, endDate: e } = Object.fromEntries(new FormData(form));
    if (!s || !e || e < s) { $('#estimate').textContent = ''; return; }
    const days = Math.round((Date.parse(e) - Date.parse(s)) / 86400000) + 1;
    $('#estimate').textContent = `${days} gün × ${tl(g.dailyRate)} = ${tl(days * g.dailyRate)}`;
  };
  form.addEventListener('input', estimate); estimate();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    try {
      await api('/api/bookings', { method: 'POST', body: { ...body, guideId: g.id, groupSize: Number(body.groupSize) } });
      toast('Talebiniz rehbere iletildi'); location.hash = '#/panel';
    } catch (err) { toast(err.message, true); }
  });
}

/* ---------- Giriş / kayıt ---------- */
function pageLogin() {
  app.innerHTML = `<form id="login" class="card grid auth"><h2>Giriş yap</h2>
    <label>E-posta<input type="email" name="email" required></label>
    <label>Şifre<input type="password" name="password" required></label>
    <button>Giriş</button>
    <div class="muted">Demo: turist@demo.com, acenta@demo.com, rehber@demo.com — şifre demo1234</div></form>`;
  $('#login').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api('/api/auth/login', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
      setSession(r.token, r.user); location.hash = '#/panel';
    } catch (err) { toast(err.message, true); }
  });
}

function pageRegister() {
  app.innerHTML = `<form id="reg" class="card grid auth"><h2>Kayıt ol</h2>
    <label>Hesap türü<select name="role">
      <option value="turist">Turist</option><option value="acenta">Seyahat acentesi</option><option value="rehber">Rehber</option></select></label>
    <label id="companyField" hidden>Acenta adı<input name="company"></label>
    <label>Ad soyad<input name="name" required minlength="2"></label>
    <label>E-posta<input type="email" name="email" required></label>
    <label>Şifre (en az 8 karakter)<input type="password" name="password" required minlength="8"></label>
    <button>Hesap oluştur</button></form>`;
  const role = $('select[name=role]');
  role.addEventListener('change', () => { $('#companyField').hidden = role.value !== 'acenta'; });
  $('#reg').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api('/api/auth/register', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
      setSession(r.token, r.user);
      toast(r.user.role === 'rehber' ? 'Hesabınız oluşturuldu. Şimdi rehber profilinizi doldurun.' : 'Hesabınız oluşturuldu');
      location.hash = r.user.role === 'rehber' ? '#/panel' : '#/';
    } catch (err) { toast(err.message, true); }
  });
}

/* ---------- Panel ---------- */
function bookingCard(b, asGuide) {
  const who = asGuide
    ? `${esc(b.customerName)}${b.customerCompany ? ' · ' + esc(b.customerCompany) : ''} <span class="chip">${ROLE_TEXT[b.customerRole]}</span>`
    : `<a href="#/rehber/${b.guideId}">${esc(b.guideName)}</a> · ${esc(b.city)}`;
  const acts = [];
  if (asGuide && b.status === 'beklemede') acts.push(['accept', 'Onayla', ''], ['decline', 'Reddet', 'danger']);
  if (asGuide && b.status === 'onaylandi' && b.endDate < today()) acts.push(['complete', 'Tamamlandı', '']);
  if (['beklemede', 'onaylandi'].includes(b.status)) acts.push(['cancel', 'İptal et', 'secondary']);
  const review = !asGuide && b.status === 'tamamlandi' && !b.reviewed
    ? `<form class="grid review" data-id="${b.id}"><label>Puan<select name="rating">${[5, 4, 3, 2, 1].map((n) => `<option>${n}</option>`).join('')}</select></label>
       <label>Yorum<textarea name="comment"></textarea></label><button>Değerlendir</button></form>` : '';
  return `<div class="card grid"><div class="row"><div>${who}</div><span class="badge b-${b.status}">${STATUS_TEXT[b.status]}</span></div>
    <div class="muted">${trDate(b.startDate)} – ${trDate(b.endDate)} · ${b.days} gün · ${b.groupSize} kişi · <b>${tl(b.totalPrice)}</b></div>
    ${b.note ? `<div>${esc(b.note)}</div>` : ''}
    ${acts.length ? `<div class="row" style="justify-content:flex-start">${acts.map(([a, t, c]) =>
      `<button class="${c}" data-act="${a}" data-id="${b.id}">${t}</button>`).join('')}</div>` : ''}${review}</div>`;
}

function bindBookingActions(reload) {
  app.querySelectorAll('button[data-act]').forEach((btn) => btn.addEventListener('click', async () => {
    try { await api(`/api/bookings/${btn.dataset.id}/${btn.dataset.act}`, { method: 'POST' }); toast('Güncellendi'); reload(); }
    catch (err) { toast(err.message, true); }
  }));
  app.querySelectorAll('form.review').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(f));
    try { await api(`/api/bookings/${f.dataset.id}/review`, { method: 'POST', body: { ...body, rating: Number(body.rating) } }); toast('Teşekkürler!'); reload(); }
    catch (err) { toast(err.message, true); }
  }));
}

async function pagePanel(n = state.seq) {
  if (!state.user) { location.hash = '#/giris'; return; }
  const { guide } = await api('/api/me');
  const list = await api('/api/bookings');
  if (stale(n)) return;
  const asGuide = state.user.role === 'rehber';
  const m = state.meta;
  const checks = (name, all, sel = []) => `<div class="checks">${all.map((x) =>
    `<label><input type="checkbox" name="${name}" value="${esc(x)}" ${sel.includes(x) ? 'checked' : ''}>${esc(x)}</label>`).join('')}</div>`;
  const profile = asGuide ? `<section class="card grid"><h2>Rehber profilim</h2>
    ${guide ? '' : '<p class="muted">Aramada görünmek için profilinizi doldurun.</p>'}
    <form id="profile" class="grid">
      <div class="grid filters">
        <label>Ruhsat (kokart) no<input name="licenseNo" required value="${esc(guide?.licenseNo || '')}"></label>
        <label>Şehir<select name="city">${options(m.cities, guide?.city)}</select></label>
        <label>Günlük ücret (₺)<input type="number" name="dailyRate" min="1" required value="${esc(guide?.dailyRate || '')}"></label>
        <label>Maks. grup<input type="number" name="maxGroup" min="1" value="${esc(guide?.maxGroup || 20)}"></label>
        <label>Deneyim (yıl)<input type="number" name="experience" min="0" value="${esc(guide?.experience ?? 0)}"></label>
      </div>
      <label>Diller</label>${checks('languages', m.languages, guide?.languages)}
      <label>Uzmanlık alanları</label>${checks('specialties', m.specialties, guide?.specialties)}
      <label>Hakkımda<textarea name="bio">${esc(guide?.bio || '')}</textarea></label>
      <button>Profili kaydet</button></form>
    ${guide ? `<h3>Müsait olmadığım günler</h3>
      <form id="unav" class="row" style="justify-content:flex-start"><input type="date" name="day" min="${today()}" required style="max-width:200px"><button>Ekle</button></form>
      <div class="chips">${guide.unavailableDays.map((d) => `<span class="chip">${trDate(d)} <a href="#" data-rm="${d}">✕</a></span>`).join('') || '<span class="muted">Kapalı gün yok</span>'}</div>` : ''}
    </section>` : '';
  app.innerHTML = `<div class="grid">${profile}
    <section class="grid"><h2>${asGuide ? 'Gelen talepler' : 'Rezervasyonlarım'}</h2>
      <div class="list">${list.length ? list.map((b) => bookingCard(b, asGuide)).join('')
        : `<div class="card empty">${asGuide ? 'Henüz talep yok.' : 'Henüz talebiniz yok. <a href="#/">Rehber arayın</a>.'}</div>`}</div></section></div>`;
  bindBookingActions(() => pagePanel());
  $('#profile')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd);
    body.languages = fd.getAll('languages'); body.specialties = fd.getAll('specialties');
    ['dailyRate', 'maxGroup', 'experience'].forEach((k) => { body[k] = Number(body[k]); });
    try { await api('/api/guides/me', { method: 'PUT', body }); toast('Profil kaydedildi'); pagePanel(); }
    catch (err) { toast(err.message, true); }
  });
  $('#unav')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/api/guides/me/unavailable', { method: 'POST', body: { add: [e.target.day.value] } }); pagePanel(); }
    catch (err) { toast(err.message, true); }
  });
  app.querySelectorAll('[data-rm]').forEach((a) => a.addEventListener('click', async (e) => {
    e.preventDefault();
    await api('/api/guides/me/unavailable', { method: 'POST', body: { remove: [a.dataset.rm] } }); pagePanel();
  }));
}

/* ---------- Yönlendirme ---------- */
async function route() {
  const path = location.hash.slice(1).split('?')[0] || '/';
  const n = ++state.seq;
  try {
    if (path === '/') return await pageSearch(n);
    if (path === '/giris') return pageLogin();
    if (path === '/kayit') return pageRegister();
    if (path === '/panel') return await pagePanel(n);
    if (path === '/cikis') { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); setSession(null, null); location.hash = '#/'; return; }
    const m = /^\/rehber\/(\d+)$/.exec(path);
    if (m) return await pageGuide(m[1], n);
    app.innerHTML = '<div class="card empty">Sayfa bulunamadı.</div>';
  } catch (err) { if (!stale(n)) app.innerHTML = `<div class="card empty">${esc(err.message)}</div>`; }
}

(async function init() {
  state.meta = await api('/api/meta');
  if (state.token) {
    try { state.user = (await api('/api/me')).user; } catch { setSession(null, null); }
  }
  renderNav();
  window.addEventListener('hashchange', route);
  route();
})();
