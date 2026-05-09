// مسیر فایل: /middleware/rateLimiter.js
// توضیح: پیکربندی Rate Limiting پیشرفته با Redis Store.
// شامل Global Limiter، Auth Limiter، Post Limiter، Password Change Limiter
// و Slow Down. از اتصال Lazy Redis و fallback به Limiter درون‌حافظه‌ای
// برای مقاومت در برابر خطا استفاده می‌کند.
//
// @version 2.5.0
// @since 2026

const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const slowDown = require('express-slow-down');
const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
let redisClient = null;

/**
 * دریافت (یا ایجاد) کلاینت Redis.
 * در صورت عدم دسترسی به Redis، null برمی‌گرداند
 * تا Limiter به صورت in‑memory کار کند.
 */
const getRedisClient = () => {
    if (redisClient) {
        return redisClient.status === 'ready' ? redisClient : null;
    }
    try {
        redisClient = new Redis(REDIS_URL, {
            enableOfflineQueue: false,
            maxRetriesPerRequest: 2,
            retryStrategy(times) {
                return Math.min(times * 200, 2000);
            },
            lazyConnect: true,
        });
        redisClient.on('error', (err) => {
            console.warn('[RateLimiter] Redis error – falling back to memory:', err.message);
            redisClient = null;
        });
        return redisClient;
    } catch (err) {
        console.warn('[RateLimiter] Could not create Redis client:', err.message);
        return null;
    }
};

/**
 * ایجاد یک Store مناسب: Redis در صورت وجود، در غیر این صورت undefined
 * (که باعث می‌شود express‑rate‑limit از حافظهٔ پیش‌فرض استفاده کند)
 */
const createStore = () => {
    const client = getRedisClient();
    if (client) {
        return new RedisStore({
            sendCommand: (...args) => client.call(...args),
        });
    }
    return undefined;
};

// ===========================================
// Global Limiter – تمام مسیرهای /api
// ===========================================
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // ۱۵ دقیقه
    max: 200,                  // حداکثر ۲۰۰ درخواست
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: createStore(),
    keyGenerator: (req) => {
        return req.user?.id || req.ip;
    },
    skip: (req) => {
        // مسیر health check را مستثنی کن
        return req.path === '/api/health';
    },
    message: {
        success: false,
        error: 'تعداد درخواست‌ها بیش از حد مجاز است. لطفاً کمی صبر کنید.',
    },
});

// ===========================================
// Auth Limiter – ورود و ثبت‌نام
// ===========================================
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: createStore(),
    keyGenerator: (req) => req.ip,
    message: {
        success: false,
        error: 'تعداد تلاش‌های ورود بیش از حد مجاز است. ۱۵ دقیقه صبر کنید.',
    },
});

// ===========================================
// Post Creation Limiter – ایجاد پست جدید
// ===========================================
const postLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: createStore(),
    keyGenerator: (req) => req.user?.id || req.ip,
    message: {
        success: false,
        error: 'محدودیت ایجاد پست. ۱۵ دقیقه صبر کنید.',
    },
});

// ===========================================
// Password Change Limiter – تغییر رمز عبور
// ===========================================
const passwordChangeLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,   // ۱ ساعت
    max: 3,                     // حداکثر ۳ بار
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: createStore(),
    keyGenerator: (req) => req.user?.id || req.ip,
    message: {
        success: false,
        error: 'تغییر رمز عبور بیش از حد مجاز است. لطفاً یک ساعت صبر کنید.',
    },
});

// ===========================================
// API Slow Down – افزایش تأخیر به‌جای ردّ کامل
// ===========================================
const apiSlowDown = slowDown({
    windowMs: 15 * 60 * 1000,
    delayAfter: 100,                     // از صدمین درخواست به بعد
    delayMs: (used) => (used - 100) * 100, // تأخیر افزایشی (۱۰۰ms به ازای هر درخواست اضافه)
    store: createStore(),
});

module.exports = {
    globalLimiter,
    authLimiter,
    postLimiter,
    passwordChangeLimiter,
    apiSlowDown,
};
