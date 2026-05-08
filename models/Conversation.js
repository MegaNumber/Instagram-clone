// مسیر فایل: /models/Conversation.js
// توضیح: مدل Mongoose برای مکالمات (چت‌های خصوصی و گروهی). این مدل
// اطلاعات پایه‌ای یک گفتگو، شامل شرکت‌کنندگان، آخرین پیام، تعداد پیام‌های
// خوانده‌نشده (با استفاده از Map برای انعطاف‌پذیری) و متادیتای گروه را
// نگهداری می‌کند. این طراحی برای پیام‌رسانی مشابه Direct اینستاگرام
// یا چت فیسبوک بهینه شده است.
//
// @version 2.4.2
// @since 2026

// ============================================================
// بخش ۱: ایمپورت ماژول‌های مورد نیاز
// ============================================================
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// ============================================================
// بخش ۲: طرحواره مکالمه
// ============================================================
const ConversationSchema = new Schema(
    {
        // ---------- شرکت‌کنندگان ----------
        participants: [
            {
                type: Schema.Types.ObjectId,
                ref: 'User',
                required: [true, 'حداقل یک شرکت‌کننده الزامی است.'],
            },
        ],
        // ---------- آخرین پیام (برای پیش‌نمایش در لیست چت‌ها) ----------
        lastMessage: {
            type: Schema.Types.ObjectId,
            ref: 'Message',
            default: null,
        },
        lastMessageText: {
            type: String,
            default: '',
            maxlength: [200, 'پیش‌نمایش پیام نمی‌تواند بیشتر از ۲۰۰ کاراکتر باشد.'],
        },
        lastMessageAt: {
            type: Date,
            default: Date.now,
        },
        // ---------- شمارنده پیام‌های خوانده‌نشده ----------
        // کلید: شناسه کاربر (String)، مقدار: تعداد پیام‌های خوانده‌نشده
        unreadCount: {
            type: Map,
            of: Number,
            default: {},
        },
        // ---------- تنظیمات گروه ----------
        isGroup: {
            type: Boolean,
            default: false,
        },
        groupName: {
            type: String,
            trim: true,
            maxlength: [100, 'نام گروه نمی‌تواند بیشتر از ۱۰۰ کاراکتر باشد.'],
            default: '',
        },
        groupAvatar: {
            type: String,
            default: '',
        },
        // (اختیاری) سازندهٔ گروه
        groupAdmin: {
            type: Schema.Types.ObjectId,
            ref: 'User',
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
// بخش ۳: اعتبارسنجی تعداد شرکت‌کنندگان
// ============================================================
ConversationSchema.pre('validate', function (next) {
    if (this.isGroup && this.participants.length < 3) {
        return next(new Error('گروه باید حداقل ۳ شرکت‌کننده داشته باشد.'));
    }
    if (!this.isGroup && this.participants.length !== 2) {
        return next(new Error('چت خصوصی باید دقیقاً ۲ شرکت‌کننده داشته باشد.'));
    }
    next();
});

// ============================================================
// بخش ۴: ایندکس‌های ترکیبی برای عملکرد سریع
// ============================================================
// یافتن سریع مکالمهٔ خصوصی بین دو کاربر
ConversationSchema.index({ participants: 1, isGroup: 1 });
// مرتب‌سازی چت‌ها بر اساس آخرین پیام
ConversationSchema.index({ lastMessageAt: -1 });
// ترکیب دقیق برای جستجوی چت خصوصی بین دو نفر (عملکرد فوق‌العاده)
ConversationSchema.index(
    { participants: 1 },
    { unique: false } // یکتا نیست، اما برای جستجو بهینه است
);

// ============================================================
// بخش ۵: فیلدهای مجازی (Virtuals)
// ============================================================

/**
 * @virtual
 * @description آیا این مکالمه تاکنون پیامی داشته است؟
 */
ConversationSchema.virtual('isActive').get(function () {
    return this.lastMessage !== null;
});

/**
 * @virtual
 * @description تعداد کل شرکت‌کنندگان
 */
ConversationSchema.virtual('participantCount').get(function () {
    return this.participants ? this.participants.length : 0;
});

// ============================================================
// بخش ۶: متدهای استاتیک (کمکی)
// ============================================================

/**
 * یافتن یک مکالمهٔ خصوصی بین دو کاربر، یا ایجاد آن در صورت عدم وجود.
 * @param {string} user1 - شناسه کاربر اول
 * @param {string} user2 - شناسه کاربر دوم
 * @returns {Promise<Document>}
 */
ConversationSchema.statics.findOrCreatePrivate = async function (user1, user2) {
    // ترتیب را نرمال می‌کنیم تا همیشه کوئری یکسان باشد
    const ids = [user1.toString(), user2.toString()].sort();
    let conversation = await this.findOne({
        isGroup: false,
        participants: { $size: 2, $all: ids },
    }).populate('participants', 'username avatar fullName');

    if (!conversation) {
        conversation = await this.create({
            isGroup: false,
            participants: ids,
        });
        await conversation.populate('participants', 'username avatar fullName');
    }
    return conversation;
};

/**
 * ایجاد یک گروه جدید
 * @param {string} adminId - سازندهٔ گروه
 * @param {string} groupName - نام گروه
 * @param {string[]} memberIds - آرایه‌ای از شناسه‌های اعضا (بدون ادمین)
 * @returns {Promise<Document>}
 */
ConversationSchema.statics.createGroup = async function (adminId, groupName, memberIds = []) {
    const participants = [adminId, ...memberIds];
    return this.create({
        isGroup: true,
        participants,
        groupName,
        groupAdmin: adminId,
    });
};

// ============================================================
// بخش ۷: تبدیل خروجی JSON
// ============================================================
ConversationSchema.set('toJSON', {
    transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret.__v;
        ret.participantCount = ret.participants ? ret.participants.length : 0;
        return ret;
    },
});

// ============================================================
// بخش ۸: صادرات مدل
// ============================================================
module.exports = mongoose.model('Conversation', ConversationSchema);
