// مسیر فایل: /routes/post.js
// توضیح: تعریف مسیرهای مربوط به پست‌ها. این فایل endpointهای ایجاد، دریافت، رأی‌دهی،
// حذف، فید، پست‌های پیشنهادی و جستجوی هشتگ را مدیریت می‌کند.
//
// [v2.0.0] اصلاحیه مهم:
// - جایگزینی Multer با `uploadPostImage` از `utils/fileUpload.js` برای استفاده از `memoryStorage`
//   (رفع ناسازگاری با `sharp` در کنترلر `createPost` که به `req.file.buffer` نیاز داشت)
// - بازچینی مسیرها برای جلوگیری از تداخل مسیرهای ثابت (feed, suggested, filters) با `:postId`

// ============================================================
// بخش ۱: ایمپورت وابستگی‌های اصلی (نسخه‌ها در package.json)
// ============================================================
const express = require('express');               // express@4.x
const postRouter = express.Router();
const rateLimit = require('express-rate-limit');   // express-rate-limit@7.x
const mongoose = require('mongoose');              // mongoose@8.x

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
const { uploadPostImage } = require('../utils/fileUpload'); // [v2.0.0] جایگزین پیکربندی Multer

// ============================================================
// بخش ۳: محدودسازی نرخ (Rate Limiter) برای ایجاد پست
// ============================================================
const postCreationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // ۱۵ دقیقه
  max: 5,                  // حداکثر ۵ پست در بازه
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'تعداد پست‌های ایجادشده بیش از حد مجاز است. لطفاً ۱۵ دقیقه صبر کنید.',
  },
});

// ============================================================
// بخش ۴: میدلور اعتبارسنجی ObjectId
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
// بخش ۵: تعریف مسیرهای پست‌ها (توجه به ترتیب برای جلوگیری از تداخل)
// ============================================================

// ---------- دریافت لیست فیلترهای تصویر ----------
// GET /api/posts/filters
// [v2.0.0] مسیر ثابت پیش از مسیرهای پارامتری
postRouter.get('/filters', (req, res) => {
  res.status(200).json({ success: true, data: filters });
});

// ---------- دریافت فید پست‌ها (صفحه اصلی) ----------
// GET /api/posts/feed?offset=0
// [v2.0.0] جابجایی به بالای مسیر :postId برای جلوگیری از تفسیر "feed" به عنوان شناسه
postRouter.get('/feed', requireAuth, asyncHandler(retrievePostFeed));

// ---------- دریافت پست‌های پیشنهادی (اکسپلور) ----------
// GET /api/posts/suggested?offset=0
// [v2.0.0] مسیر ثابت پیش از مسیر :postId
postRouter.get('/suggested', requireAuth, asyncHandler(retrieveSuggestedPosts));

// ---------- جستجوی پست‌ها بر اساس هشتگ ----------
// GET /api/posts/hashtag/:hashtag?offset=0
postRouter.get('/hashtag/:hashtag', asyncHandler(retrieveHashtagPosts));

// ---------- دریافت یک پست خاص ----------
// GET /api/posts/:postId
postRouter.get('/:postId', validateObjectId('postId'), asyncHandler(retrievePost));

// ---------- رأی‌دهی به یک پست (لایک/دیسلایک) ----------
// POST /api/posts/:postId/vote
postRouter.post(
  '/:postId/vote',
  requireAuth,
  validateObjectId('postId'),
  asyncHandler(votePost)
);

// ---------- ایجاد پست جدید ----------
// POST /api/posts
// [v2.0.0] استفاده از uploadPostImage (memoryStorage) برای سازگاری با sharp در کنترلر
postRouter.post(
  '/',
  postCreationLimiter,
  requireAuth,
  (req, res, next) => {
    // مدیریت خطای آپلود با uploadPostImage (میدلور یکپارچه Multer)
    uploadPostImage(req, res, function (err) {
      if (err) {
        // خطاهای مربوط به Multer (اندازه، فرمت و...)
        return res.status(400).json({
          success: false,
          error: err.message,
        });
      }
      // در صورت موفقیت، req.file حاوی buffer تصویر خواهد بود
      next();
    });
  },
  asyncHandler(createPost)
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
// بخش ۶: صادرات Router
// ============================================================
module.exports = postRouter;
