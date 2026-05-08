// مسیر فایل: /models/PostVote.js
// توضیح: مدل Mongoose برای آرای پست‌ها. هر پست دارای یک سند رأی است
// که آرایه‌ای از رأی‌های کاربران را در خود ذخیره می‌کند. یکتایی رأی‌ها
// (هر کاربر فقط یک رأی) هم در منطق برنامه و هم با اعتبارسنجی Schema تضمین می‌شود.
//
// @version 2.3.2
// @since 2026

// ============================================================
// بخش ۱: ایمپورت ماژول‌های مورد نیاز
// ============================================================
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// ============================================================
// بخش ۲: زیرطرحواره رأی (Vote Sub-schema)
// ============================================================
// هر رأی شامل کاربر رأی‌دهنده و زمان ایجاد آن است.
const VoteSchema = new Schema(
    {
        author: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'کاربر رأی‌دهنده الزامی است.'],
        },
        createdAt: {
            type: Date,
            default: Date.now, // زمان ثبت رأی
        },
    },
    { _id: false } // جلوگیری از ایجاد شناسه اضافی برای تک‌تک رأی‌ها
);

// ============================================================
// بخش ۳: طرحواره اصلی رأی پست (PostVote Schema)
// ============================================================
const PostVoteSchema = new Schema(
    {
        // ---------- پست مرتبط ----------
        post: {
            type: Schema.Types.ObjectId,
            ref: 'Post',
            required: [true, 'پست مرتبط با رأی‌ها الزامی است.'],
            unique: true, // هر پست دقیقاً یک سند رأی دارد
            index: true,
        },
        // ---------- آرای ثبت‌شده ----------
        votes: {
            type: [VoteSchema],
            default: [],
            validate: {
                // اعتبارسنجی یکتایی: هیچ کاربری نباید دو بار در آرایه ظاهر شود
                validator: function (votes) {
                    const authors = votes.map((v) => v.author.toString());
                    return new Set(authors).size === authors.length;
                },
                message: 'امکان ثبت رأی تکراری برای یک کاربر وجود ندارد.',
            },
        },
    },
    // گزینه‌های طرحواره
    {
        timestamps: {
            createdAt: 'createdAt', // زمان ایجاد سند رأی (همان زمان ساخت پست)
            updatedAt: 'updatedAt', // زمان آخرین تغییر (افزودن/حذف رأی)
        },
        versionKey: false,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// ============================================================
// بخش ۴: ایندکس‌ها
// ============================================================
// ایندکس بر روی post از طریق unique:true برقرار است.
// ایندکس اضافی برای جستجوی سریع رأی‌های یک کاربر در تمام پست‌ها
PostVoteSchema.index({ 'votes.author': 1 });

// ============================================================
// بخش ۵: فیلدهای مجازی (Virtuals)
// ============================================================

/**
 * @virtual
 * @description تعداد کل رأی‌های این پست
 * @returns {number} - تعداد آرای موجود در آرایه
 */
PostVoteSchema.virtual('voteCount').get(function () {
    return this.votes ? this.votes.length : 0;
});

// ============================================================
// بخش ۶: متدهای استاتیک (کمکی)
// ============================================================

/**
 * افزودن یا حذف رأی کاربر با یک فراخوانی.
 * اگر رأی وجود داشت، حذف می‌کند؛ در غیر این صورت اضافه می‌کند.
 * @param {string} postId - شناسه پست
 * @param {string} userId - شناسه کاربر
 * @returns {Promise<string>} - 'added' یا 'removed'
 */
PostVoteSchema.statics.toggleVote = async function (postId, userId) {
    const result = await this.updateOne(
        { post: postId, 'votes.author': { $ne: userId } },
        { $push: { votes: { author: userId } } }
    );

    if (result.modifiedCount === 1) {
        return 'added';
    }

    // رأی قبلاً وجود داشت، پس حذفش می‌کنیم
    await this.updateOne(
        { post: postId },
        { $pull: { votes: { author: userId } } }
    );
    return 'removed';
};

// ============================================================
// بخش ۷: تبدیل خروجی JSON
// ============================================================
PostVoteSchema.set('toJSON', {
    transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret.__v;
        // افزودن voteCount محاسباتی به خروجی
        ret.voteCount = ret.votes ? ret.votes.length : 0;
        return ret;
    },
});

// ============================================================
// بخش ۸: ایجاد و صادرات مدل
// ============================================================
const PostVote = mongoose.model('PostVote', PostVoteSchema);
module.exports = PostVote;
