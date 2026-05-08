// مسیر فایل: /routes/message.js
// توضیح: تعریف مسیرهای پیام‌رسانی مستقیم.

const express = require('express');
const messageRouter = express.Router();
const multer = require('multer');
const path = require('path');
const { requireAuth } = require('../controllers/authController');
const asyncHandler = require('../utils/asyncHandler');
const {
  getConversations,
  createOrGetConversation,
  getMessages,
  sendTextMessage,
  sendMediaMessage,
  deleteConversation,
} = require('../controllers/messageController');

// ============================================================
// تنظیمات Multer برای آپلود فایل در چت
// ============================================================
const chatStorage = multer.diskStorage({
  destination: 'public/uploads/chat/',
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'chat-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const chatUpload = multer({
  storage: chatStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // ۱۰ مگابایت
}).single('file');

// ============================================================
// مسیرها
// ============================================================
messageRouter.get('/conversations', requireAuth, asyncHandler(getConversations));
messageRouter.post('/conversations', requireAuth, asyncHandler(createOrGetConversation));
messageRouter.get('/conversations/:conversationId', requireAuth, asyncHandler(getMessages));
messageRouter.post('/send-text', requireAuth, asyncHandler(sendTextMessage));
messageRouter.post('/send-media', requireAuth, chatUpload, asyncHandler(sendMediaMessage));
messageRouter.delete('/conversations/:conversationId', requireAuth, asyncHandler(deleteConversation));

module.exports = messageRouter;
