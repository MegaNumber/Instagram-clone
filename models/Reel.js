// مسیر فایل: /models/Reel.js
// توضیح: مدل Mongoose برای ریلز (Reels) – ویدئوهای کوتاه مشابه اینستاگرام.
// این مدل اطلاعات کاملی از جمله نویسنده، مسیر ویدئو، thumbnail، کپشن،
// هشتگ‌ها، آمار بازدید و لایک‌ها را ذخیره می‌کند. ایندکس‌های ترکیبی
// و متدهای کمکی، کوئری‌های متداول را سریع و ساده می‌سازند.
//
// @version 2.4.4
// @since 2026

// ============================================================
// بخش ۱: ایمپورت ماژول‌های مورد نیاز
// ============================================================
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// ============================================================
// بخش ۲: ثابت‌های پیکربندی
// ============================================================
const CAPTION_MAX_LENGTH = 2200;                // حداکثر طول کپشن
const MEDIA_PATH_REGEX = /^\/(uploads|videos|images)\/[\w\-./]+\.(mp4|webm|mov|avi|jpg|jpeg|png|webp)$/i;

// ============================================================
// بخش ۳: تعریف طرحواره ریلز (Reel Schema)
// ============================================================
const ReelSchema = new Schema(
    {
        // ---------- نویسنده ----------
        author: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'نویسنده ریلز الزامی است.'],
            index: true,
        },
        // ---------- مسیر ویدئو ----------
        videoUrl: {
            type: String,
            required: [true, 'ویدئوی ریلز الزامی است.'],
            validate: {
                validator: (v) => MEDIA_PATH_REGEX.test(v),
                message: 'مسیر فایل ویدئو نامعتبر است.',
            },
        },
        // ---------- تصویر بندانگشتی (Thumbnail) ----------
        thumbnailUrl: {
            type: String,
            default: '',
            validate: {
                validator: function (v) {
                    if (!v) return true;
                    return MEDIA_PATH_REGEX.test(v);
                },
                message: 'مسیر فایل thumbnail نامعتبر است.',
            },
        },
        // ---------- کپشن ----------
        caption: {
            type: String,
            maxlength: [CAPTION_MAX_LENGTH, `کپشن نمی‌تواند بیشتر از ${CAPTION_MAX_LENGTH} کاراکتر باشد.`],
            default: '',
        },
        // ---------- هشتگ‌ها ----------
        hashtags: [
            {
                type: String,
                lowercase: true,
            },
        ],
        // ---------- مدت زمان ویدئو (ثانیه) ----------
        duration: {
            type: Number,
            default: 0,
            min: 0,
        },
        // ---------- تعداد بازدید ----------
        views: {
            type: Number,
            default: 0,
            min: 0,
        },
        // ---------- لایک‌ها ----------
        likes: {
            type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
            default: [],
            validate: {
                // جلوگیری از لایک تکراری
                validator: function (likes) {
                    const ids = likes.map((id) => id.toString());
                    return new Set(ids).size === ids.length;
                },
                message: 'امکان ثبت لایک تکراری وجود ندارد.',
            },
        },
        // ---------- نظرات ----------
        comments: [
            {
                type: Schema.Types.ObjectId,
                ref: 'Comment',
            },
        ],
        // ---------- اطلاعات آهنگ ----------
        audioTitle: {
            type: String,
            default: '',
            maxlength: [200, 'عنوان آهنگ نمی‌تواند بیشتر از ۲۰۰ کاراکتر باشد.'],
        },
        audioArtist: {
            type: String,
            default: '',
            maxlength: [200, 'نام هنرمند نمی‌تواند بیشتر از ۲۰۰ کاراکتر باشد.'],
        },
    },
    // گزینه‌های طرحواره
    {
        timestamps: true,
        versionKey: false,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// ============================================================
// بخش ۴: ایندکس‌های ترکیبی برای عملکرد بهینه
// ============================================================
// دریافت ریلزهای یک کاربر (جدیدترین)
ReelSchema.index({ author: 1, createdAt: -1 });
// جستجوی ریلز بر اساس هشتگ (جدیدترین)
ReelSchema.index({ hashtags: 1, createdAt: -1 });
// مرتب‌سازی کلی (برای صفحهٔ Explore)
ReelSchema.index({ views: -1, createdAt: -1 });

// ============================================================
// بخش ۵: فیلدهای مجازی (Virtuals)
// ============================================================

/**
 * @virtual
 * @description تعداد لایک‌های این ریلز
 */
ReelSchema.virtual('likeCount').get(function () {
    return this.likes ? this.likes.length : 0;
});

/**
 * @virtual
 * @description تعداد نظرات این ریلز
 */
ReelSchema.virtual('commentCount').get(function () {
    return this.comments ? this.comments.length : 0;
});

/**
 * @virtual
 * @description نرخ تعامل (Engagement Rate) بر اساس لایک و بازدید
 */
ReelSchema.virtual('engagementScore').get(function () {
    if (!this.views || this.views === 0) return 0;
    return ((this.likes ? this.likes.length : 0) / this.views) * 100;
});

// ============================================================
// بخش ۶: متدهای استاتیک (کمکی)
// ============================================================

/**
 * افزایش یک واحدی بازدید ریلز
 * @param {string} reelId - شناسه ریلز
 * @returns {Promise<Document>}
 */
ReelSchema.statics.incrementViews = async function (reelId) {
    return this.findByIdAndUpdate(
        reelId,
        { $inc: { views: 1 } },
        { new: true, select: 'views' }
    );
};

/**
 * دریافت ریلزهای یک هشتگ خاص با صفحه‌بندی
 * @param {string} hashtag - هشتگ مورد جستجو (بدون #)
 * @param {object} options - { page, limit }
 * @returns {Promise<{reels: Array, total: number}>}
 */
ReelSchema.statics.findByHashtag = async function (hashtag, { page = 1, limit = 10 } = {}) {
    const skip = (page - 1) * limit;
    const [reels, total] = await Promise.all([
        this.find({ hashtags: hashtag.toLowerCase() })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        this.countDocuments({ hashtags: hashtag.toLowerCase() }),
    ]);
    return { reels, total };
};

// ============================================================
// بخش ۷: تبدیل خروجی JSON
// ============================================================
ReelSchema.set('toJSON', {
    transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret.__v;
        ret.likeCount = ret.likes ? ret.likes.length : 0;
        ret.commentCount = ret.comments ? ret.comments.length : 0;
        ret.engagementScore = ret.views > 0
            ? ((ret.likeCount || 0) / ret.views) * 100
            : 0;
        return ret;
    },
});

// ============================================================
// بخش ۸: صادرات مدل
// ============================================================
module.exports = mongoose.model('Reel', ReelSchema);
