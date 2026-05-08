// مسیر فایل: /utils/asyncHandler.js
// توضیح: یک Higher‑Order Function (HOF) که کنترلرها و middlewareهای async
// را می‌پذیرد و هر خطای رخ‌داده در آن‌ها را به‌طور خودکار گرفته و به
// middleware سراسری خطای Express (با فراخوانی next) منتقل می‌کند.
//
// چرا این فایل ضروری است؟
// در Express 4.x خطاهای رخ‌داده در یک تابع async به‌صورت خودکار catch
// نمی‌شوند و باعث crash سرور می‌گردند. با این wrapper دیگر نیازی به
// نوشتن try/catch در تک‌تک کنترلرها نخواهید داشت.
//
// این الگو برگرفته از جدیدترین آموزش‌های Node.js Best Practices 2026 است:
// - "Stop Writing try-catch in Every Express Controller" (dev.to)
// - "How to uniformly wrap asynchronous request handlers in Express" (php.cn)
// - "Express 5.x: Native Async Error Handling" (bswen.com)
//
// توجه: اگر در آینده به Express 5 ارتقا پیدا کنید، این فایل منسوخ خواهد شد
// زیرا Express 5 خود به‌طور خودکار async errorها را مدیریت می‌کند.

/**
 * @function asyncHandler
 * @description یک تابع async را دریافت کرده و آن را در یک Promise.resolve
 * قرار می‌دهد. در صورت reject شدن (بروز خطا)، .catch(next) صدا زده می‌شود
 * که کنترل خطا را به middleware سراسری Express می‌سپارد.
 *
 * @param {Function} fn - یک تابع async با امضای (req, res, next)
 * @returns {Function} - یک middleware جدید Express که خطاها را خودکار مدیریت می‌کند
 *
 * @example
 * // استفاده در کنترلر:
 * const asyncHandler = require('../utils/asyncHandler');
 * exports.createPost = asyncHandler(async (req, res) => {
 *     const post = await Post.create(req.body);
 *     res.status(201).json({ success: true, data: post });
 * });
 */
const asyncHandler = (fn) => {
    return (req, res, next) => {
        // fn(req, res, next) یک Promise برمی‌گرداند (چون async است).
        // آن را در Promise.resolve می‌پیچیم تا حتی اگر fn اصلاً async نبود
        // هم Promise باشد. سپس .catch(next) هر خطا را به Express می‌دهد.
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

module.exports = asyncHandler;
