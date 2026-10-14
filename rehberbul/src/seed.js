'use strict';
/** Demo verisi yükler. Tüm demo hesapların şifresi: demo1234 */
const fs = require('node:fs');
const config = require('./config');
const { open } = require('./db');
const { hashPassword } = require('./auth');

const GUIDES = [
  ['Ayşe Kaya', 'Nevşehir', ['Türkçe', 'İngilizce', 'Almanca'], ['Tarih ve kültür', 'Müze'], 2500, 25, 12, 'Kapadokya kaya kiliseleri ve yeraltı şehirleri konusunda uzman.'],
  ['Mehmet Yıldız', 'Nevşehir', ['Türkçe', 'Rusça'], ['Doğa ve yürüyüş', 'Fotoğraf turu'], 2000, 15, 6, 'Vadi yürüyüşleri ve gün doğumu fotoğraf turları.'],
  ['Elena Petrova', 'Antalya', ['Rusça', 'İngilizce', 'Türkçe'], ['Tarih ve kültür', 'Gastronomi'], 2200, 30, 8, 'Perge, Aspendos ve Kaleiçi turları.'],
  ['Can Demir', 'İstanbul', ['Türkçe', 'İngilizce', 'İspanyolca'], ['Tarih ve kültür', 'Müze', 'Gastronomi'], 3500, 20, 15, 'Tarihi Yarımada ve Boğaz turları.'],
  ['Zeynep Arslan', 'İstanbul', ['Türkçe', 'Arapça', 'İngilizce'], ['İnanç turizmi', 'Tarih ve kültür'], 3000, 40, 10, 'Camiler ve Osmanlı mimarisi.'],
  ['Ali Şahin', 'İzmir', ['Türkçe', 'Almanca', 'İngilizce'], ['Tarih ve kültür', 'İnanç turizmi'], 2400, 35, 18, 'Efes, Meryem Ana Evi ve Şirince.'],
  ['Selin Aydın', 'Muğla', ['Türkçe', 'İngilizce', 'Fransızca'], ['Doğa ve yürüyüş', 'Macera'], 2300, 12, 5, 'Likya Yolu ve tekne turları.'],
  ['Hasan Çelik', 'Mardin', ['Türkçe', 'Arapça'], ['İnanç turizmi', 'Tarih ve kültür', 'Gastronomi'], 1800, 25, 9, 'Mardin taş evleri ve Midyat.'],
  ['Aigerim Toktogulova', 'İstanbul', ['Kırgızca', 'Rusça', 'Türkçe'], ['Tarih ve kültür', 'Fotoğraf turu'], 2700, 20, 4, 'Orta Asyalı misafirler için İstanbul turları.'],
  ['Murat Koç', 'Trabzon', ['Türkçe', 'Arapça', 'İngilizce'], ['Doğa ve yürüyüş', 'İnanç turizmi'], 2100, 30, 11, 'Sümela Manastırı ve Uzungöl.'],
  ['Kenji Tanaka', 'Nevşehir', ['Japonca', 'İngilizce', 'Türkçe'], ['Fotoğraf turu', 'Tarih ve kültür'], 2900, 10, 7, 'Japon misafirler için Kapadokya.'],
  ['Fatma Öztürk', 'Konya', ['Türkçe', 'İngilizce'], ['İnanç turizmi', 'Müze'], 1700, 50, 20, 'Mevlana Müzesi ve Çatalhöyük.'],
];

function seed(path = config.DB_PATH) {
  if (fs.existsSync(path)) fs.unlinkSync(path);
  const db = open(path);
  const pw = hashPassword('demo1234');
  const addUser = db.prepare('INSERT INTO users (name, email, password_hash, role, company) VALUES (?, ?, ?, ?, ?)');
  const tourist = Number(addUser.run('Demo Turist', 'turist@demo.com', pw, 'turist', null).lastInsertRowid);
  const agency = Number(addUser.run('Demo Acenta', 'acenta@demo.com', pw, 'acenta', 'Kapadokya Seyahat Ltd.').lastInsertRowid);
  const addGuide = db.prepare(`INSERT INTO guides (user_id, license_no, city, languages, specialties, daily_rate, max_group, experience, bio)
                              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const ids = GUIDES.map(([name, city, langs, specs, rate, group, exp, bio], i) => {
    const email = i === 0 ? 'rehber@demo.com' : `rehber${i}@demo.com`;
    const id = Number(addUser.run(name, email, pw, 'rehber', null).lastInsertRowid);
    addGuide.run(id, `TR-${String(1000 + i * 37)}`, city, JSON.stringify(langs), JSON.stringify(specs), rate, group, exp, bio);
    return id;
  });
  // Geçmiş, tamamlanmış turlar ve değerlendirmeler
  const addBooking = db.prepare(`INSERT INTO bookings (guide_id, customer_id, start_date, end_date, group_size, total_price, status)
                                 VALUES (?, ?, ?, ?, ?, ?, 'tamamlandi')`);
  const addReview = db.prepare('INSERT INTO reviews (booking_id, guide_id, author_id, rating, comment) VALUES (?, ?, ?, ?, ?)');
  const upd = db.prepare('UPDATE guides SET rating_sum = rating_sum + ?, rating_count = rating_count + 1 WHERE user_id = ?');
  const reviews = [
    [0, tourist, 5, 'Çok bilgili ve güler yüzlü, Göreme turu harikaydı.'],
    [0, agency, 5, 'Grubumuzla çok iyi ilgilendi, tekrar çalışacağız.'],
    [1, tourist, 4, 'Gün doğumu yürüyüşü güzeldi, biraz erken başladık.'],
    [2, agency, 5, 'Rus misafirlerimiz çok memnun kaldı.'],
    [3, tourist, 4, 'Ayasofya anlatımı çok iyiydi.'],
    [5, agency, 5, 'Efes turu dakikası dakikasına planlıydı.'],
    [7, tourist, 3, 'Bilgili ama tur biraz uzun sürdü.'],
  ];
  reviews.forEach(([gi, author, rating, comment], k) => {
    const day = `2026-0${4 + (k % 3)}-1${k}`;
    const b = Number(addBooking.run(ids[gi], author, day, day, 4, GUIDES[gi][4]).lastInsertRowid);
    addReview.run(b, ids[gi], author, rating, comment);
    upd.run(rating, ids[gi]);
  });
  db.close();
  return { tourist, agency, guides: ids.length };
}

if (require.main === module) {
  const r = seed();
  console.log(`Demo veri yüklendi: ${r.guides} rehber. Giriş: turist@demo.com / acenta@demo.com / rehber@demo.com — şifre demo1234`);
}
module.exports = { seed };
