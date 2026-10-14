'use strict';
module.exports = {
  PORT: Number(process.env.PORT) || 3000,
  DB_PATH: process.env.DB_PATH || 'rehberbul.db',
  SESSION_DAYS: 7,
  MAX_BODY_BYTES: 100 * 1024,
  CITIES: ['Nevşehir', 'İstanbul', 'Antalya', 'İzmir', 'Muğla', 'Ankara', 'Trabzon', 'Mardin', 'Konya', 'Bursa'],
  LANGUAGES: ['Türkçe', 'İngilizce', 'Rusça', 'Almanca', 'Arapça', 'Fransızca', 'İspanyolca', 'Çince', 'Japonca', 'Kırgızca'],
  SPECIALTIES: ['Tarih ve kültür', 'Doğa ve yürüyüş', 'Gastronomi', 'İnanç turizmi', 'Fotoğraf turu', 'Müze', 'Macera'],
  ROLES: ['turist', 'acenta', 'rehber'],
};
