// مسیر فایل: /utils/transactionHelper.js
// توضیح: ابزار کمکی برای اجرای آسان تراکنش‌های MongoDB
//
// [v1.0.0] ایجاد ماژول
//
// استفاده:
//   const runTransaction = require('../utils/transactionHelper');
//   await runTransaction(async (session) => {
//     await Model1.updateOne(..., { session });
//     await Model2.create(..., { session });
//   });

const mongoose = require('mongoose');

/**
 * @function runTransaction
 * @description یک تابع async را درون یک تراکنش MongoDB اجرا می‌کند.
 * در صورت موفقیت، commit و در صورت خطا، abort انجام می‌شود.
 * @param {Function} fn - تابعی که یک mongoose session دریافت کرده و عملیات را انجام می‌دهد
 * @returns {Promise<any>} خروجی تابع fn
 */
const runTransaction = async (fn) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const result = await fn(session);
    await session.commitTransaction();
    return result;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

module.exports = runTransaction;
