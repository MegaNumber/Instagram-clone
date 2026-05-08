// مسیر فایل: /models/Message.js
const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  messageType: { type: String, enum: ['text', 'image', 'video', 'audio', 'file'], default: 'text' },
  text: { type: String, default: '' },
  mediaUrl: { type: String, default: '' },
  thumbnailUrl: { type: String, default: '' },
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
  isRead: { type: Boolean, default: false },
  readAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

MessageSchema.index({ conversation: 1, createdAt: -1 });
MessageSchema.index({ receiver: 1, isRead: 1 });

module.exports = mongoose.model('Message', MessageSchema);
