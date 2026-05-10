// مسیر فایل: /routes/reel.js
// توضیح: تعریف مسیرهای مربوط به ریلز. شامل ایجاد، دریافت فید،
// دریافت یک ریلز، لایک و حذف ریلز.
//
// [v2.0.0] اصلاحیه:
// - جابجایی مسیر /feed به بالای مسیر :reelId برای جلوگیری از تفسیر "feed" به عنوان شناسه
// - افزودن validateObjectId به تمام مسیرهای دارای :reelId

// ============================================================
// بخش ۱: ایمپورت وابستگی‌ها
// ============================================================
const router = require('express').Router();
const mongoose = require('mongoose');                       // mongoose@7.x
const { requireAuth } = require('../controllers/authController');
const asyncHandler = require('../utils/asyncHandler');
const { uploadReelVideo } = require('../utils/fileUpload');
const ctrl = require('../controllers/reelController');

// ============================================================
// بخش ۲: میدلور اعتبارسنجی شناسه‌های مونگو
// ============================================================
/**
 * @middleware validateObjectId
 * @description بررسی معتبر بودن شناسهٔ MongoDB. در صورت نامعتبر بودن،
 * پاسخ ۴۰۰ با پیام خطای فارسی برگردانده می‌شود.
 * @param {string} paramName - نام پارامتر (مثلاً reelId)
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
// بخش ۳: تعریف مسیرها (توجه: مسیرهای ثابت قبل از پارامتری)
// ============================================================

// دریافت فید ریلز
// GET /api/reels/feed
router.get('/feed', requireAuth, asyncHandler(ctrl.getReelFeed));

// ایجاد ریلز جدید (با آپلود ویدیو)
// POST /api/reels
router.post('/', requireAuth, uploadReelVideo, asyncHandler(ctrl.createReel));

// دریافت یک ریلز خاص
// GET /api/reels/:reelId
router.get(
  '/:reelId',
  requireAuth,
  validateObjectId('reelId'),               // [v2.0.0] افزوده شد
  asyncHandler(ctrl.getReel)
);

// لایک کردن یک ریلز
// POST /api/reels/:reelId/like
router.post(
  '/:reelId/like',
  requireAuth,
  validateObjectId('reelId'),               // [v2.0.0] افزوده شد
  asyncHandler(ctrl.likeReel)
);

// حذف یک ریلز
// DELETE /api/reels/:reelId
router.delete(
  '/:reelId',
  requireAuth,
  validateObjectId('reelId'),
  asyncHandler(ctrl.deleteReel)
);

module.exports = router;
