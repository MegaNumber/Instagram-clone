// مسیر فایل: /models/Comment.js
// توضیح: مدل Mongoose برای نظرات. این فایل ساختار یک نظر (کامنت) را همراه با
// نویسنده، پست مرجع، کاربران منشن‌شده، و هوک‌های لازم برای ایجاد سند رأی و
// حذف آبشاری تعریف می‌کند. همچنین ایندکس‌های بهینه برای نمایش سریع نظرات
// و فیلدهای مجازی برای تعداد لایک‌ها و پاسخ‌ها را فراهم می‌کند.

// ============================================================
// بخش ۱: ایمپورت ماژول‌های مورد نیاز
// ============================================================
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// ============================================================
// بخش ۲: ثابت‌های پیکربندی
// ============================================================
const MESSAGE_MAX_LENGTH = 2000; // حداکثر طول متن نظر

// ============================================================
// بخش ۳: تعریف طرحواره نظر (Comment Schema)
// ============================================================
const CommentSchema = new Schema(
    {
        // ---------- متن نظر ----------
        message: {
            type: String,
            required: [true, 'متن نظر نمی‌تواند خالی باشد.'],
            trim: true,
            maxlength: [MESSAGE_MAX_LENGTH, `متن نظر نمی‌تواند بیشتر از ${MESSAGE_MAX_LENGTH} کاراکتر باشد.`],
        },
        // ---------- نویسنده نظر ----------
        author: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'نویسنده نظر الزامی است.'],
            index: true, // برای جستجوی نظرات یک کاربر خاص
        },
        // ---------- پست مرتبط ----------
        post: {
            type: Schema.Types.ObjectId,
            ref: 'Post',
            required: [true, 'پست مرتبط الزامی است.'],
            index: true, // ایندکس اصلی برای دریافت نظرات یک پست
        },
        // ---------- کاربران منشن‌شده در متن (ذخیره‌سازی برای کوئری آسان) ----------
        mentions: [
            {
                type: Schema.Types.ObjectId,
                ref: 'User',
            },
        ],
        // (اختیاری) فیلد 'edited' برای نشان دادن ویرایش نظر
        edited: {
            type: Boolean,
            default: false,
        },
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
// دریافت نظرات یک پست به ترتیب قدیمی‌ترین (برای نمایش تایم‌لاین)
// قانون ESR: Equality (post) سپس Sort (createdAt)
CommentSchema.index({ post: 1, createdAt: 1 });

// ایندکس مرکب برای جستجوی نظرات بر اساس نویسنده و پست
CommentSchema.index({ author: 1, post: 1 });

// ============================================================
// بخش ۵: هوک‌های Mongoose (Middlewares)
// ============================================================

// ---------- هوک ۱: ایجاد خودکار سند رأی برای نظر جدید ----------
// این هوک تضمین می‌کند هر نظر یک سند CommentVote متناظر داشته باشد
// تا آرایه‌ی رأی‌های آن مدیریت شود.
CommentSchema.pre('save', async function (next) {
    if (this.isNew) {
        try {
            await mongoose.model('CommentVote').create({ comment: this._id });
        } catch (err) {
            return next(err);
        }
    }
    next();
});

// ---------- هوک ۲: پاک‌سازی آبشاری قبل از حذف نظر ----------
// این هوک تضمین می‌کند با حذف یک نظر، رأی‌های آن و تمام پاسخ‌های (Reply) آن نیز حذف شوند.
CommentSchema.pre('deleteOne', { document: false, query: true }, async function (next) {
    try {
        const filter = this.getFilter();
        const commentId = filter._id;

        if (!commentId) {
            console.warn('[Comment.deleteOne hook] شناسه نظر در فیلتر یافت نشد.');
            return next();
        }

        // حذف آبشاری: رأی‌ها و پاسخ‌های مرتبط
        await Promise.all([
            mongoose.model('CommentVote').deleteOne({ comment: commentId }),
            mongoose.model('CommentReply').deleteMany({ parentComment: commentId }),
            // در صورت نیاز می‌توان نوتیفیکیشن‌های مربوط به این نظر را هم حذف کرد
        ]);
        console.log(`[Cascade Cleanup] اسناد مرتبط با نظر ${commentId} با موفقیت حذف شدند.`);
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
 * @description محاسبه تعداد لایک‌های نظر (تعداد آرای موجود در سند CommentVote)
 * @returns {Promise<number>} تعداد لایک‌ها
 */
CommentSchema.virtual('likeCount', {
    ref: 'CommentVote',
    localField: '_id',
    foreignField: 'comment',
    count: true,
});

/**
 * @virtual
 * @description محاسبه تعداد پاسخ‌های این نظر (CommentReply)
 * @returns {Promise<number>} تعداد پاسخ‌ها
 */
CommentSchema.virtual('replyCount', {
    ref: 'CommentReply',
    localField: '_id',
    foreignField: 'parentComment',
    count: true,
});

// ============================================================
// بخش ۷: تبدیل خروجی JSON
// ============================================================
CommentSchema.set('toJSON', {
    transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret.__v;
        // برای سازگاری با کدهای قدیمی‌تر (در صورت نیاز)
        // ret.date = ret.createdAt;
        return ret;
    },
});

// ============================================================
// بخش ۸: ایجاد و صادرات مدل
// ============================================================
const Comment = mongoose.model('Comment', CommentSchema);
module.exports = Comment;
