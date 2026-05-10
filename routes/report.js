// مسیر فایل: /routes/report.js
// توضیح: تعریف مسیرهای مربوط به گزارش‌دهی. شامل ایجاد گزارش جدید،
// دریافت گزارش‌های کاربر جاری، دریافت همهٔ گزارش‌ها (مدیریتی)،
// و به‌روزرسانی وضعیت یک گزارش.
//
// [v2.0.0] اصلاحیه:
// - افزودن validateObjectId برای مسیر PUT /:reportId

// ============================================================
// بخش ۱: ایمپورت وابستگی‌ها
// ============================================================
const router = require('express').Router();
const mongoose = require('mongoose');                       // mongoose@7.x
const { requireAuth } = require('../controllers/authController');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/reportController');

// ============================================================
// بخش ۲: میدلور اعتبارسنجی شناسه‌های مونگو
// ============================================================
/**
 * @middleware validateObjectId
 * @description بررسی معتبر بودن شناسهٔ MongoDB. در صورت نامعتبر بودن،
 * پاسخ ۴۰۰ با پیام خطای فارسی برگردانده می‌شود.
 * @param {string} paramName - نام پارامتر (مثلاً reportId)
 */
const validateObjectId = (paramName) => (req, res, next) => {
  const id = req.params[paramName];
  if (id && !mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      error: `شناسه ${paramName} نامعتبر است.`,
    });
  }
  next();
};

// ============================================================
// بخش ۳: تعریف مسیرها
// ============================================================

// ایجاد گزارش جدید
// POST /api/reports
router.post('/', requireAuth, asyncHandler(ctrl.createReport));

// دریافت گزارش‌های کاربر جاری
// GET /api/reports/mine
router.get('/mine', requireAuth, asyncHandler(ctrl.getMyReports));

// دریافت تمام گزارش‌ها (مدیریتی)
// GET /api/reports
router.get('/', requireAuth, asyncHandler(ctrl.getAllReports));

// به‌روزرسانی وضعیت یک گزارش (مدیریتی)
// PUT /api/reports/:reportId
router.put(
  '/:reportId',
  requireAuth,
  validateObjectId('reportId'),           // [v2.0.0] افزوده شد
  asyncHandler(ctrl.updateReportStatus)
);

module.exports = router;
