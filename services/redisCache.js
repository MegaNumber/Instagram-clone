// مسیر فایل: /services/redisCache.js
// توضیح: سرویس کش Redis با الگوی Cache-Aside + fallback خودکار.
// در صورت در دسترس نبودن Redis، به‌طور خودکار داده را مستقیماً
// از دیتابیس دریافت می‌کند (graceful degradation).
// از ioredis با اتصال lazy و retry strategy استفاده می‌کند.
//
// @version 2.5.0
// @since 2026

const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const DEFAULT_TTL = parseInt(process.env.REDIS_DEFAULT_TTL, 10) || 300; // ۵ دقیقه

class RedisCache {
    constructor() {
        this._client = null;
        this._enabled = process.env.REDIS_ENABLED !== 'false';
    }

    /**
     * دریافت (یا ایجاد) کلاینت Redis با استراتژی اتصال مجدد
     */
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
     * اتصال صریح (در صورت نیاز در startup)
     */
    async connect() {
        if (this.client && this.client.status !== 'ready') {
            await this.client.connect();
            console.log('[RedisCache] Connected successfully');
        }
    }

    /**
     * دریافت از کش، در صورت عدم وجود اجرای fetcher و ذخیره
     * @param {string} key - کلید کش
     * @param {function} fetcher - تابع async برای دریافت داده
     * @param {number} ttl - زمان انقضا (ثانیه)
     */
    async get(key, fetcher, ttl = DEFAULT_TTL) {
        if (!this.client) {
            return fetcher();
        }
        try {
            const cached = await this.client.get(key);
            if (cached !== null) {
                return JSON.parse(cached);
            }
        } catch (err) {
            console.warn('[RedisCache] Get error, falling back to DB:', err.message);
        }

        const data = await fetcher();
        if (data !== null && data !== undefined) {
            try {
                await this.client.set(key, JSON.stringify(data), 'EX', ttl);
            } catch (err) {
                console.warn('[RedisCache] Set error:', err.message);
            }
        }
        return data;
    }

    /**
     * تنظیم مستقیم یک کلید
     * @param {string} key
     * @param {any} value
     * @param {number} ttl
     */
    async set(key, value, ttl = DEFAULT_TTL) {
        if (!this.client) return;
        try {
            await this.client.set(key, JSON.stringify(value), 'EX', ttl);
        } catch (err) {
            console.warn('[RedisCache] Set error:', err.message);
        }
    }

    /**
     * بررسی وجود کلید
     * @param {string} key
     * @returns {Promise<boolean>}
     */
    async exists(key) {
        if (!this.client) return false;
        try {
            const result = await this.client.exists(key);
            return result === 1;
        } catch (err) {
            return false;
        }
    }

    /**
     * حذف کلید(ها)
     * @param {string|string[]} keys
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
     * حذف کلیدهای مطابق الگو
     * @param {string} pattern - glob pattern
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
     * افزایش عددی (برای rate limiting)
     * @param {string} key
     * @param {number} ttl
     * @returns {Promise<number>}
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
