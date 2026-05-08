// مسیر فایل: /models/CommentVote.js
// توضیح: مدل Mongoose برای آرای نظرات. هر نظر یک سند رأی دارد که آرایه‌ای از
// رأی‌های کاربران را ذخیره می‌کند. یکتایی رأی‌ها (هر کاربر یک رأی) با اعتبارسنجی
// Schema و منطق برنامه تضمین شده است. این مدل از یک زیرطرحواره برای ثبت زمان
// دقیق هر رأی استفاده می‌کند و با متدهای استاتیک کمکی، افزودن/حذف رأی را
// بسیار ساده می‌کند.
//
// @version 2.3.4
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
            default: Date.now, // زمان ثبت رأی
        },
    },
    { _id: false } // جلوگیری از ایجاد شناسه اضافی برای هر رأی
);

// ============================================================
// بخش ۳: طرحواره اصلی رأی نظر (CommentVote Schema)
// ============================================================
const CommentVoteSchema = new Schema(
    {
        // ---------- نظر مرتبط ----------
        comment: {
            type: Schema.Types.ObjectId,
            ref: 'Comment',
            required: [true, 'نظر مرتبط الزامی است.'],
            unique: true, // هر نظر دقیقاً یک سند رأی دارد
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
            createdAt: 'createdAt', // زمان ایجاد سند رأی (همان زمان ایجاد نظر)
            updatedAt: 'updatedAt', // زمان آخرین تغییر (افزودن/حذف رأی)
        },
        versionKey: false,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// ============================================================
// بخش ۴: ایندکس‌های اضافی
// ============================================================
// ایندکس روی comment از قبل با unique:true وجود دارد.
// ایندکس برای جستجوی سریع رأی‌های یک کاربر در نظرات مختلف
CommentVoteSchema.index({ 'votes.author': 1 });

// ============================================================
// بخش ۵: فیلدهای مجازی (Virtuals)
// ============================================================

/**
 * @virtual
 * @description تعداد کل رأی‌های این نظر
 * @returns {number} - تعداد آرای موجود در آرایه
 */
CommentVoteSchema.virtual('voteCount').get(function () {
    return this.votes ? this.votes.length : 0;
});

// ============================================================
// بخش ۶: متدهای استاتیک (کمکی)
// ============================================================

/**
 * افزودن یا حذف رأی کاربر با یک فراخوانی (Toggle).
 * اگر رأی وجود داشت، حذف می‌کند؛ در غیر این صورت اضافه می‌کند.
 * @param {string} commentId - شناسه نظر
 * @param {string} userId - شناسه کاربر
 * @returns {Promise<string>} - 'added' یا 'removed'
 */
CommentVoteSchema.statics.toggleVote = async function (commentId, userId) {
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
CommentVoteSchema.set('toJSON', {
    transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret.__v;
        ret.voteCount = ret.votes ? ret.votes.length : 0;
        return ret;
    },
});

// ============================================================
// بخش ۸: ایجاد و صادرات مدل
// ============================================================
const CommentVote = mongoose.model('CommentVote', CommentVoteSchema);
module.exports = CommentVote;
