// مسیر فایل: /routes/user.js
// توضیح: تعریف مسیرهای مربوط به کاربران. این فایل تمام endpointهای کاربری را
// به کنترلرهای مربوطه نگاشت می‌کند و میدلورهای امنیتی و احراز هویت را اعمال می‌کند.

// ============================================================
// بخش ۱: ایمپورت وابستگی‌های اصلی
// ============================================================
const express = require('express');
const userRouter = express.Router();
const multer = require('multer');
const mongoose = require('mongoose');

// ============================================================
// بخش ۲: ایمپورت میدلورهای سفارشی
// ============================================================
const asyncHandler = require('../utils/asyncHandler'); // میدلور برای حذف try-catch تکراری
const { requireAuth, optionalAuth } = require('../controllers/authController'); // میدلورهای احراز هویت

// ============================================================
// بخش ۳: ایمپورت کنترلرهای کاربر
// ============================================================
const {
  retrieveUser,
  retrievePosts,
  bookmarkPost,
  followUser,
  retrieveFollowing,
  retrieveFollowers,
  searchUsers,
  confirmUser,
  changeAvatar,
  removeAvatar,
  updateProfile,
  retrieveSuggestedUsers,
} = require('../controllers/userController');

// ============================================================
// بخش ۴: پیکربندی Multer برای آپلود آواتار
// ============================================================
// ذخیره موقت فایل در پوشه 'temp' با محدودیت حجم ۱ مگابایت
const avatarUpload = multer({
  dest: 'temp/',
  limits: {
    fileSize: 1 * 1024 * 1024, // حداکثر ۱ مگابایت
    fieldSize: 8 * 1024 * 1024, // حداکثر اندازه فیلد
  },
  fileFilter: (req, file, cb) => {
    // فقط تصاویر مجازند
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('فقط فایل‌های تصویری مجاز به آپلود هستند.'), false);
    }
  },
}).single('image'); // نام فیلد ارسالی از فرم باید 'image' باشد

// ============================================================
// بخش ۵: میدلور کمکی اعتبارسنجی شناسه‌های Mongoose
// ============================================================
/**
 * @param {...string} paramNames - نام پارامترهای دارای ObjectId
 * @returns {function} میدلور اعتبارسنجی
 */
const validateObjectId = (...paramNames) => {
  return (req, res, next) => {
    for (const paramName of paramNames) {
      const paramValue = req.params[paramName];
      if (paramValue && !mongoose.Types.ObjectId.isValid(paramValue)) {
        return res.status(400).json({
          success: false,
          error: `شناسه ${paramName} نامعتبر است.`,
        });
      }
    }
    next();
  };
};

// ============================================================
// بخش ۶: تعریف مسیرهای کاربری
// ============================================================

// ---------- پروفایل و اطلاعات کاربر ----------
// GET /api/users/:username
userRouter.get(
  '/:username',
  optionalAuth, // در صورت وجود توکن، کاربر تشخیص داده می‌شود؛ در غیر این صورت هم ادامه می‌دهد
  asyncHandler(retrieveUser)
);

// ---------- پست‌های کاربر ----------
// GET /api/users/:username/posts?offset=0&limit=12
userRouter.get(
  '/:username/posts',
  asyncHandler(retrievePosts) // دیگر نیازی به :offset در مسیر نیست
);

// ---------- دنبال‌کننده‌ها و دنبال‌شونده‌ها ----------
// GET /api/users/:userId/following?offset=0
userRouter.get(
  '/:userId/following',
  requireAuth,
  validateObjectId('userId'),
  asyncHandler(retrieveFollowing)
);

// GET /api/users/:userId/followers?offset=0
userRouter.get(
  '/:userId/followers',
  requireAuth,
  validateObjectId('userId'),
  asyncHandler(retrieveFollowers)
);

// ---------- جستجوی کاربران ----------
// GET /api/users/search?username=something&offset=0
userRouter.get(
  '/search',
  asyncHandler(searchUsers) // جستجو با پارامترهای query
);

// ---------- کاربران پیشنهادی ----------
// GET /api/users/suggested?max=20
userRouter.get(
  '/suggested',
  requireAuth,
  asyncHandler(retrieveSuggestedUsers) // پارامتر max از query گرفته می‌شود
);

// ---------- عملیات بوکمارک ----------
// POST /api/users/:postId/bookmark
userRouter.post(
  '/:postId/bookmark',
  requireAuth,
  validateObjectId('postId'),
  asyncHandler(bookmarkPost)
);

// ---------- دنبال/لغو دنبال کاربر ----------
// POST /api/users/:userId/follow
userRouter.post(
  '/:userId/follow',
  requireAuth,
  validateObjectId('userId'),
  asyncHandler(followUser)
);

// ---------- تأیید ایمیل ----------
// PUT /api/users/confirm
userRouter.put(
  '/confirm',
  requireAuth,
  asyncHandler(confirmUser)
);

// ---------- مدیریت آواتار ----------
// PUT /api/users/avatar
userRouter.put(
  '/avatar',
  requireAuth,
  (req, res, next) => {
    // میدلور multer با مدیریت خطای اختصاصی
    avatarUpload(req, res, function (err) {
      if (err instanceof multer.MulterError) {
        // خطای مربوط به خود multer (مثلاً حجم فایل)
        return res.status(400).json({
          success: false,
          error: err.message,
        });
      } else if (err) {
        // سایر خطاها (مثلاً فرمت فایل)
        return res.status(400).json({
          success: false,
          error: err.message,
        });
      }
      next();
    });
  },
  asyncHandler(changeAvatar)
);

// DELETE /api/users/avatar
userRouter.delete(
  '/avatar',
  requireAuth,
  asyncHandler(removeAvatar)
);

// ---------- به‌روزرسانی پروفایل ----------
// PUT /api/users/
userRouter.put(
  '/',
  requireAuth,
  asyncHandler(updateProfile)
);

// ============================================================
// بخش ۷: صادرات Router
// ============================================================
module.exports = userRouter;
