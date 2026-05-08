// مسیر فایل: /controllers/messageController.js
// توضیح: کنترلر پیام‌رسانی مستقیم. مدیریت ایجاد/دریافت مکالمه،
// ارسال پیام، آپلود فایل در چت و نشان‌گذاری پیام‌های خوانده‌شده.

const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const asyncHandler = require('../utils/asyncHandler');

// ============================================================
// بخش ۱: دریافت لیست مکالمات کاربر
// ============================================================
module.exports.getConversations = asyncHandler(async (req, res) => {
  const user = res.locals.user;

  const conversations = await Conversation.find({
    participants: user._id,
  })
    .populate('participants', 'username avatar fullName')
    .populate('lastMessage')
    .sort({ lastMessageAt: -1 })
    .lean();

  res.status(200).json({
    success: true,
    data: conversations,
  });
});

// ============================================================
// بخش ۲: ایجاد یا دریافت مکالمه با کاربر دیگر
// ============================================================
module.exports.createOrGetConversation = asyncHandler(async (req, res) => {
  const currentUser = res.locals.user;
  const { participantId } = req.body;

  if (!participantId) {
    return res.status(400).json({
      success: false,
      error: 'شناسه کاربر مقابل الزامی است.',
    });
  }

  // اگر با خودش می‌خواهد چت کند
  if (currentUser._id.toString() === participantId) {
    return res.status(400).json({
      success: false,
      error: 'نمی‌توانید با خودتان مکالمه ایجاد کنید.',
    });
  }

  // بررسی وجود مکالمه قبلی
  let conversation = await Conversation.findOne({
    participants: { $all: [currentUser._id, participantId] },
    isGroup: false,
  }).populate('participants', 'username avatar fullName');

  if (conversation) {
    return res.status(200).json({
      success: true,
      data: conversation,
      isNew: false,
    });
  }

  // ایجاد مکالمه جدید
  conversation = await Conversation.create({
    participants: [currentUser._id, participantId],
  });
  await conversation.populate('participants', 'username avatar fullName');

  res.status(201).json({
    success: true,
    data: conversation,
    isNew: true,
  });
});

// ============================================================
// بخش ۳: دریافت پیام‌های یک مکالمه
// ============================================================
module.exports.getMessages = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const user = res.locals.user;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 30;
  const skip = (page - 1) * limit;

  // بررسی عضویت در مکالمه
  const conversation = await Conversation.findOne({
    _id: conversationId,
    participants: user._id,
  });

  if (!conversation) {
    return res.status(403).json({
      success: false,
      error: 'شما عضو این مکالمه نیستید.',
    });
  }

  const messages = await Message.find({ conversation: conversationId })
    .populate('sender', 'username avatar')
    .populate('replyTo')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await Message.countDocuments({ conversation: conversationId });

  // علامت‌گذاری پیام‌ها به عنوان خوانده‌شده
  await Message.updateMany(
    { conversation: conversationId, receiver: user._id, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );

  res.status(200).json({
    success: true,
    data: messages.reverse(),
    pagination: {
      page,
      limit,
      total,
      hasMore: skip + limit < total,
    },
  });
});

// ============================================================
// بخش ۴: ارسال پیام متنی
// ============================================================
module.exports.sendTextMessage = asyncHandler(async (req, res) => {
  const user = res.locals.user;
  const { conversationId, text } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({
      success: false,
      error: 'متن پیام نمی‌تواند خالی باشد.',
    });
  }

  const conversation = await Conversation.findOne({
    _id: conversationId,
    participants: user._id,
  });

  if (!conversation) {
    return res.status(403).json({
      success: false,
      error: 'شما عضو این مکالمه نیستید.',
    });
  }

  // یافتن گیرنده
  const receiver = conversation.participants.find(
    (p) => p.toString() !== user._id.toString()
  );

  const message = await Message.create({
    conversation: conversationId,
    sender: user._id,
    receiver,
    text: text.trim(),
    messageType: 'text',
  });

  await message.populate('sender', 'username avatar');

  // به‌روزرسانی آخرین پیام مکالمه
  conversation.lastMessage = message._id;
  conversation.lastMessageText = text.trim().substring(0, 50);
  conversation.lastMessageAt = new Date();
  const currentUnread = conversation.unreadCount?.get(receiver?.toString()) || 0;
  conversation.unreadCount.set(receiver?.toString(), currentUnread + 1);
  await conversation.save();

  // ارسال از طریق Socket.io
  const io = req.app.get('socketio');
  if (io) {
    io.to(receiver.toString()).emit('newMessage', message);
  }

  res.status(201).json({
    success: true,
    data: message,
  });
});

// ============================================================
// بخش ۵: آپلود تصویر/فایل در چت
// ============================================================
module.exports.sendMediaMessage = asyncHandler(async (req, res) => {
  const user = res.locals.user;
  const { conversationId } = req.body;

  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'لطفاً یک فایل انتخاب کنید.',
    });
  }

  const conversation = await Conversation.findOne({
    _id: conversationId,
    participants: user._id,
  });

  if (!conversation) {
    return res.status(403).json({
      success: false,
      error: 'شما عضو این مکالمه نیستید.',
    });
  }

  const receiver = conversation.participants.find(
    (p) => p.toString() !== user._id.toString()
  );

  const mediaUrl = '/uploads/chat/' + req.file.filename;

  const message = await Message.create({
    conversation: conversationId,
    sender: user._id,
    receiver,
    messageType: req.file.mimetype.startsWith('image/') ? 'image' : 'file',
    mediaUrl,
  });

  await message.populate('sender', 'username avatar');

  conversation.lastMessage = message._id;
  conversation.lastMessageText = '📎 فایل';
  conversation.lastMessageAt = new Date();
  const currentUnread = conversation.unreadCount?.get(receiver?.toString()) || 0;
  conversation.unreadCount.set(receiver?.toString(), currentUnread + 1);
  await conversation.save();

  const io = req.app.get('socketio');
  if (io) {
    io.to(receiver.toString()).emit('newMessage', message);
  }

  res.status(201).json({
    success: true,
    data: message,
  });
});

// ============================================================
// بخش ۶: حذف مکالمه
// ============================================================
module.exports.deleteConversation = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const user = res.locals.user;

  const conversation = await Conversation.findOne({
    _id: conversationId,
    participants: user._id,
  });

  if (!conversation) {
    return res.status(404).json({
      success: false,
      error: 'مکالمه یافت نشد.',
    });
  }

  await Message.deleteMany({ conversation: conversationId });
  await Conversation.deleteOne({ _id: conversationId });

  res.status(200).json({
    success: true,
    message: 'مکالمه با موفقیت حذف شد.',
  });
});

module.exports = exports;
