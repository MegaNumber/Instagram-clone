// مسیر فایل: /models/CommentReplyVote.js
// توضیح: مدل Mongoose برای آرای پاسخ‌های نظرات. این فایل یک سند رأی برای هر پاسخ
// ایجاد می‌کند و آرایه‌ای از رأی‌های کاربران را در خود ذخیره می‌کند.
// هر کاربر تنها یک‌بار می‌تواند رأی دهد، این محدودیت هم در سطح برنامه
// و هم با اعتبارسنجی در سطح Schema تضمین شده است.
// یک متد استاتیک toggleVote برای افزودن/حذف رأی بدون نیاز به منطق شرطی
// در کنترلرها در نظر گرفته شده است.
//
// @version 2.3.6
// @since 2026

// ============================================================
// بخش ۱: ایمپورت ماژول‌های مورد نیاز
// ============================================================
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// ============================================================
// بخش ۲: زیرطرحواره رأی (Vote Sub-schema)
// ============================================================
const VoteSchema = new Schema(
    {
        author: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'کاربر رأی‌دهنده الزامی است.'],
        },
        createdAt: {
            type: Date,
            default: Date.now, // زمان ایجاد رأی
        },
    },
    { _id: false } // _id برای تک‌تک رأی‌ها نیاز نداریم
);

// ============================================================
// بخش ۳: طرحواره اصلی رأی پاسخ (CommentReplyVote Schema)
// ============================================================
const CommentReplyVoteSchema = new Schema(
    {
        // ---------- پاسخ مرتبط ----------
        comment: {
            type: Schema.Types.ObjectId,
            ref: 'CommentReply',
            required: [true, 'پاسخ مرتبط الزامی است.'],
            unique: true, // هر پاسخ دقیقاً یک سند رأی دارد
            index: true,
        },
        // ---------- آرای ثبت‌شده ----------
        votes: {
            type: [VoteSchema],
            default: [],
            validate: {
                // اعتبارسنجی یکتایی کاربران: هیچ کاربری نباید دو بار در آرایه votes ظاهر شود
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
            createdAt: 'createdAt', // زمان اولین ایجاد سند رأی (همان لحظه ایجاد پاسخ)
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
// ایندکس اصلی بر روی comment تعریف شده (به دلیل unique: true)
// ایندکس اضافی برای جستجوی کاربر در آرای یک پاسخ خاص (برای بهینه‌سازی)
CommentReplyVoteSchema.index({ 'votes.author': 1 });

// ============================================================
// بخش ۵: فیلدهای مجازی (Virtuals)
// ============================================================

/**
 * @virtual
 * @description تعداد کل رأی‌های این پاسخ
 * @returns {number} تعداد آرای موجود در آرایه
 */
CommentReplyVoteSchema.virtual('voteCount').get(function () {
    return this.votes ? this.votes.length : 0;
});

// ============================================================
// بخش ۶: متدهای استاتیک (کمکی)
// ============================================================

/**
 * افزودن یا حذف رأی کاربر با یک فراخوانی (Toggle).
 * اگر رأی وجود داشت، حذف می‌کند؛ در غیر این صورت اضافه می‌کند.
 * @param {string} commentId - شناسه پاسخ
 * @param {string} userId - شناسه کاربر
 * @returns {Promise<string>} - 'added' یا 'removed'
 */
CommentReplyVoteSchema.statics.toggleVote = async function (commentId, userId) {
    const result = await this.updateOne(
        { comment: commentId, 'votes.author': { $ne: userId } },
        { $push: { votes: { author: userId } } }
    );

    if (result.modifiedCount === 1) {
        return 'added';
    }

    // رأی قبلاً وجود داشته، پس حذفش می‌کنیم
    await this.updateOne(
        { comment: commentId },
        { $pull: { votes: { author: userId } } }
    );
    return 'removed';
};

// ============================================================
// بخش ۷: تبدیل خروجی JSON
// ============================================================
CommentReplyVoteSchema.set('toJSON', {
    transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret.__v;
        // محاسبه voteCount در صورت نیاز در سمت خروجی
        ret.voteCount = ret.votes ? ret.votes.length : 0;
        return ret;
    },
});

// ============================================================
// بخش ۸: ایجاد و صادرات مدل
// ============================================================
const CommentReplyVote = mongoose.model('CommentReplyVote', CommentReplyVoteSchema);
module.exports = CommentReplyVote;
