// مسیر فایل: /routes/story.js
// توضیح: تعریف مسیرهای مربوط به استوری‌ها. شامل ایجاد، دریافت فید،
// دریافت استوری‌های یک کاربر، ثبت بازدید، لایک و حذف استوری.
//
// [v2.0.0] اصلاحیه:
// - افزودن validateObjectId برای مسیرهای دارای :storyId و :userId
//   جهت جلوگیری از خطاهای Mongoose CastError و بازگرداندن پاسخ ۴۰۰ مناسب

// ============================================================
// بخش ۱: ایمپورت وابستگی‌ها
// ============================================================
const router = require('express').Router();
const mongoose = require('mongoose');                       // mongoose@7.x
const { requireAuth } = require('../controllers/authController');
const asyncHandler = require('../utils/asyncHandler');
const { uploadStoryMedia } = require('../utils/fileUpload');
const ctrl = require('../controllers/storyController');

// ============================================================
// بخش ۲: میدلور اعتبارسنجی شناسه‌های مونگو
// ============================================================
/**
 * @middleware validateObjectId
 * @description بررسی معتبر بودن شناسهٔ MongoDB در پارامترهای مسیر.
 * در صورت نامعتبر بودن، پاسخ ۴۰۰ با پیام خطای فارسی برگردانده می‌شود.
 * @param {string} paramName - نام پارامتر (مثلاً storyId یا userId)
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

// ایجاد استوری جدید (با آپلود رسانه)
// POST /api/stories
router.post('/', requireAuth, uploadStoryMedia, asyncHandler(ctrl.createStory));

// دریافت فید استوری‌ها
// GET /api/stories/feed
// (مسیر ثابت باید قبل از مسیرهای پارامتری باشد)
router.get('/feed', requireAuth, asyncHandler(ctrl.getStoryFeed));

// دریافت استوری‌های یک کاربر خاص
// GET /api/stories/user/:userId
router.get(
  '/user/:userId',
  requireAuth,
  validateObjectId('userId'),               // [v2.0.0] افزوده شد
  asyncHandler(ctrl.getUserStories)
);

// ثبت بازدید یک استوری
// POST /api/stories/:storyId/view
router.post(
  '/:storyId/view',
  requireAuth,
  validateObjectId('storyId'),              // [v2.0.0] افزوده شد
  asyncHandler(ctrl.viewStory)
);

// لایک کردن یک استوری
// POST /api/stories/:storyId/like
router.post(
  '/:storyId/like',
  requireAuth,
  validateObjectId('storyId'),              // [v2.0.0] افزوده شد
  asyncHandler(ctrl.likeStory)
);

// حذف یک استوری
// DELETE /api/stories/:storyId
router.delete(
  '/:storyId',
  requireAuth,
  validateObjectId('storyId'),
  asyncHandler(ctrl.deleteStory)
);

module.exports = router;
