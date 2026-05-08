// مسیر فایل: /models/Conversation.js
// توضیح: مدل مکالمه (گفتگو) بین دو کاربر.

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ConversationSchema = new Schema(
  {
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    lastMessage: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    lastMessageText: {
      type: String,
      default: '',
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
    unreadCount: {
      type: Map,
      of: Number,
      default: {},
    },
    isGroup: {
      type: Boolean,
      default: false,
    },
    groupName: {
      type: String,
      default: '',
    },
    groupAvatar: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ lastMessageAt: -1 });

// اعتبارسنجی: حداقل ۲ شرکت‌کننده
ConversationSchema.pre('save', function (next) {
  if (this.participants.length < 2) {
    return next(new Error('یک مکالمه باید حداقل ۲ شرکت‌کننده داشته باشد.'));
  }
  next();
});

ConversationSchema.set('toJSON', {
  transform: function (doc, ret) {
    ret.id = ret._id;
    delete ret.__v;
    return ret;
  },
});

const Conversation = mongoose.model('Conversation', ConversationSchema);
module.exports = Conversation;
