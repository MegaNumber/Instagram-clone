// مسیر فایل: /models/Notification.js
// توضیح: مدل Mongoose برای نوتیفیکیشن‌ها. این فایل ساختار انواع اطلاعیه‌های
// ارسالی به کاربران را تعریف می‌کند و شامل اعتبارسنجی، ایندکس‌های عملکردی
// و مکانیزم‌های پاک‌سازی خودکار است.

// ============================================================
// بخش ۱: ایمپورت ماژول‌های مورد نیاز
// ============================================================
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// ============================================================
// بخش ۲: ثابت‌های پیکربندی
// ============================================================
// انواع معتبر نوتیفیکیشن (مطابق با منطق برنامه)
const NOTIFICATION_TYPES = ['follow', 'like', 'comment', 'mention'];

// مدت زمان حفظ نوتیفیکیشن (به صورت اختیاری - اگر بخواهیم به‌طور خودکار حذف شوند)
// 90 روز = 90 * 24 * 60 * 60 ثانیه
const NOTIFICATION_RETENTION_SECONDS = 90 * 24 * 60 * 60; // 90 روز

// ============================================================
// بخش ۳: تعریف طرحواره نوتیفیکیشن (Notification Schema)
// ============================================================
const NotificationSchema = new Schema(
    {
        // ---------- فرستنده نوتیفیکیشن ----------
        sender: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'فرستنده نوتیفیکیشن الزامی است.'],
            index: true, // ایندکس برای یافتن نوتیفیکیشن‌های ارسالی یک کاربر
        },
        // ---------- گیرنده نوتیفیکیشن ----------
        receiver: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'گیرنده نوتیفیکیشن الزامی است.'],
            index: true, // ایندکس اصلی برای نمایش نوتیفیکیشن‌های یک کاربر
        },
        // ---------- نوع نوتیفیکیشن ----------
        notificationType: {
            type: String,
            required: [true, 'نوع نوتیفیکیشن الزامی است.'],
            enum: {
                values: NOTIFICATION_TYPES,
                message: `نوع نوتیفیکیشن باید یکی از موارد ${NOTIFICATION_TYPES.join(', ')} باشد.`,
            },
        },
        // ---------- داده‌های اضافی وابسته به نوع نوتیفیکیشن ----------
        // این فیلد به صورت یک شیء آزاد (Object) ذخیره می‌شود و می‌تواند
        // شامل شناسه پست، تصویر، پیام و … باشد.
        notificationData: {
            type: Schema.Types.Mixed, // استفاده از Mixed به جای Object برای انعطاف‌پذیری
            default: {},
        },
        // ---------- وضعیت خوانده شدن ----------
        read: {
            type: Boolean,
            default: false,
            index: true, // برای فیلتر کردن نوتیفیکیشن‌های خوانده‌نشده
        },
        // حذف فیلد 'date' به دلیل استفاده از timestamps خودکار
    },
    // گزینه‌های طرحواره
    {
        // افزودن خودکار createdAt و updatedAt
        timestamps: {
            createdAt: 'createdAt', // تاریخ ایجاد (جایگزین فیلد date)
            updatedAt: 'updatedAt', // تاریخ آخرین تغییر (مثلاً تغییر read)
        },
        versionKey: false, // حذف فیلد __v
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// ============================================================
// بخش ۴: ایندکس‌های ترکیبی برای عملکرد بهینه
// ============================================================

// ایندکس اصلی: دریافت نوتیفیکیشن‌های یک کاربر به ترتیب جدیدترین
// طبق قانون ESR: Equality (receiver) سپس Sort (createdAt)
NotificationSchema.index({ receiver: 1, createdAt: -1 });

// ایندکس برای نمایش نوتیفیکیشن‌های خوانده‌نشده یک کاربر
NotificationSchema.index({ receiver: 1, read: 1, createdAt: -1 });

// ایندکس برای جستجوی نوتیفیکیشن بر اساس فرستنده و نوع
NotificationSchema.index({ sender: 1, notificationType: 1 });

// ایندکس TTL (Time-To-Live) برای حذف خودکار نوتیفیکیشن‌های قدیمی
// این ایندکس پس از 90 روز سند را به طور خودکار از دیتابیس پاک می‌کند.
// برای فعال‌سازی، نیاز به اجرای mongoose.connection.createCollection نیست
// و Mongoose به طور خودکار در پس‌زمینه آن را مدیریت می‌کند.
// اگر نمی‌خواهید نوتیفیکیشن‌ها حذف شوند، این ایندکس را کامنت کنید.
NotificationSchema.index(
    { createdAt: 1 },
    { expireAfterSeconds: NOTIFICATION_RETENTION_SECONDS }
);

// ============================================================
// بخش ۵: فیلدهای مجازی (Virtuals)
// ============================================================

/**
 * @virtual
 * @description محاسبه زمان سپری‌شده از ایجاد نوتیفیکیشن (برای نمایش نسبی)
 * @returns {string} - متن زمان نسبی مانند "۵ دقیقه پیش"
 */
NotificationSchema.virtual('timeAgo').get(function () {
    if (!this.createdAt) return '';
    const seconds = Math.floor((Date.now() - this.createdAt.getTime()) / 1000);
    if (seconds < 60) return 'همین الان';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} دقیقه پیش`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ساعت پیش`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} روز پیش`;
    const months = Math.floor(days / 30);
    return `${months} ماه پیش`;
});

// ============================================================
// بخش ۶: هوک‌های Mongoose
// ============================================================
// (در صورت نیاز می‌توان پیش‌بینی‌های لازم را اضافه کرد)

// ============================================================
// بخش ۷: تبدیل خروجی JSON
// ============================================================
NotificationSchema.set('toJSON', {
    transform: function (doc, ret) {
        // افزودن فیلد id به عنوان یک کپی از _id
        ret.id = ret._id;
        delete ret.__v;
        // بازگرداندن createdAt به عنوان date برای سازگاری با کدهای قدیمی (اختیاری)
        // ret.date = ret.createdAt;
        return ret;
    },
});

// ============================================================
// بخش ۸: ایجاد و صادرات مدل
// ============================================================
const Notification = mongoose.model('Notification', NotificationSchema);

module.exports = Notification;
