// مسیر فایل: /routes/message.js
// توضیح: تعریف مسیرهای مربوط به پیام‌های مستقیم و مکالمات.
// شامل لیست مکالمات، ایجاد/بازیابی مکالمه، دریافت پیام‌ها،
// ارسال پیام متنی و رسانه‌ای و حذف مکالمه.
//
// [v2.0.0] اصلاحیه:
// - افزودن validateObjectId برای مسیرهای دارای :conversationId

// ============================================================
// بخش ۱: ایمپورت وابستگی‌ها
// ============================================================
const router = require('express').Router();
const mongoose = require('mongoose');                       // mongoose@7.x
const { requireAuth } = require('../controllers/authController');
const asyncHandler = require('../utils/asyncHandler');
const { uploadChatFile } = require('../utils/fileUpload');
const ctrl = require('../controllers/messageController');

// ============================================================
// بخش ۲: میدلور اعتبارسنجی شناسه‌های مونگو
// ============================================================
/**
 * @middleware validateObjectId
 * @description بررسی معتبر بودن شناسهٔ MongoDB. در صورت نامعتبر بودن،
 * پاسخ ۴۰۰ با پیام خطای فارسی برگردانده می‌شود.
 * @param {string} paramName - نام پارامتر (مثلاً conversationId)
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

// دریافت لیست مکالمات کاربر
// GET /api/messages/conversations
router.get('/conversations', requireAuth, asyncHandler(ctrl.getConversations));

// ایجاد یا بازیابی یک مکالمه با کاربر دیگر
// POST /api/messages/conversations
router.post('/conversations', requireAuth, asyncHandler(ctrl.createOrGetConversation));

// دریافت پیام‌های یک مکالمه خاص
// GET /api/messages/conversations/:conversationId
router.get(
  '/conversations/:conversationId',
  requireAuth,
  validateObjectId('conversationId'),       // [v2.0.0] افزوده شد
  asyncHandler(ctrl.getMessages)
);

// ارسال پیام متنی در یک مکالمه
// POST /api/messages/send-text
router.post('/send-text', requireAuth, asyncHandler(ctrl.sendTextMessage));

// ارسال پیام رسانه‌ای (فایل) در یک مکالمه
// POST /api/messages/send-media
router.post('/send-media', requireAuth, uploadChatFile, asyncHandler(ctrl.sendMediaMessage));

// حذف یک مکالمه
// DELETE /api/messages/conversations/:conversationId
router.delete(
  '/conversations/:conversationId',
  requireAuth,
  validateObjectId('conversationId'),
  asyncHandler(ctrl.deleteConversation)
);

module.exports = router;
