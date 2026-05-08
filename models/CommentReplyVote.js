// مسیر فایل: /models/CommentReplyVote.js
// توضیح: مدل Mongoose برای آرای پاسخ‌های نظرات. این فایل یک سند رأی برای هر پاسخ
// ایجاد می‌کند و آرایه‌ای از رأی‌های کاربران را در خود ذخیره می‌کند.
// هر کاربر تنها یک‌بار می‌تواند رأی دهد، این محدودیت هم در سطح برنامه
// و هم با اعتبارسنجی در سطح Schema تضمین شده است.

// ============================================================
// بخش ۱: ایمپورت ماژول‌های مورد نیاز
// ============================================================
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// ============================================================
// بخش ۲: تعریف طرحواره رأی پاسخ (CommentReplyVote Schema)
// ============================================================

// زیرطرحواره برای هر رأی: چه کسی رأی داده و چه زمانی
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
// بخش ۳: ایندکس‌ها
// ============================================================
// ایندکس اصلی بر روی comment تعریف شده (به دلیل unique: true)
// ایندکس اضافی برای جستجوی کاربر در آرای یک پاسخ خاص (برای بهینه‌سازی)
CommentReplyVoteSchema.index({ 'votes.author': 1 });

// ============================================================
// بخش ۴: فیلدهای مجازی (Virtuals)
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
// بخش ۵: هوک‌های Mongoose (در صورت نیاز می‌توان اضافه کرد)
// ============================================================
// در حال حاضر نیازی به هوک خاصی نیست.

// ============================================================
// بخش ۶: تبدیل خروجی JSON
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
// بخش ۷: ایجاد و صادرات مدل
// ============================================================
const CommentReplyVote = mongoose.model('CommentReplyVote', CommentReplyVoteSchema);
module.exports = CommentReplyVote;
