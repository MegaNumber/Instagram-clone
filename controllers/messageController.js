// مسیر فایل: /controllers/messageController.js
// توضیح: کنترلر پیام‌رسانی مستقیم (Direct Messages). مدیریت مکالمات
// (ایجاد، دریافت)، پیام‌ها (متن، رسانه)، علامت‌گذاری خوانده‌شده، و
// حذف مکالمه را بر عهده دارد. از متدهای استاتیک جدید مدل‌ها و سرویس
// ذخیره‌سازی یکپارچه استفاده می‌کند و پیام‌ها را بلادرنگ از طریق
// Socket.io ارسال می‌کند.
//
// @version 2.5.0
// @since 2026

const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const asyncHandler = require('../utils/asyncHandler');
const { saveUploadedFile } = require('../utils/fileUpload');

// ============================================================
// بخش ۱: دریافت لیست مکالمات کاربر
// ============================================================
module.exports.getConversations = asyncHandler(async (req, res) => {
  const user = res.locals.user;

  const conversations = await Conversation.find({ participants: user._id })
    .populate('participants', 'username avatar fullName')
    .sort({ lastMessageAt: -1 })
    .lean();

  res.status(200).json({ success: true, data: conversations });
});

// ============================================================
// بخش ۲: ایجاد یا دریافت مکالمه خصوصی
// ============================================================
module.exports.createOrGetConversation = asyncHandler(async (req, res) => {
  const currentUser = res.locals.user;
  const { participantId } = req.body;

  if (!participantId) {
    return res.status(400).json({ success: false, error: 'شناسه کاربر مقابل الزامی است.' });
  }
  if (currentUser._id.toString() === participantId) {
    return res.status(400).json({ success: false, error: 'نمی‌توانید با خودتان گفتگو کنید.' });
  }

  const conversation = await Conversation.findOrCreatePrivate(currentUser._id, participantId);

  res.status(200).json({
    success: true,
    data: conversation,
    isNew: conversation.isActive ? false : true, // اگر lastMessage نداشته باشد، تازه ایجاد شده
  });
});

// ============================================================
// بخش ۳: دریافت پیام‌های یک مکالمه
// ============================================================
module.exports.getMessages = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const user = res.locals.user;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 30, 50);

  // بررسی عضویت کاربر در مکالمه
  const conv = await Conversation.findOne({ _id: conversationId, participants: user._id }).select('_id');
  if (!conv) {
    return res.status(403).json({ success: false, error: 'شما عضو این گفتگو نیستید.' });
  }

  // استفاده از متد استاتیک مدل Message برای صفحه‌بندی
  const { messages, total } = await Message.findByConversation(conversationId, { page, limit });

  // علامت‌گذاری پیام‌های خوانده‌نشده به عنوان خوانده‌شده
  await Message.markAsRead(conversationId, user._id);

  // به‌روزرسانی unreadCount در مکالمه (صفر کردن برای این کاربر)
  conv.unreadCount.set(user._id.toString(), 0);
  await conv.save();

  res.status(200).json({
    success: true,
    data: messages,
    pagination: { page, limit, total, hasMore: page * limit < total },
  });
});

// ============================================================
// بخش ۴: ارسال پیام متنی
// ============================================================
module.exports.sendTextMessage = asyncHandler(async (req, res) => {
  const user = res.locals.user;
  const { conversationId, text } = req.body;

  if (!text?.trim()) {
    return res.status(400).json({ success: false, error: 'متن پیام نمی‌تواند خالی باشد.' });
  }

  const conv = await Conversation.findOne({ _id: conversationId, participants: user._id });
  if (!conv) {
    return res.status(403).json({ success: false, error: 'شما عضو این گفتگو نیستید.' });
  }

  // یافتن گیرنده
  const receiverId = conv.participants.find(p => p.toString() !== user._id.toString());
  if (!receiverId) {
    return res.status(400).json({ success: false, error: 'گیرنده معتبر نیست.' });
  }

  const message = await Message.create({
    conversation: conversationId,
    sender: user._id,
    receiver: receiverId,
    text: text.trim(),
    messageType: 'text',
  });

  await message.populate('sender', 'username avatar');

  // به‌روزرسانی مکالمه
  conv.lastMessage = message._id;
  conv.lastMessageText = text.trim().substring(0, 50);
  conv.lastMessageAt = new Date();
  const currentUnread = conv.unreadCount.get(receiverId.toString()) || 0;
  conv.unreadCount.set(receiverId.toString(), currentUnread + 1);
  await conv.save();

  // ارسال زنده از طریق Socket.io
  const io = req.app.get('socketio');
  if (io) {
    io.to(receiverId.toString()).emit('newMessage', message);
  }

  res.status(201).json({ success: true, data: message });
});

// ============================================================
// بخش ۵: ارسال پیام رسانه‌ای (تصویر، ویدئو، فایل)
// ============================================================
module.exports.sendMediaMessage = asyncHandler(async (req, res) => {
  const user = res.locals.user;
  const { conversationId } = req.body;

  if (!req.file) {
    return res.status(400).json({ success: false, error: 'فایلی انتخاب نشده است.' });
  }

  const conv = await Conversation.findOne({ _id: conversationId, participants: user._id });
  if (!conv) {
    return res.status(403).json({ success: false, error: 'شما عضو این گفتگو نیستید.' });
  }

  const receiverId = conv.participants.find(p => p.toString() !== user._id.toString());
  if (!receiverId) {
    return res.status(400).json({ success: false, error: 'گیرنده معتبر نیست.' });
  }

  // ذخیره فایل با سرویس یکپارچه
  const mediaUrl = await saveUploadedFile(req.file, 'uploads/chat', 'chat');

  // تعیین نوع پیام بر اساس MIME type
  let messageType = 'file';
  if (req.file.mimetype.startsWith('image/')) messageType = 'image';
  else if (req.file.mimetype.startsWith('video/')) messageType = 'video';
  else if (req.file.mimetype.startsWith('audio/')) messageType = 'audio';

  const message = await Message.create({
    conversation: conversationId,
    sender: user._id,
    receiver: receiverId,
    messageType,
    mediaUrl,
  });

  await message.populate('sender', 'username avatar');

  // به‌روزرسانی مکالمه
  conv.lastMessage = message._id;
  conv.lastMessageText = '📎 فایل';
  conv.lastMessageAt = new Date();
  const currentUnread = conv.unreadCount.get(receiverId.toString()) || 0;
  conv.unreadCount.set(receiverId.toString(), currentUnread + 1);
  await conv.save();

  // ارسال زنده
  const io = req.app.get('socketio');
  if (io) {
    io.to(receiverId.toString()).emit('newMessage', message);
  }

  res.status(201).json({ success: true, data: message });
});

// ============================================================
// بخش ۶: حذف مکالمه (و تمام پیام‌های آن)
// ============================================================
module.exports.deleteConversation = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const user = res.locals.user;

  const conv = await Conversation.findOneAndDelete({ _id: conversationId, participants: user._id });
  if (!conv) {
    return res.status(404).json({ success: false, error: 'گفتگو یافت نشد.' });
  }

  // حذف همه پیام‌های این مکالمه
  await Message.deleteMany({ conversation: conversationId });

  res.status(200).json({ success: true, message: 'گفتگو با موفقیت حذف شد.' });
});

module.exports = exports;
