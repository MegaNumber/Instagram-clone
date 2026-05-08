// مسیر فایل: /models/Followers.js
// توضیح: مدل Mongoose برای دنبال‌کنندگان. هر کاربر دقیقاً یک سند Followers دارد
// که آرایه‌ای از کاربرانی که او را دنبال می‌کنند، در آن ذخیره می‌شود.
// این مدل با اعتبارسنجی یکتایی، ایندکس‌های ترکیبی و یک متد استاتیک
// برای افزودن/حذف دنبال‌کننده (toggleFollow)، برای کوئری‌های سریع
// و مدیریت آسان بهینه شده است.
//
// @version 2.3.7
// @since 2026

// ============================================================
// بخش ۱: ایمپورت ماژول‌های مورد نیاز
// ============================================================
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// ============================================================
// بخش ۲: زیرطرحواره برای هر دنبال‌کننده (FollowerEntry)
// ============================================================
// این زیرطرحواره زمان دقیق دنبال کردن را نیز ذخیره می‌کند
const FollowerEntrySchema = new Schema(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'شناسه کاربر دنبال‌کننده الزامی است.'],
        },
        followedAt: {
            type: Date,
            default: Date.now, // زمان دنبال کردن
        },
    },
    { _id: false } // عدم نیاز به شناسه مستقل برای هر ورودی
);

// ============================================================
// بخش ۳: طرحواره اصلی دنبال‌کنندگان (Followers Schema)
// ============================================================
const FollowersSchema = new Schema(
    {
        // ---------- کاربر صاحب سند (کسی که دنبال‌کننده‌ها برای او ثبت می‌شود) ----------
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'کاربر صاحب دنبال‌کنندگان الزامی است.'],
            unique: true, // هر کاربر فقط یک سند دنبال‌کننده دارد
            index: true,
        },
        // ---------- آرایه دنبال‌کنندگان ----------
        followers: {
            type: [FollowerEntrySchema],
            default: [],
            validate: {
                // اعتبارسنجی یکتایی: هیچ کاربری نباید دو بار در آرایه دنبال‌کنندگان ظاهر شود
                validator: function (followers) {
                    const userIds = followers.map((f) => f.user.toString());
                    return new Set(userIds).size === userIds.length;
                },
                message: 'امکان ثبت دنبال‌کننده تکراری وجود ندارد.',
            },
        },
    },
    // گزینه‌های طرحواره
    {
        timestamps: {
            createdAt: 'createdAt', // زمان ایجاد سند (همان زمان ثبت‌نام کاربر)
            updatedAt: 'updatedAt', // آخرین به‌روزرسانی (افزودن/حذف دنبال‌کننده)
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
// ایندکس برای جستجوی سریع کاربران بر اساس دنبال‌کننده‌ها
FollowersSchema.index({ 'followers.user': 1 });

// ============================================================
// بخش ۵: فیلدهای مجازی (Virtuals)
// ============================================================

/**
 * @virtual
 * @description تعداد کل دنبال‌کنندگان این کاربر
 * @returns {number} - تعداد دنبال‌کنندگان
 */
FollowersSchema.virtual('followerCount').get(function () {
    return this.followers ? this.followers.length : 0;
});

// ============================================================
// بخش ۶: متدهای استاتیک (کمکی)
// ============================================================

/**
 * افزودن یا حذف یک دنبال‌کننده (Toggle Follow/Unfollow).
 * اگر کاربر قبلاً دنبال کرده باشد، حذف می‌کند؛ در غیر این صورت اضافه می‌کند.
 * @param {string} targetUserId - کاربری که می‌خواهیم دنبال/لغو دنبال کنیم (صاحب سند Followers)
 * @param {string} followerId - کاربری که عمل دنبال کردن را انجام می‌دهد
 * @returns {Promise<string>} - 'followed' یا 'unfollowed'
 */
FollowersSchema.statics.toggleFollow = async function (targetUserId, followerId) {
    const result = await this.updateOne(
        { user: targetUserId, 'followers.user': { $ne: followerId } },
        { $push: { followers: { user: followerId } } }
    );

    if (result.modifiedCount === 1) {
        return 'followed';
    }

    // قبلاً دنبال کرده بود، حذفش می‌کنیم
    await this.updateOne(
        { user: targetUserId },
        { $pull: { followers: { user: followerId } } }
    );
    return 'unfollowed';
};

/**
 * بررسی اینکه آیا کاربر خاصی توسط کاربر دیگری دنبال شده است
 * @param {string} targetUserId
 * @param {string} followerId
 * @returns {Promise<boolean>}
 */
FollowersSchema.statics.isFollowedBy = async function (targetUserId, followerId) {
    const doc = await this.findOne({ user: targetUserId, 'followers.user': followerId });
    return !!doc;
};

// ============================================================
// بخش ۷: تبدیل خروجی JSON
// ============================================================
FollowersSchema.set('toJSON', {
    transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret.__v;
        ret.followerCount = ret.followers ? ret.followers.length : 0;
        return ret;
    },
});

// ============================================================
// بخش ۸: ایجاد و صادرات مدل
// ============================================================
const Followers = mongoose.model('Followers', FollowersSchema);
module.exports = Followers;
