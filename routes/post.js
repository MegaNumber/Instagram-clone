// مسیر فایل: /routes/post.js
// توضیح: تعریف مسیرهای مربوط به پست‌ها. این فایل endpointهای ایجاد، دریافت، رأی‌دهی،
// حذف، فید، پست‌های پیشنهادی و جستجوی هشتگ را مدیریت می‌کند. شامل میدلورهای
// احراز هویت، محدودیت نرخ، آپلود تصویر با Multer و اعتبارسنجی شناسه‌ها است.

// ============================================================
// بخش ۱: ایمپورت وابستگی‌های اصلی
// ============================================================
const express = require('express');
const postRouter = express.Router();
const multer = require('multer');
const path = require('path');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

// ============================================================
// بخش ۲: ایمپورت میدلورها و کنترلرها
// ============================================================
const { requireAuth } = require('../controllers/authController');
const asyncHandler = require('../utils/asyncHandler');
const {
  createPost,
  retrievePost,
  votePost,
  deletePost,
  retrievePostFeed,
  retrieveSuggestedPosts,
  retrieveHashtagPosts,
} = require('../controllers/postController');
const filters = require('../utils/filters');

// ============================================================
// بخش ۳: ثابت‌های پیکربندی
// ============================================================
const MAX_FILE_SIZE = 10 * 1024 * 1024; // ۱۰ مگابایت
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

// ============================================================
// بخش ۴: تنظیمات ذخیره‌سازی Multer (Disk Storage)
// ============================================================
const storage = multer.diskStorage({
  // مقصد ذخیره‌سازی فایل‌ها
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/');
  },
  // نام‌گذاری یکتا برای هر فایل
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'post-' + uniqueSuffix + path.extname(file.originalname));
  },
});

// ============================================================
// بخش ۵: میدلور آپلود (Multer Middleware)
// ============================================================
const upload = multer({
  storage: storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: function (req, file, cb) {
    // فقط تصاویر با فرمت‌های مجاز پذیرفته شوند
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('فقط فایل‌های تصویری JPEG، PNG، WebP و GIF مجاز هستند.'), false);
    }
  },
}).single('image'); // فیلد تصویر در درخواست 'image' نام دارد

// ============================================================
// بخش ۶: محدودسازی نرخ (Rate Limiter) برای ایجاد پست
// ============================================================
const postCreationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // ۱۵ دقیقه
  max: 5, // حداکثر ۵ پست
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'تعداد پست‌های ایجادشده بیش از حد مجاز است. لطفاً ۱۵ دقیقه صبر کنید.',
  },
});

// ============================================================
// بخش ۷: میدلور اعتبارسنجی ObjectId
// ============================================================
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
// بخش ۸: تعریف مسیرهای پست‌ها
// ============================================================

// ---------- ایجاد پست جدید ----------
// POST /api/posts
postRouter.post(
  '/',
  postCreationLimiter,
  requireAuth,
  (req, res, next) => {
    // مدیریت خطای Multer به صورت دستی
    upload(req, res, function (err) {
      if (err instanceof multer.MulterError) {
        // خطای مربوط به خود Multer (مثلاً اندازه فایل)
        return res.status(400).json({
          success: false,
          error: err.message,
        });
      } else if (err) {
        // خطای سفارشی (مانند نوع فایل نامعتبر)
        return res.status(400).json({
          success: false,
          error: err.message,
        });
      }
      next();
    });
  },
  asyncHandler(createPost)
);

// ---------- رأی‌دهی به یک پست (لایک/دیسلایک) ----------
// POST /api/posts/:postId/vote
postRouter.post(
  '/:postId/vote',
  requireAuth,
  validateObjectId('postId'),
  asyncHandler(votePost)
);

// ---------- دریافت پست‌های پیشنهادی (اکسپلور) ----------
// GET /api/posts/suggested?offset=0
postRouter.get(
  '/suggested',
  requireAuth,
  asyncHandler(retrieveSuggestedPosts)
);

// ---------- دریافت لیست فیلترهای تصویر ----------
// GET /api/posts/filters
postRouter.get('/filters', (req, res) => {
  res.status(200).json({ success: true, data: filters });
});

// ---------- دریافت یک پست خاص ----------
// GET /api/posts/:postId
postRouter.get(
  '/:postId',
  validateObjectId('postId'),
  asyncHandler(retrievePost)
);

// ---------- دریافت فید پست‌ها (صفحه اصلی) ----------
// GET /api/posts/feed?offset=0
postRouter.get(
  '/feed',
  requireAuth,
  asyncHandler(retrievePostFeed)
);

// ---------- جستجوی پست‌ها بر اساس هشتگ ----------
// GET /api/posts/hashtag/:hashtag?offset=0
postRouter.get(
  '/hashtag/:hashtag',
  asyncHandler(retrieveHashtagPosts)
);

// ---------- حذف یک پست ----------
// DELETE /api/posts/:postId
postRouter.delete(
  '/:postId',
  requireAuth,
  validateObjectId('postId'),
  asyncHandler(deletePost)
);

// ============================================================
// بخش ۹: صادرات Router
// ============================================================
module.exports = postRouter;
