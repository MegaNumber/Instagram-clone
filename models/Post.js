// مسیر فایل: /models/Post.js
// توضیح: مدل Mongoose برای پست‌ها. این فایل ساختار یک پست را به همراه
// اعتبارسنجی‌های پیشرفته، ایندکس‌های بهینه برای کوئری‌های متداول و
// هوک‌های لازم برای حفظ یکپارچگی داده‌ها تعریف می‌کند.

// ============================================================
// بخش ۱: ایمپورت ماژول‌های مورد نیاز
// ============================================================
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// ============================================================
// بخش ۲: ثابت‌های پیکربندی (Configuration Constants)
// ============================================================
const HASHTAG_MAX_ITEMS = 30; // حداکثر تعداد هشتگ در هر پست
const CAPTION_MAX_LENGTH = 2200; // حداکثر طول کپشن (مطابق با استاندارد اینستاگرام)
const IMAGE_PATH_REGEX = /^\/(uploads|images)\/.+\.(jpg|jpeg|png|webp|gif)$/i; // اعتبارسنجی مسیر تصویر

// ============================================================
// بخش ۳: تعریف طرحواره پست (Post Schema Definition)
// ============================================================
const PostSchema = new Schema(
    {
        // ---------- تصویر اصلی پست ----------
        image: {
            type: String,
            required: [true, 'تصویر پست الزامی است.'],
            trim: true,
            validate: {
                validator: function (value) {
                    // مسیر ذخیره‌سازی محلی باید با الگوی مشخصی مطابقت داشته باشد
                    return IMAGE_PATH_REGEX.test(value);
                },
                message: 'مسیر فایل تصویر اصلی نامعتبر است.',
            },
        },
        // ---------- نسخه بندانگشتی (Thumbnail) ----------
        thumbnail: {
            type: String,
            trim: true,
            validate: {
                validator: function (value) {
                    if (!value) return true; // فیلد اختیاری
                    return IMAGE_PATH_REGEX.test(value);
                },
                message: 'مسیر فایل بندانگشتی نامعتبر است.',
            },
            default: '', // در صورت عدم وجود، از image استفاده می‌شود
        },
        // ---------- فیلتر تصویر ----------
        filter: {
            type: String,
            trim: true,
            // پیش‌فرض 'normal' نشان‌دهنده عدم اعمال فیلتر است
            default: 'normal',
        },
        // ---------- متن کپشن پست ----------
        caption: {
            type: String,
            trim: true,
            maxlength: [CAPTION_MAX_LENGTH, `کپشن نمی‌تواند بیشتر از ${CAPTION_MAX_LENGTH} کاراکتر باشد.`],
            default: '',
        },
        // ---------- هشتگ‌های استخراج‌شده از متن ----------
        hashtags: [
            {
                type: String,
                lowercase: true, // ذخیره به صورت حروف کوچک برای جستجوی غیرحساس به بزرگی
            },
        ],
        // ---------- مکان جغرافیایی (ویژگی جدید) ----------
        // این فیلد برای ذخیره مکان ثبت پست (مشابه Instagram) اضافه شده است
        location: {
            type: {
                type: String,
                enum: ['Point'], // نوع مکان جغرافیایی
                default: undefined,
            },
            coordinates: {
                type: [Number], // [longitude, latitude]
                default: undefined,
            },
            name: {
                type: String, // نام مکان (مثلاً "Tehran, Iran")
                trim: true,
                maxlength: 200,
                default: '',
            },
        },
        // ---------- نویسنده پست ----------
        author: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'نویسنده پست الزامی است.'],
            index: true, // ایندکس برای جستجوی سریع پست‌های یک کاربر
        },
        // ---------- وضعیت پست ----------
        status: {
            type: String,
            enum: ['published', 'archived', 'draft'],
            default: 'published',
            index: true,
        },
    },
    // گزینه‌های طرحواره
    {
        // افزودن خودکار createdAt و updatedAt
        timestamps: {
            createdAt: 'createdAt', // زمان ایجاد
            updatedAt: 'updatedAt', // زمان آخرین به‌روزرسانی
        },
        // حذف فیلد __v برای کاهش حجم سند
        versionKey: false,
        // فعال‌سازی virtuals در خروجی JSON
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// ============================================================
// بخش ۴: تعریف ایندکس‌های بهینه برای کوئری‌های متداول
// ============================================================

// ایندکس ترکیبی برای فید پست‌ها: فید کاربران بر اساس زمان و وضعیت پست مرتب می‌شود
// این ایندکس مهم‌ترین ایندکس برای عملکرد بخش "Home Feed" است
// طبق قانون ESR: ابتدا فیلدهای Equality (status)، سپس Sort (createdAt)
PostSchema.index({ status: 1, createdAt: -1 });

// ایندکس برای جستجوی پست‌ها بر اساس نویسنده و زمان
// کاربرد: دریافت پست‌های یک کاربر خاص به ترتیب جدیدترین
PostSchema.index({ author: 1, createdAt: -1 });

// ایندکس ترکیبی برای جستجوی پست‌ها بر اساس هشتگ (Equality) و زمان (Sort)
// کاربرد: صفحه جستجوی هشتگ‌ها
PostSchema.index({ hashtags: 1, createdAt: -1 });

// ============================================================
// بخش ۵: هوک‌های Mongoose (Middlewares)
// ============================================================

// ---------- هوک ۱: پاک‌سازی آبشاری قبل از حذف یک پست ----------
// این هوک تضمین می‌کند که با حذف یک پست، تمام داده‌های مرتبط
// (رأی‌ها، نظرات، نوتیفیکیشن‌ها) نیز به صورت آبشاری حذف شوند.
PostSchema.pre('deleteOne', { document: false, query: true }, async function (next) {
    try {
        // دریافت فیلتر کوئری برای یافتن شناسه پست در حال حذف
        const filter = this.getFilter();
        const postId = filter._id;

        if (!postId) {
            console.warn('[Post.deleteOne hook] شناسه پست در فیلتر یافت نشد.');
            return next();
        }

        // حذف آبشاری: رأی‌ها، نظرات و نوتیفیکیشن‌های مرتبط
        const cleanupOperations = [
            mongoose.model('PostVote').deleteOne({ post: postId }),
            mongoose.model('Comment').deleteMany({ post: postId }),
            // حذف نوتیفیکیشن‌هایی که به این پست اشاره دارند
            mongoose.model('Notification').deleteMany({ 'notificationData.postId': postId }),
        ];

        await Promise.all(cleanupOperations);

        console.log(`[Cascade Cleanup] اسناد مرتبط با پست ${postId} با موفقیت حذف شدند.`);
        next();
    } catch (err) {
        next(err);
    }
});

// ---------- هوک ۲: اعمال محدودیت تعداد هشتگ‌ها قبل از ذخیره ----------
// این هوک تضمین می‌کند که تعداد هشتگ‌ها از حد مجاز تجاوز نکند
PostSchema.pre('save', function (next) {
    if (this.hashtags && this.hashtags.length > HASHTAG_MAX_ITEMS) {
        // کوتاه کردن آرایه هشتگ‌ها به حداکثر تعداد مجاز
        this.hashtags = this.hashtags.slice(0, HASHTAG_MAX_ITEMS);
        console.warn(`[Post.pre-save] تعداد هشتگ‌ها به حداکثر ${HASHTAG_MAX_ITEMS} محدود شد.`);
    }
    next();
});

// ============================================================
// بخش ۶: فیلدهای مجازی (Virtual Fields)
// ============================================================

/**
 * @virtual
 * @description محاسبه تعداد کل لایک‌های پست
 * @returns {Promise<number>} تعداد رأی‌ها
 */
PostSchema.virtual('likeCount', {
    ref: 'PostVote',
    localField: '_id',
    foreignField: 'post',
    count: true, // فقط تعداد اسناد مرتبط را برمی‌گرداند
});

/**
 * @virtual
 * @description محاسبه تعداد کل نظرات پست
 * @returns {Promise<number>} تعداد نظرات
 */
PostSchema.virtual('commentCount', {
    ref: 'Comment',
    localField: '_id',
    foreignField: 'post',
    count: true,
});

// ============================================================
// بخش ۷: تنظیمات تبدیل به JSON و Object
// ============================================================
// حذف خودکار فیلدهای داخلی هنگام ارسال پاسخ به کلاینت
PostSchema.set('toJSON', {
    transform: function (doc, ret) {
        // حذف فیلدهای غیرضروری
        delete ret.__v; // نسخه سند (در صورت فعال بودن versionKey)
        // ret.id = ret._id; // افزودن id به عنوان alias در صورت نیاز
        return ret;
    },
});

// ============================================================
// بخش ۸: ایجاد و صادرات مدل
// ============================================================
const Post = mongoose.model('Post', PostSchema);

module.exports = Post;
