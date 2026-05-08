// مسیر فایل: /middleware/rateLimiter.js
// توضیح: پیکربندی Rate Limiting پیشرفته با Redis Store.
// شامل Global Limiter، Auth Limiter، Post Limiter و Slow Down.

const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const slowDown = require('express-slow-down');
const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
let redisClient = null;

const getRedisClient = () => {
    if (!redisClient) {
        redisClient = new Redis(REDIS_URL, {
            enableOfflineQueue: false,
            maxRetriesPerRequest: 3,
        });
        redisClient.on('error', (err) => {
            console.warn('[RateLimiter] Redis error:', err.message);
        });
    }
    return redisClient;
};

// ===========================================
// Global Limiter
// ===========================================
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // ۱۵ دقیقه
    max: 200,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: new RedisStore({
        sendCommand: (...args) => getRedisClient().call(...args),
    }),
    keyGenerator: (req) => {
        return req.user?.id || req.ip;
    },
    message: {
        success: false,
        error: 'تعداد درخواست‌ها بیش از حد مجاز است. لطفاً کمی صبر کنید.',
    },
});

// ===========================================
// Auth Limiter (ورود/ثبت‌نام)
// ===========================================
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: new RedisStore({
        sendCommand: (...args) => getRedisClient().call(...args),
    }),
    keyGenerator: (req) => req.ip,
    message: {
        success: false,
        error: 'تعداد تلاش‌های ورود بیش از حد مجاز است. ۱۵ دقیقه صبر کنید.',
    },
});

// ===========================================
// Post Creation Limiter
// ===========================================
const postLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: new RedisStore({
        sendCommand: (...args) => getRedisClient().call(...args),
    }),
    keyGenerator: (req) => req.user?.id || req.ip,
    message: {
        success: false,
        error: 'محدودیت ایجاد پست. ۱۵ دقیقه صبر کنید.',
    },
});

// ===========================================
// Slow Down — به جای مسدود کردن، سرعت را کم می‌کند
// ===========================================
const apiSlowDown = slowDown({
    windowMs: 15 * 60 * 1000,
    delayAfter: 100,
    delayMs: (used) => (used - 100) * 100, // تاخیر افزایشی
    store: new RedisStore({
        sendCommand: (...args) => getRedisClient().call(...args),
    }),
});

module.exports = { globalLimiter, authLimiter, postLimiter, apiSlowDown };
