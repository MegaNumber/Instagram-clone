// مسیر فایل: /controllers/reportController.js
// توضیح: کنترلر مدیریت گزارش‌ها. ایجاد گزارش جدید (پس از بررسی وجود هدف)،
// دریافت گزارش‌های کاربر عادی، دریافت تمام گزارش‌ها (با فیلتر وضعیت) برای
// ادمین، و به‌روزرسانی وضعیت گزارش (بررسی و رفع).
//
// @version 2.5.0
// @since 2026

const Report = require('../models/Report');
const asyncHandler = require('../utils/asyncHandler');
const mongoose = require('mongoose');

// دریافت مدل‌های مرتبط بر اساس نوع هدف (برای اعتبارسنجی وجود هدف)
const getTargetModel = (targetType) => {
  const models = {
    post: require('../models/Post'),
    comment: require('../models/Comment'),
    user: require('../models/User'),
    story: require('../models/Story'),
    reel: require('../models/Reel'),
  };
  return models[targetType] || null;
};

// ============================================================
// بخش ۱: ایجاد گزارش جدید
// ============================================================
module.exports.createReport = asyncHandler(async (req, res) => {
  const user = res.locals.user;
  const { targetType, target, reason, description } = req.body;

  // اعتبارسنجی اولیه
  if (!targetType || !target || !reason) {
    return res.status(400).json({
      success: false,
      error: 'شناسه هدف، نوع هدف و دلیل گزارش الزامی است.',
    });
  }

  if (!Report.schema.path('targetType').enumValues.includes(targetType)) {
    return res.status(400).json({
      success: false,
      error: 'نوع هدف نامعتبر است.',
    });
  }

  // بررسی وجود هدف در دیتابیس
  const TargetModel = getTargetModel(targetType);
  if (TargetModel) {
    const targetDoc = await TargetModel.findById(target).select('_id').lean();
    if (!targetDoc) {
      return res.status(404).json({
        success: false,
        error: 'هدف مورد نظر یافت نشد.',
      });
    }
  }

  // بررسی گزارش تکراری
  const existingReport = await Report.findOne({
    reporter: user._id,
    target,
    targetType,
  });

  if (existingReport) {
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
    message: 'گزارش با موفقیت ثبت شد. تیم ما آن را بررسی خواهد کرد.',
  });
});

// ============================================================
// بخش ۲: دریافت گزارش‌های من (کاربر عادی)
// ============================================================
module.exports.getMyReports = asyncHandler(async (req, res) => {
  const user = res.locals.user;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const [reports, total] = await Promise.all([
    Report.find({ reporter: user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Report.countDocuments({ reporter: user._id }),
  ]);

  res.status(200).json({
    success: true,
    data: reports,
    pagination: { page, limit, total, hasMore: skip + limit < total },
  });
});

// ============================================================
// بخش ۳: دریافت همه گزارش‌ها (ادمین) – با فیلتر اختیاری status
// ============================================================
module.exports.getAllReports = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;
  const { status } = req.query;

  const filter = {};
  if (status && Report.schema.path('status').enumValues.includes(status)) {
    filter.status = status;
  }

  const [reports, total] = await Promise.all([
    Report.find(filter)
      .populate('reporter', 'username avatar')
      .populate('target') // refPath باعث می‌شود به مجموعه صحیح اشاره کند
      .populate('reviewedBy', 'username')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Report.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: reports,
    pagination: { page, limit, total, hasMore: skip + limit < total },
  });
});

// ============================================================
// بخش ۴: به‌روزرسانی وضعیت گزارش (ادمین)
// ============================================================
module.exports.updateReportStatus = asyncHandler(async (req, res) => {
  const { reportId } = req.params;
  const { status, resolution } = req.body;
  const admin = res.locals.user;

  // اعتبارسنجی وضعیت
  if (!Report.schema.path('status').enumValues.includes(status)) {
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

  // به‌روزرسانی
  report.status = status;
  report.reviewedBy = admin._id;
  report.reviewedAt = new Date();
  if (resolution) report.resolution = resolution;
  await report.save();

  res.status(200).json({
    success: true,
    data: report,
    message: 'وضعیت گزارش با موفقیت به‌روزرسانی شد.',
  });
});
