// مسیر فایل: /models/ConfirmationToken.js
// توضیح: مدل Mongoose برای توکن‌های تأیید. این مدل برای مدیریت توکن‌های یک‌بار مصرف
// جهت تأیید ایمیل کاربران استفاده می‌شود. هر توکن دارای اعتبار محدود (۲۴ ساعت) است
// و پس از تأیید یا انقضاء به‌طور خودکار از دیتابیس حذف می‌شود.

// ============================================================
// بخش ۱: ایمپورت ماژول‌های مورد نیاز
// ============================================================
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// ============================================================
// بخش ۲: ثابت‌های پیکربندی
// ============================================================
const TOKEN_EXPIRY_HOURS = 24; // مدت اعتبار توکن به ساعت
const TOKEN_EXPIRY_SECONDS = TOKEN_EXPIRY_HOURS * 60 * 60; // تبدیل به ثانیه برای TTL
const TOKEN_LENGTH = 40; // طول توکن (crypto.randomBytes(20) => 40 کاراکتر هگز)

// ============================================================
// بخش ۳: طرحواره توکن تأیید (ConfirmationToken Schema)
// ============================================================
const ConfirmationTokenSchema = new Schema(
    {
        // ---------- کاربر مرتبط ----------
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'کاربر مرتبط با توکن الزامی است.'],
            index: true, // برای جستجوی سریع توکن‌های یک کاربر
        },
        // ---------- رشته توکن ----------
        token: {
            type: String,
            required: [true, 'مقدار توکن الزامی است.'],
            unique: true, // هر توکن باید یکتا باشد
            index: true,
            validate: {
                validator: function (value) {
                    // توکن باید یک رشته هگز ۴۰ کاراکتری باشد (حاصل crypto.randomBytes(20))
                    return /^[a-f0-9]{40}$/i.test(value);
                },
                message: 'فرمت توکن نامعتبر است. توکن باید یک رشته هگز ۴۰ کاراکتری باشد.',
            },
        },
    },
    // گزینه‌های طرحواره
    {
        timestamps: {
            createdAt: 'createdAt', // زمان ایجاد توکن
            updatedAt: 'updatedAt', // زمان آخرین به‌روزرسانی (در عمل تغییر نمی‌کند)
        },
        versionKey: false,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// ============================================================
// بخش ۴: ایندکس‌ها
// ============================================================
// ایندکس روی user و token از طریق گزینه‌های بالا ایجاد شده.
// ایندکس TTL برای حذف خودکار توکن‌های منقضی‌شده پس از ۲۴ ساعت
// این ایندکس از MongoDB برای پاک‌سازی خودکار استفاده می‌کند.
ConfirmationTokenSchema.index(
    { createdAt: 1 },
    { expireAfterSeconds: TOKEN_EXPIRY_SECONDS }
);

// ============================================================
// بخش ۵: فیلدهای مجازی (Virtuals)
// ============================================================

/**
 * @virtual
 * @description بررسی می‌کند که آیا توکن منقضی شده است یا خیر
 * @returns {boolean} - true اگر توکن بیش از ۲۴ ساعت از زمان ایجادش گذشته باشد
 */
ConfirmationTokenSchema.virtual('isExpired').get(function () {
    if (!this.createdAt) return true;
    const now = new Date();
    const expiryTime = new Date(this.createdAt.getTime() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);
    return now > expiryTime;
});

// ============================================================
// بخش ۶: تبدیل خروجی JSON
// ============================================================
ConfirmationTokenSchema.set('toJSON', {
    transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret.__v;
        ret.isExpired = doc.isExpired; // افزودن وضعیت انقضا به خروجی
        return ret;
    },
});

// ============================================================
// بخش ۷: ایجاد و صادرات مدل
// ============================================================
const ConfirmationToken = mongoose.model('ConfirmationToken', ConfirmationTokenSchema);
module.exports = ConfirmationToken;
