// مسیر فایل: /models/Story.js
// توضیح: مدل Mongoose برای استوری‌ها. هر استوری پس از ۲۴ ساعت به‌طور خودکار
// توسط TTL Index از دیتابیس حذف می‌شود. شامل فیلدهای ضروری برای تصویر/ویدئو،
// بازدیدها، لایک‌ها، موقعیت مکانی و متدهای کمکی برای کار با استوری‌های فعال.
//
// @version 2.4.1
// @since 2026

// ============================================================
// بخش ۱: ایمپورت ماژول‌ها و ثابت‌ها
// ============================================================
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const STORY_EXPIRY_SECONDS = 24 * 60 * 60; // ۲۴ ساعت
const MEDIA_PATH_REGEX = /^\/(uploads|images)\/[\w\-./]+\.(jpg|jpeg|png|webp|gif|mp4|webm|mov)$/i;

// ============================================================
// بخش ۲: زیرطرحواره‌ها
// ============================================================
const ViewerSchema = new Schema(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        viewedAt: { type: Date, default: Date.now },
    },
    { _id: false }
);

const LikeSchema = new Schema(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        likedAt: { type: Date, default: Date.now },
    },
    { _id: false }
);

// ============================================================
// بخش ۳: طرحواره اصلی استوری
// ============================================================
const StorySchema = new Schema(
    {
        author: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'نویسنده استوری الزامی است.'],
            index: true,
        },
        mediaUrl: {
            type: String,
            required: [true, 'فایل مدیا الزامی است.'],
            validate: {
                validator: (v) => MEDIA_PATH_REGEX.test(v),
                message: 'مسیر فایل مدیا نامعتبر است.',
            },
        },
        thumbnailUrl: {
            type: String,
            default: '',
            validate: {
                validator: function (v) {
                    if (!v) return true;
                    return MEDIA_PATH_REGEX.test(v);
                },
                message: 'مسیر thumbnail نامعتبر است.',
            },
        },
        mediaType: {
            type: String,
            enum: ['image', 'video'],
            default: 'image',
        },
        duration: {
            type: Number,  // مدت زمان ویدئو به ثانیه (برای ویدئوها)
            default: 0,
            min: 0,
        },
        caption: {
            type: String,
            maxlength: [500, 'کپشن نمی‌تواند بیشتر از ۵۰۰ کاراکتر باشد.'],
            default: '',
        },
        viewers: {
            type: [ViewerSchema],
            default: [],
        },
        likes: {
            type: [LikeSchema],
            default: [],
            validate: {
                validator: function (likes) {
                    // جلوگیری از لایک تکراری (اعتبارسنجی حداقلی)
                    const userIds = likes.map((l) => l.user.toString());
                    return new Set(userIds).size === userIds.length;
                },
                message: 'امکان لایک تکراری وجود ندارد.',
            },
        },
        // موقعیت مکانی (اختیاری)
        location: {
            type: {
                type: String,
                enum: ['Point'],
                default: undefined,
            },
            coordinates: {
                type: [Number],
                default: undefined,
            },
            name: {
                type: String,
                trim: true,
                maxlength: 200,
                default: '',
            },
        },
        // فیلد کلیدی برای TTL
        expiresAt: {
            type: Date,
            default: () => new Date(Date.now() + STORY_EXPIRY_SECONDS * 1000),
            index: { expireAfterSeconds: 0 }, // MongoDB TTL Index
        },
    },
    {
        timestamps: true,
        versionKey: false,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// ============================================================
// بخش ۴: ایندکس‌های ترکیبی
// ============================================================
// استوری‌های فعال یک کاربر (برای نمایش پروفایل)
StorySchema.index({ author: 1, expiresAt: 1 });
// جستجوی استوری‌های فعال بر اساس موقعیت مکانی (در آینده)
StorySchema.index({ location: '2dsphere' });

// ============================================================
// بخش ۵: فیلدهای مجازی
// ============================================================

StorySchema.virtual('viewerCount').get(function () {
    return this.viewers ? this.viewers.length : 0;
});

StorySchema.virtual('likeCount').get(function () {
    return this.likes ? this.likes.length : 0;
});

/**
 * @virtual
 * @description آیا این استوری هنوز منقضی نشده است؟
 */
StorySchema.virtual('isActive').get(function () {
    return this.expiresAt ? this.expiresAt > new Date() : false;
});

// ============================================================
// بخش ۶: متدهای استاتیک (کمکی)
// ============================================================

/**
 * دریافت تمام استوری‌های فعال (منقضی‌نشده) یک کاربر
 * @param {string} userId
 * @returns {Promise<Array>}
 */
StorySchema.statics.findActiveByUser = function (userId) {
    return this.find({
        author: userId,
        expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });
};

/**
 * افزودن بازدیدکننده به استوری (در صورت عدم وجود قبلی)
 * @param {string} storyId
 * @param {string} viewerId
 * @returns {Promise<boolean>} - true اگر بازدید جدید ثبت شد
 */
StorySchema.statics.viewStory = async function (storyId, viewerId) {
    const result = await this.updateOne(
        { _id: storyId, 'viewers.user': { $ne: viewerId } },
        { $push: { viewers: { user: viewerId } } }
    );
    return result.modifiedCount > 0;
};

// ============================================================
// بخش ۷: تبدیل خروجی JSON
// ============================================================
StorySchema.set('toJSON', {
    transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret.__v;
        ret.viewerCount = ret.viewers ? ret.viewers.length : 0;
        ret.likeCount = ret.likes ? ret.likes.length : 0;
        ret.isActive = ret.expiresAt ? ret.expiresAt > new Date() : false;
        return ret;
    },
});

// ============================================================
// بخش ۸: صادرات مدل
// ============================================================
module.exports = mongoose.model('Story', StorySchema);
