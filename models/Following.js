// مسیر فایل: /models/Following.js
// توضیح: مدل Mongoose برای دنبال‌شونده‌ها. هر کاربر یک سند Following دارد
// که آرایه‌ای از کاربرانی که او دنبال کرده است را ذخیره می‌کند.
// این مدل برای کوئری‌های سریع و مدیریت صحیح لیست دنبال‌شونده‌ها بهینه شده
// و با متدهای استاتیک کمکی، عملیات Follow/Unfollow را در سطح پایگاه داده
// بدون نیاز به منطق شرطی در کنترلرها امکان‌پذیر می‌سازد.
//
// @version 2.3.8
// @since 2026

// ============================================================
// بخش ۱: ایمپورت ماژول‌های مورد نیاز
// ============================================================
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// ============================================================
// بخش ۲: زیرطرحواره برای هر دنبال‌شونده (FollowingEntry)
// ============================================================
// این زیرطرحواره زمان دقیق دنبال کردن را نیز ثبت می‌کند
const FollowingEntrySchema = new Schema(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'شناسه کاربر دنبال‌شونده الزامی است.'],
        },
        followedAt: {
            type: Date,
            default: Date.now, // زمان دنبال کردن
        },
    },
    { _id: false } // جلوگیری از ایجاد شناسه اضافی
);

// ============================================================
// بخش ۳: طرحواره اصلی دنبال‌شونده‌ها (Following Schema)
// ============================================================
const FollowingSchema = new Schema(
    {
        // ---------- کاربر صاحب سند (کسی که دیگران را دنبال می‌کند) ----------
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'کاربر صاحب لیست دنبال‌شونده‌ها الزامی است.'],
            unique: true, // هر کاربر فقط یک سند Following دارد
            index: true,
        },
        // ---------- آرایه دنبال‌شونده‌ها ----------
        following: {
            type: [FollowingEntrySchema],
            default: [],
            validate: {
                // اعتبارسنجی یکتایی: هیچ کاربری نباید دو بار دنبال شود
                validator: function (following) {
                    const userIds = following.map((f) => f.user.toString());
                    return new Set(userIds).size === userIds.length;
                },
                message: 'امکان دنبال کردن تکراری یک کاربر وجود ندارد.',
            },
        },
    },
    // گزینه‌های طرحواره
    {
        timestamps: {
            createdAt: 'createdAt', // زمان ایجاد سند (همان زمان ثبت‌نام کاربر)
            updatedAt: 'updatedAt', // آخرین به‌روزرسانی (افزودن/حذف دنبال‌شونده)
        },
        versionKey: false,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// ============================================================
// بخش ۴: ایندکس‌های ترکیبی برای عملکرد بهتر
// ============================================================
// ایندکس روی user از قبل با unique:true وجود دارد.
// ایندکس برای جستجوی سریع: "چه کسانی این کاربر را دنبال می‌کنند؟"
FollowingSchema.index({ 'following.user': 1 });

// ============================================================
// بخش ۵: فیلدهای مجازی (Virtuals)
// ============================================================

/**
 * @virtual
 * @description تعداد کل کاربرانی که این کاربر دنبال می‌کند
 * @returns {number} - تعداد دنبال‌شونده‌ها
 */
FollowingSchema.virtual('followingCount').get(function () {
    return this.following ? this.following.length : 0;
});

// ============================================================
// بخش ۶: متدهای استاتیک (کمکی)
// ============================================================

/**
 * افزودن یا حذف یک کاربر از لیست دنبال‌شونده‌ها (Toggle Follow/Unfollow).
 * اگر کاربر قبلاً دنبال شده باشد، حذف می‌کند؛ در غیر این صورت اضافه می‌کند.
 * @param {string} currentUserId - کاربری که عمل دنبال کردن را انجام می‌دهد (صاحب سند Following)
 * @param {string} targetUserId - کاربری که می‌خواهیم دنبال/لغو دنبال کنیم
 * @returns {Promise<string>} - 'followed' یا 'unfollowed'
 */
FollowingSchema.statics.toggleFollow = async function (currentUserId, targetUserId) {
    const result = await this.updateOne(
        { user: currentUserId, 'following.user': { $ne: targetUserId } },
        { $push: { following: { user: targetUserId } } }
    );

    if (result.modifiedCount === 1) {
        return 'followed';
    }

    // قبلاً دنبال می‌کرد، حذفش می‌کنیم
    await this.updateOne(
        { user: currentUserId },
        { $pull: { following: { user: targetUserId } } }
    );
    return 'unfollowed';
};

/**
 * بررسی می‌کند که آیا کاربر فعلی کاربر دیگری را دنبال می‌کند یا خیر.
 * @param {string} currentUserId - کاربری که می‌خواهیم بررسی کنیم
 * @param {string} targetUserId - کاربری که ممکن است دنبال شده باشد
 * @returns {Promise<boolean>}
 */
FollowingSchema.statics.isFollowing = async function (currentUserId, targetUserId) {
    const doc = await this.findOne({ user: currentUserId, 'following.user': targetUserId });
    return !!doc;
};

// ============================================================
// بخش ۷: تبدیل خروجی JSON
// ============================================================
FollowingSchema.set('toJSON', {
    transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret.__v;
        ret.followingCount = ret.following ? ret.following.length : 0;
        return ret;
    },
});

// ============================================================
// بخش ۸: ایجاد و صادرات مدل
// ============================================================
const Following = mongoose.model('Following', FollowingSchema);
module.exports = Following;
