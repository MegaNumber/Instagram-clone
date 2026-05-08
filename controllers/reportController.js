// مسیر فایل: /controllers/reportController.js
// توضیح: کنترلر مدیریت گزارش‌ها. ایجاد گزارش جدید و دریافت لیست گزارش‌ها.

const Report = require('../models/Report');
const asyncHandler = require('../utils/asyncHandler');

// ایجاد گزارش
module.exports.createReport = asyncHandler(async (req, res) => {
    const user = res.locals.user;
    const { targetType, target, reason, description } = req.body;

    if (!targetType || !target || !reason) {
        return res.status(400).json({
            success: false,
            error: 'شناسه هدف، نوع هدف و دلیل گزارش الزامی است.',
        });
    }

    const validTypes = ['post', 'comment', 'user', 'story', 'reel'];
    if (!validTypes.includes(targetType)) {
        return res.status(400).json({
            success: false,
            error: 'نوع هدف نامعتبر است.',
        });
    }

    const exists = await Report.findOne({
        reporter: user._id,
        target,
        targetType,
    });

    if (exists) {
        return res.status(409).json({
            success: false,
            error: 'شما قبلاً این مورد را گزارش کرده‌اید.',
        });
    }

    const report = await Report.create({
        reporter: user._id,
        targetType,
        target,
        reason,
        description: description || '',
    });

    res.status(201).json({
        success: true,
        data: report,
        message: 'گزارش با موفقیت ثبت شد.',
    });
});

// دریافت گزارش‌های من (برای کاربر عادی)
module.exports.getMyReports = asyncHandler(async (req, res) => {
    const user = res.locals.user;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const reports = await Report.find({ reporter: user._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

    const total = await Report.countDocuments({ reporter: user._id });

    res.status(200).json({
        success: true,
        data: reports,
        pagination: { page, limit, total, hasMore: skip + limit < total },
    });
});

// دریافت همه گزارش‌ها (ادمین)
module.exports.getAllReports = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const { status } = req.query;

    const filter = {};
    if (status && ['pending', 'reviewed', 'resolved', 'dismissed'].includes(status)) {
        filter.status = status;
    }

    const reports = await Report.find(filter)
        .populate('reporter', 'username avatar')
        .populate('target')
        .populate('reviewedBy', 'username')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

    const total = await Report.countDocuments(filter);

    res.status(200).json({
        success: true,
        data: reports,
        pagination: { page, limit, total, hasMore: skip + limit < total },
    });
});

// به‌روزرسانی وضعیت گزارش (ادمین)
module.exports.updateReportStatus = asyncHandler(async (req, res) => {
    const { reportId } = req.params;
    const { status, resolution } = req.body;
    const admin = res.locals.user;

    const validStatuses = ['reviewed', 'resolved', 'dismissed'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({
            success: false,
            error: 'وضعیت نامعتبر است.',
        });
    }

    const report = await Report.findById(reportId);
    if (!report) {
        return res.status(404).json({
            success: false,
            error: 'گزارشی با این شناسه یافت نشد.',
        });
    }

    report.status = status;
    report.reviewedBy = admin._id;
    report.reviewedAt = new Date();
    if (resolution) report.resolution = resolution;
    await report.save();

    res.status(200).json({
        success: true,
        data: report,
        message: 'وضعیت گزارش به‌روزرسانی شد.',
    });
});
