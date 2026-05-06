const express = require('express');
const postRouter = express.Router();
const multer = require('multer');
// 1. وارد کردن ماژول path برای مدیریت پسوند فایل‌ها
const path = require('path');
const rateLimit = require('express-rate-limit');

const { requireAuth } = require('../controllers/authController');
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

// 2. تنظیمات ذخیره‌سازی سفارشی مالتر برای ذخیره روی دیسک خودمان
const storage = multer.diskStorage({
  // مقصد ذخیره‌سازی فایل‌ها: پوشه public/uploads
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/');
  },
  // نام‌گذاری فایل: یک نام یکتا با پسوند اصلی فایل
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'post-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// 3. نمونه جدید مالتر با تنظیمات ذخیره‌سازی محلی
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // محدودیت ۱۰ مگابایت
}).single('image'); // نام فیلد تصویر در درخواست همان 'image' است

const postLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
});

// --- مسیرهای اصلی بدون تغییر باقی می‌مانند ---
postRouter.post('/', postLimiter, requireAuth, upload, createPost);
postRouter.post('/:postId/vote', requireAuth, votePost);

postRouter.get('/suggested/:offset', requireAuth, retrieveSuggestedPosts);
postRouter.get('/filters', (req, res) => {
  res.send({ filters });
});
postRouter.get('/:postId', retrievePost);
postRouter.get('/feed/:offset', requireAuth, retrievePostFeed);
postRouter.get('/hashtag/:hashtag/:offset', requireAuth, retrieveHashtagPosts);

postRouter.delete('/:postId', requireAuth, deletePost);

module.exports = postRouter;
