// مسیر فایل: /models/Report.js
// توضیح: مدل Mongoose برای گزارش‌های کاربران. امکان گزارش پست، کامنت،
// کاربر، استوری و ریلز را با وضعیت‌های مختلف (pending، reviewed و ...)
// فراهم می‌کند. هر کاربر تنها یک بار می‌تواند یک هدف را گزارش دهد.
//
// @version 2.4.5
// @since 2026

// ============================================================
// بخش ۱: ایمپورت ماژول‌ها
// ============================================================
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// ============================================================
// بخش ۲: ثابت‌های پیکربندی
// ============================================================
const REPORT_REASONS = [
    'spam',
    'harassment',
    'hate_speech',
    'violence',
    'nudity',
    'intellectual_property',
    'false_information',
    'self_harm',
    'other',
];

const REPORT_STATUSES = ['pending', 'reviewed', 'resolved', 'dismissed'];

// ============================================================
// بخش ۳: طرحواره گزارش
// ============================================================
const ReportSchema = new Schema(
    {
        // ---------- گزارش‌دهنده ----------
        reporter: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'گزارش‌دهنده الزامی است.'],
            index: true,
        },
        // ---------- نوع هدف ----------
        targetType: {
            type: String,
            enum: {
                values: ['post', 'comment', 'user', 'story', 'reel'],
                message: 'نوع هدف باید یکی از post, comment, user, story, reel باشد.',
            },
            required: [true, 'نوع هدف الزامی است.'],
        },
        // ---------- شناسه هدف ----------
        target: {
            type: Schema.Types.ObjectId,
            required: [true, 'شناسه هدف الزامی است.'],
            index: true,
            refPath: 'targetType', // ارجاع پویا به مجموعه مربوطه
        },
        // ---------- دلیل گزارش ----------
        reason: {
            type: String,
            enum: {
                values: REPORT_REASONS,
                message: `دلیل گزارش باید یکی از موارد ${REPORT_REASONS.join(', ')} باشد.`,
            },
            required: [true, 'دلیل گزارش الزامی است.'],
        },
        // ---------- توضیحات اضافی ----------
        description: {
            type: String,
            maxlength: [500, 'توضیحات نمی‌تواند بیشتر از ۵۰۰ کاراکتر باشد.'],
            default: '',
        },
        // ---------- وضعیت رسیدگی ----------
        status: {
            type: String,
            enum: {
                values: REPORT_STATUSES,
                message: `وضعیت باید یکی از ${REPORT_STATUSES.join(', ')} باشد.`,
            },
            default: 'pending',
            index: true,
        },
        // ---------- اطلاعات رسیدگی ----------
        reviewedBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        reviewedAt: {
            type: Date,
            default: null,
        },
        resolution: {
            type: String,
            maxlength: [500, 'توضیحات نتیجه نمی‌تواند بیشتر از ۵۰۰ کاراکتر باشد.'],
            default: '',
        },
    },
    {
        timestamps: true,
        versionKey: false,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// ============================================================
// بخش ۴: ایندکس‌ها
// ============================================================
// هر کاربر فقط یک‌بار می‌تواند یک هدف را گزارش دهد
ReportSchema.index(
    { reporter: 1, target: 1, targetType: 1 },
    { unique: true, name: 'unique_report_per_user' }
);

// ایندکس ترکیبی برای یافتن گزارش‌های باز (pending) به ترتیب جدیدترین
ReportSchema.index({ status: 1, createdAt: -1 });

// ============================================================
// بخش ۵: فیلدهای مجازی (Virtuals)
// ============================================================

/**
 * @virtual
 * @description زمان نسبی ایجاد گزارش
 */
ReportSchema.virtual('timeAgo').get(function () {
    if (!this.createdAt) return '';
    const seconds = Math.floor((Date.now() - this.createdAt.getTime()) / 1000);
    if (seconds < 60) return 'همین الان';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} دقیقه پیش`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ساعت پیش`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} روز پیش`;
    const months = Math.floor(days / 30);
    return `${months} ماه پیش`;
});

// ============================================================
// بخش ۶: متدهای استاتیک (کمکی)
// ============================================================

/**
 * دریافت گزارش‌های باز (pending) با صفحه‌بندی
 * @param {object} options - { page, limit }
 * @returns {Promise<{reports: Array, total: number}>}
 */
ReportSchema.statics.findOpenReports = async function ({ page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;
    const [reports, total] = await Promise.all([
        this.find({ status: 'pending' })
            .populate('reporter', 'username avatar')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        this.countDocuments({ status: 'pending' }),
    ]);
    return { reports, total };
};

// ============================================================
// بخش ۷: تبدیل خروجی JSON
// ============================================================
ReportSchema.set('toJSON', {
    transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret.__v;
        return ret;
    },
});

// ============================================================
// بخش ۸: صادرات مدل
// ============================================================
module.exports = mongoose.model('Report', ReportSchema);
