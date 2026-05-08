// مسیر فایل: /routes/message.js
const router = require('express').Router();
const { requireAuth } = require('../controllers/authController');
const asyncHandler = require('../utils/asyncHandler');
const { uploadChatFile } = require('../utils/fileUpload');
const ctrl = require('../controllers/messageController');

router.get('/conversations', requireAuth, asyncHandler(ctrl.getConversations));
router.post('/conversations', requireAuth, asyncHandler(ctrl.createOrGetConversation));
router.get('/conversations/:conversationId', requireAuth, asyncHandler(ctrl.getMessages));
router.post('/send-text', requireAuth, asyncHandler(ctrl.sendTextMessage));
router.post('/send-media', requireAuth, uploadChatFile, asyncHandler(ctrl.sendMediaMessage));
router.delete('/conversations/:conversationId', requireAuth, asyncHandler(ctrl.deleteConversation));

module.exports = router;
