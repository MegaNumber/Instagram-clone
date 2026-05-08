// مسیر فایل: /routes/reel.js
// توضیح: تعریف مسیرهای Reel.

const express = require('express');
const reelRouter = express.Router();
const multer = require('multer');
const path = require('path');
const { requireAuth } = require('../controllers/authController');
const asyncHandler = require('../utils/asyncHandler');
const {
  createReel,
  getReelFeed,
  getReel,
  likeReel,
  deleteReel,
} = require('../controllers/reelController');

// ============================================================
// تنظیمات Multer برای آپلود ویدیو
// ============================================================
const videoStorage = multer.diskStorage({
  destination: 'public/uploads/videos/',
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'reel-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const videoUpload = multer({
  storage: videoStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // ۱۰۰ مگابایت
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('فقط فایل‌های ویدیویی مجاز هستند.'));
    }
  },
}).single('video');

// ============================================================
// مسیرها
// ============================================================
reelRouter.post('/', requireAuth, videoUpload, asyncHandler(createReel));
reelRouter.get('/feed', requireAuth, asyncHandler(getReelFeed));
reelRouter.get('/:reelId', requireAuth, asyncHandler(getReel));
reelRouter.post('/:reelId/like', requireAuth, asyncHandler(likeReel));
reelRouter.delete('/:reelId', requireAuth, asyncHandler(deleteReel));

module.exports = reelRouter;
