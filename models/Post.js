// مسیر فایل: /models/Post.js
// توضیح: مدل Mongoose برای پست‌ها. این فایل ساختار یک پست، اعتبارسنجی‌ها،
// ایندکس‌های بهینه (ESR Rule) برای کوئری‌های متداول، و هوک‌های لازم
// برای پاک‌سازی آبشاری را تعریف می‌کند. همچنین از فیلدهای مجازی برای
// محاسبهٔ تعداد لایک‌ها و نظرات استفاده می‌کند.
// ویژگی‌های پیشرفته: مکان جغرافیایی (GeoJSON)، وضعیت پست (published/draft/archived)
// و محدودیت تعداد هشتگ.
//
// تغییرات نسخه ۲.۳.۱:
// - افزودن ایندکس 2dsphere برای location جهت پشتیبانی از کوئری‌های مکانی
// - بهبود regex اعتبارسنجی thumbnail
// - افزودن توضیحات دقیق‌تر برای هوک حذف

// ============================================================
// بخش ۱: ایمپورت ماژول‌ها
// ============================================================
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// ============================================================
// بخش ۲: ثابت‌های پیکربندی
// ============================================================
const HASHTAG_MAX_ITEMS = 30;
const CAPTION_MAX_LENGTH = 2200;
// مسیرهای مجاز: /uploads/... یا /images/... با یک زیرپوشهٔ اختیاری
const IMAGE_PATH_REGEX = /^\/(uploads|images)\/[\w\-./]+\.(jpg|jpeg|png|webp|gif)$/i;

// ============================================================
// بخش ۳: تعریف طرحواره پست
// ============================================================
const PostSchema = new Schema(
    {
        // ---------- تصویر اصلی ----------
        image: {
            type: String,
            required: [true, 'تصویر پست الزامی است.'],
            trim: true,
            validate: {
                validator: (v) => IMAGE_PATH_REGEX.test(v),
                message: 'مسیر فایل تصویر اصلی نامعتبر است.',
            },
        },
        // ---------- بندانگشتی (Thumbnail) ----------
        thumbnail: {
            type: String,
            trim: true,
            default: '',
            validate: {
                validator: function (v) {
                    if (!v) return true;
                    return IMAGE_PATH_REGEX.test(v);
                },
                message: 'مسیر فایل بندانگشتی نامعتبر است.',
            },
        },
        // ---------- فیلتر تصویر ----------
        filter: {
            type: String,
            trim: true,
            default: 'normal',
        },
        // ---------- کپشن ----------
        caption: {
            type: String,
            trim: true,
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
        // ---------- مکان جغرافیایی (GeoJSON Point) ----------
        location: {
            type: {
                type: String,
                enum: ['Point'],
                default: undefined,
            },
            coordinates: {
                type: [Number],   // [longitude, latitude]
                default: undefined,
            },
            name: {
                type: String,
                trim: true,
                maxlength: 200,
                default: '',
            },
        },
        // ---------- نویسنده ----------
        author: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'نویسنده پست الزامی است.'],
            index: true,
        },
        // ---------- وضعیت ----------
        status: {
            type: String,
            enum: ['published', 'archived', 'draft'],
            default: 'published',
            index: true,
        },
    },
    {
        timestamps: {
            createdAt: 'createdAt',
            updatedAt: 'updatedAt',
        },
        versionKey: false,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// ============================================================
// بخش ۴: ایندکس‌های بهینه (ESR Rule)
// ============================================================
// ۱. فید اصلی: وضعیت + جدیدترین
PostSchema.index({ status: 1, createdAt: -1 });
// ۲. پست‌های یک کاربر: نویسنده + جدیدترین
PostSchema.index({ author: 1, createdAt: -1 });
// ۳. جستجوی هشتگ
PostSchema.index({ hashtags: 1, createdAt: -1 });
// ۴. جستجوی مکانی (آینده‌نگر)
PostSchema.index({ location: '2dsphere' });

// ============================================================
// بخش ۵: هوک‌ها
// ============================================================

// ----- ۵.۱. حذف آبشاری -----
// وقتی یک پست حذف می‌شود (مثلاً با Post.deleteOne({_id}) یا findByIdAndDelete)
// تمام داده‌های مرتبط نیز حذف شوند.
PostSchema.pre('deleteOne', { document: false, query: true }, async function (next) {
    const postId = this.getFilter()._id;
    if (!postId) {
        console.warn('[Post.deleteOne] No _id in filter, skipping cascade.');
        return next();
    }
    try {
        await Promise.all([
            mongoose.model('PostVote').deleteOne({ post: postId }),
            mongoose.model('Comment').deleteMany({ post: postId }),
            mongoose.model('Notification').deleteMany({ 'notificationData.postId': postId }),
        ]);
        console.log(`[Cascade] Cleanup for post ${postId} completed.`);
        next();
    } catch (err) {
        next(err);
    }
});

// ----- ۵.۲. محدودیت تعداد هشتگ -----
PostSchema.pre('save', function (next) {
    if (this.hashtags && this.hashtags.length > HASHTAG_MAX_ITEMS) {
        this.hashtags = this.hashtags.slice(0, HASHTAG_MAX_ITEMS);
        console.warn(`[Post.pre-save] Hashtags truncated to ${HASHTAG_MAX_ITEMS}.`);
    }
    next();
});

// ============================================================
// بخش ۶: فیلدهای مجازی
// ============================================================
PostSchema.virtual('likeCount', {
    ref: 'PostVote',
    localField: '_id',
    foreignField: 'post',
    count: true,
});

PostSchema.virtual('commentCount', {
    ref: 'Comment',
    localField: '_id',
    foreignField: 'post',
    count: true,
});

// ============================================================
// بخش ۷: تبدیل خروجی JSON
// ============================================================
PostSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.__v;
        return ret;
    },
});

// ============================================================
// بخش ۸: متدهای استاتیک (کمکی)
// ============================================================
/**
 * پیدا کردن پست با شناسه و در صورت نیاز بررسی نویسنده
 * @param {string} postId
 * @param {string} [authorId] - اگر داده شود، پست فقط در صورت تطابق نویسنده برگردانده می‌شود
 * @returns {Promise<Post|null>}
 */
PostSchema.statics.findByIdAndAuthor = async function (postId, authorId) {
    const query = { _id: postId };
    if (authorId) query.author = authorId;
    return this.findOne(query);
};

// ============================================================
// بخش ۹: صادرات مدل
// ============================================================
const Post = mongoose.model('Post', PostSchema);
module.exports = Post;
