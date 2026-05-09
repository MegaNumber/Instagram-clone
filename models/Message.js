// مسیر فایل: /models/Message.js
// توضیح: مدل Mongoose برای پیام‌ها (Messages). هر پیام به یک مکالمه (Conversation)
// تعلق دارد و می‌تواند از نوع متن، تصویر، ویدئو، صوت یا فایل باشد.
// این مدل با ایندکس‌های بهینه برای بازیابی سریع تاریخچهٔ چت و متدهای کمکی
// برای علامت‌گذاری خوانده‌شده طراحی شده است.
//
// @version 2.4.3
// @since 2026

// ============================================================
// بخش ۱: ایمپورت ماژول‌های مورد نیاز
// ============================================================
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// ============================================================
// بخش ۲: تعریف طرحواره پیام
// ============================================================
const MessageSchema = new Schema(
    {
        // ---------- مکالمهٔ مرتبط ----------
        conversation: {
            type: Schema.Types.ObjectId,
            ref: 'Conversation',
            required: [true, 'مکالمهٔ مرتبط الزامی است.'],
            index: true,
        },
        // ---------- فرستنده ----------
        sender: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'فرستنده الزامی است.'],
        },
        // ---------- گیرنده ----------
        receiver: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'گیرنده الزامی است.'],
        },
        // ---------- نوع پیام ----------
        messageType: {
            type: String,
            enum: {
                values: ['text', 'image', 'video', 'audio', 'file'],
                message: 'نوع پیام باید یکی از موارد text, image, video, audio, file باشد.',
            },
            default: 'text',
        },
        // ---------- محتوای متنی ----------
        text: {
            type: String,
            default: '',
            maxlength: [2000, 'متن پیام نمی‌تواند بیشتر از ۲۰۰۰ کاراکتر باشد.'],
        },
        // ---------- مسیر فایل (در صورت پیام رسانه‌ای) ----------
        mediaUrl: {
            type: String,
            default: '',
            validate: {
                validator: function (v) {
                    if (!v) return true; // اختیاری
                    return /^\/(uploads|images)\/[\w\-./]+\.\w{2,5}$/i.test(v);
                },
                message: 'مسیر فایل پیام نامعتبر است.',
            },
        },
        // ---------- پیش‌نمایش (Thumbnail) برای تصاویر/ویدئوها ----------
        thumbnailUrl: {
            type: String,
            default: '',
        },
        // ---------- پاسخ به یک پیام دیگر (Reply) ----------
        replyTo: {
            type: Schema.Types.ObjectId,
            ref: 'Message',
            default: null,
        },
        // ---------- وضعیت خوانده‌شدن ----------
        isRead: {
            type: Boolean,
            default: false,
        },
        readAt: {
            type: Date,
            default: null,
        },
    },
    // گزینه‌های طرحواره
    {
        timestamps: true,
        versionKey: false,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// ============================================================
// بخش ۳: ایندکس‌های بهینه
// ============================================================
// ایندکس ترکیبی برای دریافت پیام‌های یک مکالمه به ترتیب نزولی (جدیدترین)
MessageSchema.index({ conversation: 1, createdAt: -1 });
// ایندکس برای یافتن سریع پیام‌های خوانده‌نشدهٔ یک کاربر
MessageSchema.index({ receiver: 1, isRead: 1 });
// ایندکس برای جستجوی پیام‌های یک فرستنده در یک مکالمه (اختیاری)
MessageSchema.index({ sender: 1, conversation: 1 });

// ============================================================
// بخش ۴: متدهای استاتیک (کمکی)
// ============================================================

/**
 * علامت‌گذاری تمام پیام‌های خوانده‌نشدهٔ یک مکالمه به عنوان خوانده‌شده
 * @param {string} conversationId - شناسه مکالمه
 * @param {string} userId - کاربری که پیام‌ها را خوانده است (گیرنده)
 * @returns {Promise<number>} - تعداد اسناد به‌روزرسانی‌شده
 */
MessageSchema.statics.markAsRead = async function (conversationId, userId) {
    const result = await this.updateMany(
        {
            conversation: conversationId,
            receiver: userId,
            isRead: false,
        },
        {
            $set: { isRead: true, readAt: new Date() },
        }
    );
    return result.modifiedCount;
};

/**
 * دریافت صفحه‌بندی‌شدهٔ پیام‌های یک مکالمه
 * @param {string} conversationId
 * @param {object} options - { page, limit }
 * @returns {Promise<{messages: Array, total: number}>}
 */
MessageSchema.statics.findByConversation = async function (
    conversationId,
    { page = 1, limit = 30 } = {}
) {
    const skip = (page - 1) * limit;
    const [messages, total] = await Promise.all([
        this.find({ conversation: conversationId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        this.countDocuments({ conversation: conversationId }),
    ]);
    return { messages: messages.reverse(), total };
};

// ============================================================
// بخش ۵: تبدیل خروجی JSON
// ============================================================
MessageSchema.set('toJSON', {
    transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret.__v;
        return ret;
    },
});

// ============================================================
// بخش ۶: صادرات مدل
// ============================================================
module.exports = mongoose.model('Message', MessageSchema);
