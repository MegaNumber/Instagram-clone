// مسیر فایل: /errorTypes/RequestError.js
// توضیح: کلاس خطای سفارشی برای خطاهای عملیاتی (Operational Errors).
// با استفاده از این کلاس می‌توان خطاهایی با کد وضعیت HTTP مشخص تولید کرد
// و در میدلور مدیریت خطای سراسری، آن‌ها را به‌درستی پردازش کرد.
// شامل متدهای استاتیک پرکاربرد برای کنترلرها و خروجی JSON استاندارد.
//
// @version 2.5.0
// @since 2026

class RequestError extends Error {
    /**
     * @param {string} message - پیام خطا
     * @param {number} statusCode - کد وضعیت HTTP (مثلاً ۴۰۰، ۴۰۴)
     * @param {*} [details] - اطلاعات اضافی (مانند فیلد معیوب)
     */
    constructor(message, statusCode = 500, details = null) {
        super(message);
        this.name = 'RequestError';
        this.statusCode = statusCode;
        this.isOperational = true; // نشان‌دهندهٔ خطای قابل انتظار
        this.timestamp = new Date().toISOString();
        if (details) {
            this.details = details;
        }

        // ثبت Stack Trace برای دیباگ (این خط را از خروجی Stack حذف می‌کند)
        Error.captureStackTrace(this, this.constructor);
    }

    /**
     * تبدیل خودکار به JSON استاندارد برای پاسخ API
     */
    toJSON() {
        const body = {
            success: false,
            error: this.message,
            statusCode: this.statusCode,
        };
        if (this.details) {
            body.details = this.details;
        }
        return body;
    }

    // ============================================================
    // متدهای استاتیک پرکاربرد (Factory Methods)
    // ============================================================

    /**
     * خطای ۴۰۰ (Bad Request)
     */
    static badRequest(message = 'درخواست نامعتبر است.', details = null) {
        return new RequestError(message, 400, details);
    }

    /**
     * خطای ۴۰۱ (Unauthorized)
     */
    static unauthorized(message = 'لطفاً وارد شوید.') {
        return new RequestError(message, 401);
    }

    /**
     * خطای ۴۰۳ (Forbidden)
     */
    static forbidden(message = 'شما به این بخش دسترسی ندارید.') {
        return new RequestError(message, 403);
    }

    /**
     * خطای ۴۰۴ (Not Found)
     */
    static notFound(entity = 'آیتم') {
        return new RequestError(`${entity} یافت نشد.`, 404);
    }

    /**
     * خطای ۴۰۹ (Conflict) - معمولاً برای دادهٔ تکراری
     */
    static conflict(message = 'این داده قبلاً وجود دارد.') {
        return new RequestError(message, 409);
    }

    /**
     * خطای ۴۲۲ (Unprocessable Entity) - اعتبارسنجی
     */
    static validationError(message = 'اعتبارسنجی ناموفق بود.', details = null) {
        return new RequestError(message, 422, details);
    }

    /**
     * خطای ۵۰۰ (Internal Server Error)
     */
    static internal(message = 'خطای سرور رخ داده است.') {
        return new RequestError(message, 500);
    }
}

module.exports = RequestError;
