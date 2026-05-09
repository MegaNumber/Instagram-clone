// مسیر فایل: /services/contentCategorizer.js
// توضیح: سرویس دسته‌بندی خودکار محتوا. با تحلیل هشتگ‌ها و کلمات کلیدی،
// پست‌ها را به یکی از ۱۲ دسته استاندارد اینستاگرام (مانند تکنولوژی،
// ورزش، مُد و ...) نسبت می‌دهد. همچنین با بررسی ۱۲ پست آخر هر کاربر،
// خوشه (Cluster) موضوعی اصلی او را تشخیص می‌دهد تا در الگوریتم
// رتبه‌بندی Feed و Explore مورد استفاده قرار گیرد.
//
// @version 2.5.0
// @since 2026

// ============================================================
// بخش ۱: نگاشت دوطرفه هشتگ به دسته‌بندی‌های استاندارد اینستاگرام
// ============================================================
// بر اساس تحلیل ترندهای اینستاگرام در سال ۲۰۲۶ و پوشش ریز-حوزه‌های تخصصی
const TOPIC_HASHTAG_MAP = {
    technology: {
        faName: 'تکنولوژی',
        keywords: ['tech', 'programming', 'coding', 'developer', 'software', 'ai',
                   'ml', 'javascript', 'python', 'react', 'nodejs', 'startup',
                   'cybersecurity', 'blockchain', 'web3', 'data', 'cloud',
                   'devops', 'android', 'ios', 'app', 'gadget', 'innovation']
    },
    photography: {
        faName: 'عکاسی',
        keywords: ['photography', 'photo', 'photooftheday', 'camera', 'landscape',
                   'portrait', 'naturephotography', 'streetphotography', 'bnw',
                   'dslr', 'mirrorless', 'lightroom', 'photoshop', 'edit',
                   'visual', 'aesthetic', 'composition']
    },
    food: {
        faName: 'غذا و آشپزی',
        keywords: ['food', 'foodie', 'cooking', 'recipe', 'delicious', 'homemade',
                   'bakery', 'restaurant', 'chef', 'vegan', 'vegetarian',
                   'dessert', 'pizza', 'burger', 'sushi', 'coffee', 'breakfast']
    },
    fitness: {
        faName: 'تناسب اندام',
        keywords: ['fitness', 'workout', 'gym', 'exercise', 'health', 'training',
                   'bodybuilding', 'yoga', 'running', 'crossfit', 'cardio',
                   'muscle', 'weightloss', 'nutrition', 'supplement', 'wellness']
    },
    travel: {
        faName: 'گردشگری',
        keywords: ['travel', 'wanderlust', 'adventure', 'explore', 'vacation',
                   'trip', 'nature', 'backpacking', 'roadtrip', 'tour',
                   'destination', 'beach', 'mountain', 'hiking', 'camping',
                   'passport', 'travelgram', 'hotel']
    },
    fashion: {
        faName: 'مُد و زیبایی',
        keywords: ['fashion', 'style', 'outfit', 'clothing', 'designer', 'beauty',
                   'makeup', 'skincare', 'hair', 'nails', 'accessories', 'jewelry',
                   'luxury', 'streetwear', 'vintage', 'model', 'runway']
    },
    music: {
        faName: 'موسیقی',
        keywords: ['music', 'song', 'musician', 'guitar', 'piano', 'concert',
                   'singer', 'rap', 'hiphop', 'rock', 'pop', 'jazz', 'classical',
                   'electronic', 'dj', 'producer', 'beats', 'sound', 'album']
    },
    art: {
        faName: 'هنر و طراحی',
        keywords: ['art', 'drawing', 'sketch', 'painting', 'digitalart',
                   'illustration', 'design', 'graphicdesign', 'animation',
                   '3d', 'sculpture', 'craft', 'diy', 'creative', 'artist']
    },
    sports: {
        faName: 'ورزش',
        keywords: ['sports', 'football', 'soccer', 'basketball', 'baseball',
                   'tennis', 'golf', 'swimming', 'boxing', 'mma', 'ufc',
                   'cricket', 'rugby', 'hockey', 'olympics', 'athlete', 'team']
    },
    lifestyle: {
        faName: 'سبک زندگی',
        keywords: ['lifestyle', 'life', 'motivation', 'inspiration', 'daily',
                   'vlog', 'blogger', 'influencer', 'family', 'home',
                   'decor', 'minimalism', 'organization', 'routine']
    },
    education: {
        faName: 'آموزش',
        keywords: ['education', 'learning', 'study', 'tutorial', 'course',
                   'teacher', 'student', 'university', 'college', 'school',
                   'science', 'math', 'history', 'language', 'knowledge']
    },
    entertainment: {
        faName: 'سرگرمی',
        keywords: ['entertainment', 'fun', 'comedy', 'funny', 'meme', 'viral',
                   'challenge', 'trending', 'dance', 'prank', 'game', 'gaming',
                   'movie', 'film', 'cinema', 'netflix', 'show', 'series']
    }
};

