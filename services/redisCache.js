// مسیر فایل: /services/redisCache.js
// توضیح: سرویس کش Redis با الگوی Cache-Aside + fallback خودکار.
// بر اساس آخرین متدهای ۲۰۲۶: استفاده از ioredis، اتصال lazy،
// و graceful degradation در صورت قطع Redis.

const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const DEFAULT_TTL = 300; // ۵ دقیقه

class RedisCache {
    constructor() {
        this._client = null;
        this._enabled = process.env.REDIS_ENABLED !== 'false';
    }

    get client() {
        if (!this._enabled) return null;
        if (!this._client) {
            this._client = new Redis(REDIS_URL, {
                maxRetriesPerRequest: 3,
                retryStrategy(times) {
                    return Math.min(times * 200, 3000);
                },
                lazyConnect: true,
                enableOfflineQueue: false,
            });
            this._client.on('error', (err) => {
                console.warn('[RedisCache] Connection error:', err.message);
            });
        }
        return this._client;
    }

    /**
     * دریافت داده از کش، در صورت عدم وجود اجرای fetcher و ذخیره در کش
     * @param {string} key - کلید کش
     * @param {function} fetcher - تابع دریافت داده از دیتابیس
     * @param {number} ttl - زمان انقضا (ثانیه)
     */
    async get(key, fetcher, ttl = DEFAULT_TTL) {
        if (!this.client) {
            return fetcher();
        }
        try {
            const cached = await this.client.get(key);
            if (cached) {
                return JSON.parse(cached);
            }
        } catch (err) {
            console.warn('[RedisCache] Get error, falling back to DB:', err.message);
        }

        const data = await fetcher();
        if (data) {
            try {
                await this.client.set(key, JSON.stringify(data), 'EX', ttl);
            } catch (err) {
                console.warn('[RedisCache] Set error:', err.message);
            }
        }
        return data;
    }

    /**
     * حذف کلید(ها) از کش
     * @param {string|string[]} keys - کلید یا آرایه کلیدها
     */
    async del(keys) {
        if (!this.client) return;
        try {
            const keyArray = Array.isArray(keys) ? keys : [keys];
            if (keyArray.length > 0) {
                await this.client.del(...keyArray);
            }
        } catch (err) {
            console.warn('[RedisCache] Del error:', err.message);
        }
    }

    /**
     * حذف تمام کلیدهای مطابق با الگو
     * @param {string} pattern - الگوی glob
     */
    async delByPattern(pattern) {
        if (!this.client) return;
        try {
            const keys = await this.client.keys(pattern);
            if (keys.length > 0) {
                await this.client.del(...keys);
            }
        } catch (err) {
            console.warn('[RedisCache] DelByPattern error:', err.message);
        }
    }

    /**
     * افزایش عددی یک کلید (برای rate limiting)
     */
    async incr(key, ttl) {
        if (!this.client) return 1;
        try {
            const val = await this.client.incr(key);
            if (val === 1 && ttl) {
                await this.client.expire(key, ttl);
            }
            return val;
        } catch (err) {
            return 1;
        }
    }
}

module.exports = new RedisCache();
