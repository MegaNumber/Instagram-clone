// مسیر فایل: /routes/notification.js
// توضیح: تعریف مسیرهای مربوط به نوتیفیکیشن‌ها. این فایل endpointهای دریافت
// لیست نوتیفیکیشن‌ها و علامت‌گذاری همه به عنوان خوانده‌شده را مدیریت می‌کند
// و از میدلورهای احراز هویت و asyncHandler برای مدیریت خطا استفاده می‌کند.

// ============================================================
// بخش ۱: ایمپورت وابستگی‌های اصلی
// ============================================================
const express = require('express');
const notificationRouter = express.Router();

// ============================================================
// بخش ۲: ایمپورت میدلورها و کنترلرها
// ============================================================
const { requireAuth } = require('../controllers/authController');
const asyncHandler = require('../utils/asyncHandler');
const {
  retrieveNotifications,
  readNotifications,
} = require('../controllers/notificationController');

// ============================================================
// بخش ۳: تعریف مسیرهای نوتیفیکیشن
// ============================================================

// دریافت نوتیفیکیشن‌های کاربر (با صفحه‌بندی از طریق query string)
// GET /api/notifications?offset=0&limit=20
notificationRouter.get(
  '/',
  requireAuth,
  asyncHandler(retrieveNotifications)
);

// علامت‌گذاری تمام نوتیفیکیشن‌ها به عنوان خوانده‌شده
// PUT /api/notifications
notificationRouter.put(
  '/',
  requireAuth,
  asyncHandler(readNotifications)
);

// ============================================================
// بخش ۴: صادرات Router
// ============================================================
module.exports = notificationRouter;
