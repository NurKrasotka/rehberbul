'use strict';
class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const badRequest = (m) => new AppError(400, m);
const unauthorized = (m = 'Giriş yapmanız gerekiyor') => new AppError(401, m);
const forbidden = (m = 'Bu işlem için yetkiniz yok') => new AppError(403, m);
const notFound = (m = 'Kayıt bulunamadı') => new AppError(404, m);
const conflict = (m) => new AppError(409, m);
module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict };
