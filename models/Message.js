// مسیر فایل: /models/Message.js
// توضیح: مدل پیام در یک مکالمه.

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const MessageSchema = new Schema(
  {
    conversation: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    receiver: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    messageType: {
      type: String,
      enum: ['text', 'image', 'video', 'audio', 'file', 'story_reply', 'post_share'],
      default: 'text',
    },
    text: {
      type: String,
      default: '',
      maxlength: 2000,
    },
    mediaUrl: {
      type: String,
      default: '',
    },
    thumbnailUrl: {
      type: String,
      default: '',
    },
    replyTo: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// ایندکس برای دریافت سریع پیام‌های یک مکالمه
MessageSchema.index({ conversation: 1, createdAt: -1 });
// ایندکس برای پیام‌های خوانده‌نشده
MessageSchema.index({ receiver: 1, isRead: 1 });

MessageSchema.set('toJSON', {
  transform: function (doc, ret) {
    ret.id = ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Message', MessageSchema);
