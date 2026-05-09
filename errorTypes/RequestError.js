// مسیر فایل: /errorTypes/RequestError.js
// توضیح: کلاس خطای سفارشی برای خطاهای عملیاتی (Operational Errors).
// با استفاده از این کلاس می‌توان خطاهایی با کد وضعیت HTTP مشخص تولید کرد
// و در میدلور مدیریت خطای سراسری، آن‌ها را به‌درستی پردازش کرد.
//
// @version 2.5.0
// @since 2026

class RequestError extends Error {
  /**
   * @param {string} message - پیام خطا
   * @param {number} statusCode - کد وضعیت HTTP (مثلاً ۴۰۰، ۴۰۴)
   */
  constructor(message, statusCode) {
    super(message);
    this.name = 'RequestError';
    this.statusCode = statusCode;
    this.isOperational = true; // نشان‌دهنده خطای قابل انتظار و مدیریت‌شده

    // ثبت Stack Trace برای دیباگ آسان‌تر
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = RequestError;
