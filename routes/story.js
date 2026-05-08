// مسیر فایل: /routes/story.js
// توضیح: تعریف مسیرهای مربوط به استوری‌ها.

const express = require('express');
const storyRouter = express.Router();
const multer = require('multer');
const path = require('path');
const { requireAuth } = require('../controllers/authController');
const asyncHandler = require('../utils/asyncHandler');
const {
  createStory,
  getStoryFeed,
  viewStory,
  likeStory,
  deleteStory,
  getUserStories,
} = require('../controllers/storyController');

// ============================================================
// تنظیمات Multer برای آپلود استوری
// ============================================================
const storyStorage = multer.diskStorage({
  destination: 'public/uploads/stories/',
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'story-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const storyUpload = multer({
  storage: storyStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // ۵۰ مگابایت
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('فقط تصاویر و ویدیوها مجاز هستند.'));
    }
  },
}).single('media');

// ============================================================
// مسیرها
// ============================================================
storyRouter.post('/', requireAuth, storyUpload, asyncHandler(createStory));
storyRouter.get('/feed', requireAuth, asyncHandler(getStoryFeed));
storyRouter.get('/user/:userId', requireAuth, asyncHandler(getUserStories));
storyRouter.post('/:storyId/view', requireAuth, asyncHandler(viewStory));
storyRouter.post('/:storyId/like', requireAuth, asyncHandler(likeStory));
storyRouter.delete('/:storyId', requireAuth, asyncHandler(deleteStory));

module.exports = storyRouter;
