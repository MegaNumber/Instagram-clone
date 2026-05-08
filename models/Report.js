// مسیر فایل: /models/Report.js
// توضیح: مدل گزارش کاربران. امکان گزارش پست، کامنت و کاربر را فراهم می‌کند.
// وضعیت‌ها: pending → reviewed → resolved / dismissed

const mongoose = require('mongoose');

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

const ReportSchema = new mongoose.Schema(
    {
        reporter: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        targetType: {
            type: String,
            enum: ['post', 'comment', 'user', 'story', 'reel'],
            required: true,
        },
        target: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
            refPath: 'targetType',
        },
        reason: {
            type: String,
            enum: REPORT_REASONS,
            required: true,
        },
        description: {
            type: String,
            maxlength: 500,
            default: '',
        },
        status: {
            type: String,
            enum: REPORT_STATUSES,
            default: 'pending',
            index: true,
        },
        reviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        reviewedAt: {
            type: Date,
            default: null,
        },
        resolution: {
            type: String,
            maxlength: 500,
            default: '',
        },
    },
    { timestamps: true, versionKey: false }
);

// هر کاربر فقط یک بار می‌تواند یک target را گزارش دهد
ReportSchema.index({ reporter: 1, target: 1, targetType: 1 }, { unique: true });

module.exports = mongoose.model('Report', ReportSchema);
