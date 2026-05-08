// مسیر فایل: /models/CommentReply.js
// توضیح: مدل Mongoose برای پاسخ‌های نظرات (Comment Replies). این فایل ساختار یک پاسخ
// به یک نظر را تعریف می‌کند و شامل هوک‌های ایجاد خودکار سند رأی و حذف آبشاری رأی
// در هنگام حذف پاسخ است. ایندکس‌های بهینه برای نمایش مرتب پاسخ‌ها نیز تعبیه شده است.
//
// @version 2.3.5
// @since 2026

// ============================================================
// بخش ۱: ایمپورت ماژول‌های مورد نیاز
// ============================================================
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// ============================================================
// بخش ۲: ثابت‌های پیکربندی
// ============================================================
const MESSAGE_MAX_LENGTH = 2000; // حداکثر طول متن پاسخ

// ============================================================
// بخش ۳: تعریف طرحواره پاسخ نظر (CommentReply Schema)
// ============================================================
const CommentReplySchema = new Schema(
    {
        // ---------- متن پاسخ ----------
        message: {
            type: String,
            required: [true, 'متن پاسخ نمی‌تواند خالی باشد.'],
            trim: true,
            maxlength: [MESSAGE_MAX_LENGTH, `متن پاسخ نمی‌تواند بیشتر از ${MESSAGE_MAX_LENGTH} کاراکتر باشد.`],
        },
        // ---------- نویسنده پاسخ ----------
        author: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'نویسنده پاسخ الزامی است.'],
            index: true,
        },
        // ---------- نظر والد ----------
        parentComment: {
            type: Schema.Types.ObjectId,
            ref: 'Comment',
            required: [true, 'نظر والد الزامی است.'],
            index: true,
        },
        // ---------- کاربران منشن‌شده در پاسخ (اختیاری) ----------
        mentions: [
            {
                type: Schema.Types.ObjectId,
                ref: 'User',
            },
        ],
    },
    // گزینه‌های طرحواره
    {
        // جایگزینی فیلد date با timestamps خودکار
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
// بخش ۴: ایندکس‌های ترکیبی برای عملکرد بهینه
// ============================================================
// دریافت پاسخ‌های یک نظر والد به ترتیب قدیمی‌ترین (نمایش تایم‌لاین)
// قانون ESR: Equality (parentComment) سپس Sort (createdAt)
CommentReplySchema.index({ parentComment: 1, createdAt: 1 });

// ============================================================
// بخش ۵: هوک‌های Mongoose (Middlewares)
// ============================================================

// ---------- هوک ۱: ایجاد خودکار سند رأی برای پاسخ جدید ----------
CommentReplySchema.pre('save', async function (next) {
    if (this.isNew) {
        try {
            await mongoose.model('CommentReplyVote').create({ comment: this._id });
        } catch (err) {
            return next(err);
        }
    }
    next();
});

// ---------- هوک ۲: پاک‌سازی رأی هنگام حذف یک پاسخ ----------
// این هوک تضمین می‌کند که با حذف یک پاسخ، سند رأی مرتبط نیز حذف شود.
CommentReplySchema.pre('deleteOne', { document: false, query: true }, async function (next) {
    try {
        const filter = this.getFilter();
        const replyId = filter._id;

        if (!replyId) {
            console.warn('[CommentReply.deleteOne hook] شناسه پاسخ در فیلتر یافت نشد.');
            return next();
        }

        await mongoose.model('CommentReplyVote').deleteOne({ comment: replyId });
        console.log(`[Cascade Cleanup] رأی پاسخ ${replyId} با موفقیت حذف شد.`);
        next();
    } catch (err) {
        next(err);
    }
});

// ============================================================
// بخش ۶: فیلدهای مجازی (Virtuals)
// ============================================================

/**
 * @virtual
 * @description محاسبه تعداد لایک‌های این پاسخ
 * @returns {Promise<number>} تعداد آرای موجود در سند CommentReplyVote
 */
CommentReplySchema.virtual('likeCount', {
    ref: 'CommentReplyVote',
    localField: '_id',
    foreignField: 'comment',
    count: true,
});

// ============================================================
// بخش ۷: متدهای استاتیک (کمکی)
// ============================================================

/**
 * دریافت صفحه‌بندی‌شده پاسخ‌های یک نظر والد
 * @param {string} parentCommentId - شناسه نظر والد
 * @param {object} options - { page, limit }
 * @returns {Promise<{replies: Array, total: number}>}
 */
CommentReplySchema.statics.findByParentCommentPaginated = async function (
    parentCommentId,
    { page = 1, limit = 10 } = {}
) {
    const skip = (page - 1) * limit;
    const [replies, total] = await Promise.all([
        this.find({ parentComment: parentCommentId })
            .sort({ createdAt: 1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        this.countDocuments({ parentComment: parentCommentId }),
    ]);
    return { replies, total };
};

// ============================================================
// بخش ۸: تبدیل خروجی JSON
// ============================================================
CommentReplySchema.set('toJSON', {
    transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret.__v;
        return ret;
    },
});

// ============================================================
// بخش ۹: ایجاد و صادرات مدل
// ============================================================
const CommentReply = mongoose.model('CommentReply', CommentReplySchema);
module.exports = CommentReply;
