// مسیر فایل: /models/Notification.js
// توضیح: مدل Mongoose برای نوتیفیکیشن‌ها. این فایل ساختار انواع اطلاعیه‌های
// ارسالی به کاربران (follow, like, comment, mention) را تعریف می‌کند.
// دارای ایندکس‌های ترکیبی برای عملکرد سریع، ایندکس TTL برای حذف خودکار
// نوتیفیکیشن‌های قدیمی، فیلد مجازی timeAgo برای نمایش زمان نسبی،
// و متدهای استاتیک کمکی برای علامت‌گذاری خوانده‌شده است.
//
// @version 2.3.9
// @since 2026

// ============================================================
// بخش ۱: ایمپورت ماژول‌های مورد نیاز
// ============================================================
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// ============================================================
// بخش ۲: ثابت‌های پیکربندی
// ============================================================
const NOTIFICATION_TYPES = ['follow', 'like', 'comment', 'mention'];
const NOTIFICATION_RETENTION_SECONDS = 90 * 24 * 60 * 60; // 90 روز

// ============================================================
// بخش ۳: تعریف طرحواره نوتیفیکیشن
// ============================================================
const NotificationSchema = new Schema(
    {
        sender: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'فرستنده نوتیفیکیشن الزامی است.'],
            index: true,
        },
        receiver: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'گیرنده نوتیفیکیشن الزامی است.'],
            index: true,
        },
        notificationType: {
            type: String,
            required: [true, 'نوع نوتیفیکیشن الزامی است.'],
            enum: {
                values: NOTIFICATION_TYPES,
                message: `نوع نوتیفیکیشن باید یکی از موارد ${NOTIFICATION_TYPES.join(', ')} باشد.`,
            },
        },
        notificationData: {
            type: Schema.Types.Mixed,
            default: {},
        },
        read: {
            type: Boolean,
            default: false,
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
// بخش ۴: ایندکس‌های ترکیبی
// ============================================================
NotificationSchema.index({ receiver: 1, createdAt: -1 });
NotificationSchema.index({ receiver: 1, read: 1, createdAt: -1 });
NotificationSchema.index({ sender: 1, notificationType: 1 });

// ایندکس TTL برای حذف خودکار پس از ۹۰ روز
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
 * @returns {string} - متن زمان نسبی
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
// بخش ۶: متدهای استاتیک (کمکی)
// ============================================================

/**
 * علامت‌گذاری تمام نوتیفیکیشن‌های خوانده‌نشدهٔ یک کاربر به عنوان خوانده‌شده
 * @param {string} userId - شناسه کاربر
 * @returns {Promise<number>} - تعداد اسناد به‌روزرسانی‌شده
 */
NotificationSchema.statics.markAllAsRead = async function (userId) {
    const result = await this.updateMany(
        { receiver: userId, read: false },
        { $set: { read: true } }
    );
    return result.modifiedCount;
};

// ============================================================
// بخش ۷: تبدیل خروجی JSON
// ============================================================
NotificationSchema.set('toJSON', {
    transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret.__v;
        return ret;
    },
});

// ============================================================
// بخش ۸: ایجاد و صادرات مدل
// ============================================================
const Notification = mongoose.model('Notification', NotificationSchema);
module.exports = Notification;
