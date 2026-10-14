'use strict';
const { badRequest } = require('./errors');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(s) {
  if (typeof s !== 'string' || !ISO_DATE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function requireDate(s, field) {
  if (!isValidDate(s)) throw badRequest(`${field} geçerli bir tarih olmalı (YYYY-AA-GG)`);
  return s;
}

function requireString(v, field, { min = 1, max = 200 } = {}) {
  if (typeof v !== 'string') throw badRequest(`${field} zorunlu`);
  const t = v.trim();
  if (t.length < min || t.length > max) throw badRequest(`${field} ${min}-${max} karakter olmalı`);
  return t;
}

function requireInt(v, field, { min = -Infinity, max = Infinity } = {}) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw badRequest(`${field} ${min} ile ${max} arasında tam sayı olmalı`);
  return n;
}

function requireOneOf(v, field, list) {
  if (!list.includes(v)) throw badRequest(`${field} geçersiz`);
  return v;
}

function requireSubset(arr, field, list) {
  if (!Array.isArray(arr) || arr.length === 0) throw badRequest(`${field} en az bir değer içermeli`);
  for (const x of arr) requireOneOf(x, field, list);
  return [...new Set(arr)];
}

/** Başlangıç ve bitiş dahil gün sayısı. */
function dayCount(start, end) {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
}

/** start..end arasındaki tüm günleri YYYY-AA-GG olarak döndürür. */
function daysBetween(start, end) {
  const out = [];
  for (let t = Date.parse(start); t <= Date.parse(end); t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

module.exports = { isValidDate, requireDate, requireString, requireInt, requireOneOf, requireSubset, dayCount, daysBetween };
