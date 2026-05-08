// مسیر فایل: /controllers/messageController.js
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const asyncHandler = require('../utils/asyncHandler');
const { saveUploadedFile } = require('../utils/fileUpload');

module.exports.getConversations = asyncHandler(async (req, res) => {
  const user = res.locals.user;
  const conversations = await Conversation.find({ participants: user._id })
    .populate('participants', 'username avatar fullName')
    .sort({ lastMessageAt: -1 })
    .lean();
  res.status(200).json({ success: true, data: conversations });
});

module.exports.createOrGetConversation = asyncHandler(async (req, res) => {
  const currentUser = res.locals.user;
  const { participantId } = req.body;
  if (!participantId) return res.status(400).json({ success: false, error: 'شناسه کاربر مقابل الزامی است.' });
  if (currentUser._id.toString() === participantId) return res.status(400).json({ success: false, error: 'نمی‌توانید با خودتان گفتگو کنید.' });

  let conversation = await Conversation.findOne({
    participants: { $all: [currentUser._id, participantId] },
    isGroup: false,
  }).populate('participants', 'username avatar fullName');

  if (conversation) return res.status(200).json({ success: true, data: conversation, isNew: false });

  conversation = await Conversation.create({ participants: [currentUser._id, participantId] });
  await conversation.populate('participants', 'username avatar fullName');
  res.status(201).json({ success: true, data: conversation, isNew: true });
});

module.exports.getMessages = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const user = res.locals.user;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 30;
  const skip = (page - 1) * limit;

  const conv = await Conversation.findOne({ _id: conversationId, participants: user._id });
  if (!conv) return res.status(403).json({ success: false, error: 'شما عضو این گفتگو نیستید.' });

  const messages = await Message.find({ conversation: conversationId })
    .populate('sender', 'username avatar')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  await Message.updateMany(
    { conversation: conversationId, receiver: user._id, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );

  const total = await Message.countDocuments({ conversation: conversationId });
  res.status(200).json({
    success: true,
    data: messages.reverse(),
    pagination: { page, limit, total, hasMore: skip + limit < total }
  });
});

module.exports.sendTextMessage = asyncHandler(async (req, res) => {
  const user = res.locals.user;
  const { conversationId, text } = req.body;
  if (!text?.trim()) return res.status(400).json({ success: false, error: 'متن پیام خالی است.' });

  const conv = await Conversation.findOne({ _id: conversationId, participants: user._id });
  if (!conv) return res.status(403).json({ success: false, error: 'شما عضو این گفتگو نیستید.' });

  const receiver = conv.participants.find(p => p.toString() !== user._id.toString());
  const message = await Message.create({
    conversation: conversationId,
    sender: user._id,
    receiver,
    text: text.trim(),
    messageType: 'text',
  });
  await message.populate('sender', 'username avatar');

  conv.lastMessage = message._id;
  conv.lastMessageText = text.trim().substring(0, 50);
  conv.lastMessageAt = new Date();
  const unread = conv.unreadCount.get(receiver.toString()) || 0;
  conv.unreadCount.set(receiver.toString(), unread + 1);
  await conv.save();

  const io = req.app.get('socketio');
  if (io) io.to(receiver.toString()).emit('newMessage', message);
  res.status(201).json({ success: true, data: message });
});

module.exports.sendMediaMessage = asyncHandler(async (req, res) => {
  const user = res.locals.user;
  const { conversationId } = req.body;
  if (!req.file) return res.status(400).json({ success: false, error: 'فایلی انتخاب نشده است.' });

  const conv = await Conversation.findOne({ _id: conversationId, participants: user._id });
  if (!conv) return res.status(403).json({ success: false, error: 'شما عضو این گفتگو نیستید.' });

  const receiver = conv.participants.find(p => p.toString() !== user._id.toString());
  const mediaUrl = await saveUploadedFile(req.file, 'uploads/chat', 'chat');

  const message = await Message.create({
    conversation: conversationId,
    sender: user._id,
    receiver,
    messageType: req.file.mimetype.startsWith('image/') ? 'image' : 'file',
    mediaUrl,
  });
  await message.populate('sender', 'username avatar');

  conv.lastMessage = message._id;
  conv.lastMessageText = '📎 فایل';
  conv.lastMessageAt = new Date();
  const unread = conv.unreadCount.get(receiver.toString()) || 0;
  conv.unreadCount.set(receiver.toString(), unread + 1);
  await conv.save();

  const io = req.app.get('socketio');
  if (io) io.to(receiver.toString()).emit('newMessage', message);
  res.status(201).json({ success: true, data: message });
});

module.exports.deleteConversation = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const user = res.locals.user;
  const conv = await Conversation.findOneAndDelete({ _id: conversationId, participants: user._id });
  if (!conv) return res.status(404).json({ success: false, error: 'گفتگو یافت نشد.' });
  await Message.deleteMany({ conversation: conversationId });
  res.status(200).json({ success: true });
});
