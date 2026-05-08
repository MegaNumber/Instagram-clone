// مسیر فایل: /models/ConfirmationToken.js
// توضیح: مدل Mongoose برای توکن‌های تأیید. این مدل برای مدیریت توکن‌های یک‌بار مصرف
// جهت تأیید ایمیل کاربران استفاده می‌شود. هر توکن دارای اعتبار محدود (۲۴ ساعت) است
// و پس از تأیید یا انقضاء به‌طور خودکار از دیتابیس حذف می‌شود.
//
// مهم: به‌دلیل فاصلهٔ زمانی احتمالی بین انقضای توکن و عملیات پاک‌سازی TTL،
// همیشه باید برای اعتبارسنجی توکن از متد استاتیک `findOneValid` استفاده کرد
// که تاریخ انقضا را نیز در کوئری بررسی می‌کند. نمونهٔ استفاده در کنترلر:
//   const token = await ConfirmationToken.findOneValid(user._id, tokenValue);
//
// @version 2.4.0
// @since 2026

// ============================================================
// بخش ۱: ایمپورت ماژول‌های مورد نیاز
// ============================================================
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// ============================================================
// بخش ۲: ثابت‌های پیکربندی
// ============================================================
const TOKEN_EXPIRY_HOURS = 24;
const TOKEN_EXPIRY_MS = TOKEN_EXPIRY_HOURS * 60 * 60 * 1000; // ۲۴ ساعت به میلی‌ثانیه
const TOKEN_EXPIRY_SECONDS = TOKEN_EXPIRY_HOURS * 60 * 60;   // برای TTL ایندکس
const TOKEN_LENGTH = 40; // طول مجاز توکن (هگز ۴۰ کاراکتری)

// ============================================================
// بخش ۳: طرحواره توکن تأیید
// ============================================================
const ConfirmationTokenSchema = new Schema(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'کاربر مرتبط با توکن الزامی است.'],
            index: true,
        },
        token: {
            type: String,
            required: [true, 'مقدار توکن الزامی است.'],
            unique: true,
            index: true,
            validate: {
                validator: function (value) {
                    // توکن باید یک رشته هگز ۴۰ کاراکتری باشد (crypto.randomBytes(20).toString('hex'))
                    return /^[a-f0-9]{40}$/i.test(value);
                },
                message: 'فرمت توکن نامعتبر است. توکن باید یک رشته هگز ۴۰ کاراکتری باشد.',
            },
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
// بخش ۴: ایندکس‌ها
// ============================================================
// TTL Index برای حذف خودکار توکن‌هایی که بیش از ۲۴ ساعت از ایجادشان گذشته است.
// این ایندکس توسط MongoDB در پس‌زمینه اجرا می‌شود، اما ممکن است بلافاصله
// پس از انقضا حذف نشود. لذا همیشه در کوئری‌ها تاریخ انقضا را هم چک کنید.
ConfirmationTokenSchema.index(
    { createdAt: 1 },
    { expireAfterSeconds: TOKEN_EXPIRY_SECONDS }
);

// ============================================================
// بخش ۵: فیلدهای مجازی (Virtuals)
// ============================================================

/**
 * @virtual
 * @description بررسی می‌کند که آیا توکن منقضی شده است یا خیر.
 * @returns {boolean}
 */
ConfirmationTokenSchema.virtual('isExpired').get(function () {
    if (!this.createdAt) return true;
    return Date.now() > this.createdAt.getTime() + TOKEN_EXPIRY_MS;
});

// ============================================================
// بخش ۶: متدهای استاتیک (کمکی)
// ============================================================

/**
 * یافتن یک توکن معتبر بر اساس کاربر و مقدار توکن.
 * برخلاف یک findOne ساده، این متد خودکار تاریخ انقضا را نیز بررسی می‌کند.
 * @param {string} userId - شناسه کاربر
 * @param {string} tokenValue - مقدار توکن
 * @returns {Promise<Document|null>}
 */
ConfirmationTokenSchema.statics.findOneValid = async function (userId, tokenValue) {
    return this.findOne({
        user: userId,
        token: tokenValue,
        createdAt: { $gt: new Date(Date.now() - TOKEN_EXPIRY_MS) }, // حتماً منقضی نشده باشد
    });
};

// ============================================================
// بخش ۷: تبدیل خروجی JSON
// ============================================================
ConfirmationTokenSchema.set('toJSON', {
    transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret.__v;
        ret.isExpired = doc.isExpired;
        return ret;
    },
});

// ============================================================
// بخش ۸: ایجاد و صادرات مدل
// ============================================================
const ConfirmationToken = mongoose.model('ConfirmationToken', ConfirmationTokenSchema);
module.exports = ConfirmationToken;
