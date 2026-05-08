// مسیر فایل: /models/Conversation.js
const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
  lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
  lastMessageText: { type: String, default: '' },
  lastMessageAt: { type: Date, default: Date.now },
  unreadCount: { type: Map, of: Number, default: {} },
  isGroup: { type: Boolean, default: false },
  groupName: { type: String, default: '' },
  groupAvatar: { type: String, default: '' },
}, { timestamps: true, versionKey: false });

ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ lastMessageAt: -1 });

module.exports = mongoose.model('Conversation', ConversationSchema);