// ============================================================
// بخش ۲: کلاس دسته‌بندی‌کننده محتوا
// ============================================================
class ContentCategorizer {
    constructor() {
        // ساخت یک Map معکوس: از هر کلمه کلیدی به نام دسته
        this._keywordToCategory = new Map();
        for (const [category, data] of Object.entries(TOPIC_HASHTAG_MAP)) {
            for (const keyword of data.keywords) {
                this._keywordToCategory.set(keyword.toLowerCase(), category);
            }
        }
        console.log(`[ContentCategorizer] Initialized with ${Object.keys(TOPIC_HASHTAG_MAP).length} categories.`);
    }

    /**
     * دسته‌بندی یک پست بر اساس هشتگ‌های آن
     * @param {string[]} hashtags - آرایه‌ای از هشتگ‌ها (بدون علامت #)
     * @param {string} [caption] - متن کپشن (اختیاری)
     * @returns {{ category: string, faName: string, score: number }}
     */
    categorizePost(hashtags = [], caption = '') {
        const scores = {};

        // امتیازدهی بر اساس هشتگ‌ها
        for (const hashtag of hashtags) {
            const category = this._keywordToCategory.get(hashtag.toLowerCase());
            if (category) {
                scores[category] = (scores[category] || 0) + 2; // وزن بیشتر برای هشتگ
            }
        }

        // امتیازدهی بر اساس کلمات کپشن (اختیاری)
        if (caption) {
            const words = caption.toLowerCase().split(/\s+/);
            for (const word of words) {
                const category = this._keywordToCategory.get(word);
                if (category) {
                    scores[category] = (scores[category] || 0) + 1; // وزن کمتر برای کپشن
                }
            }
        }

        // یافتن دسته با بیشترین امتیاز
        const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
        if (sorted.length === 0) {
            return { category: 'general', faName: 'عمومی', score: 0 };
        }

        const [winner, score] = sorted[0];
        return {
            category: winner,
            faName: TOPIC_HASHTAG_MAP[winner]?.faName || 'عمومی',
            score
        };
    }

    /**
     * تشخیص خوشه (Cluster) موضوعی کاربر بر اساس ۱۲ پست آخر او
     * (شبیه‌سازی Micro‑Niche Detection در اینستاگرام ۲۰۲۶)
     * @param {string} userId - شناسه کاربر
     * @returns {Promise<{category: string, faName: string, score: number}>}
     */
    async getUserTopicCluster(userId) {
        const Post = require('../models/Post');
        // بازیابی ۱۲ پست آخر کاربر
        const posts = await Post.find({ author: userId })
            .sort({ createdAt: -1 })
            .limit(12)
            .select('hashtags caption')
            .lean();

        if (posts.length === 0) {
            return { category: 'general', faName: 'عمومی', score: 0 };
        }

        const topicCounts = {};
        for (const post of posts) {
            const { category } = this.categorizePost(post.hashtags || [], post.caption || '');
            topicCounts[category] = (topicCounts[category] || 0) + 1;
        }

        // یافتن پرتکرارترین موضوع
        const sorted = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]);
        const [dominantTopic, count] = sorted[0];

        return {
            category: dominantTopic,
            faName: TOPIC_HASHTAG_MAP[dominantTopic]?.faName || 'عمومی',
            score: count
        };
    }

    /**
     * دریافت لیست تمام دسته‌بندی‌های موجود
     * @returns {{ category: string, faName: string }[]}
     */
    getAllCategories() {
        return Object.entries(TOPIC_HASHTAG_MAP).map(([key, data]) => ({
            category: key,
            faName: data.faName
        }));
    }

    /**
     * یافتن پست‌های مشابه با یک خوشه موضوعی خاص
     * @param {string} category - نام دسته
     * @param {number} limit - تعداد پست‌ها
     * @returns {Promise<Array>}
     */
    async getPostsByCategory(category, limit = 20) {
        if (!TOPIC_HASHTAG_MAP[category]) return [];

        const Post = require('../models/Post');
        const keywords = TOPIC_HASHTAG_MAP[category].keywords;

        return Post.find({ hashtags: { $in: keywords } })
            .populate('author', 'username avatar')
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
    }
}

// ============================================================
// بخش ۳: صادرات نمونه Singleton
// ============================================================
module.exports = new ContentCategorizer();
module.exports.TOPIC_HASHTAG_MAP = TOPIC_HASHTAG_MAP;
module.exports.ContentCategorizer = ContentCategorizer;
