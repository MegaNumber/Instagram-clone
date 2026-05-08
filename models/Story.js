// مسیر فایل: /models/Story.js
// توضیح: مدل Mongoose برای استوری‌ها. هر استوری پس از ۲۴ ساعت
// به صورت خودکار توسط TTL Index از دیتابیس حذف می‌شود.
// همچنین اطلاعات بازدیدکنندگان در خود سند ذخیره می‌شود.

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// ============================================================
// بخش ۱: ثابت‌های پیکربندی
// ============================================================
const STORY_EXPIRY_SECONDS = 24 * 60 * 60; // ۲۴ ساعت

// ============================================================
// بخش ۲: طرحواره Story
// ============================================================
const StorySchema = new Schema(
  {
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    mediaUrl: {
      type: String,
      required: true,
    },
    thumbnailUrl: {
      type: String,
      default: '',
    },
    mediaType: {
      type: String,
      enum: ['image', 'video'],
      default: 'image',
    },
    caption: {
      type: String,
      maxlength: 500,
      default: '',
    },
    viewers: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        viewedAt: { type: Date, default: Date.now },
      },
    ],
    likes: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        likedAt: { type: Date, default: Date.now },
      },
    ],
    // فیلدی که TTL Index روی آن تنظیم می‌شود
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + STORY_EXPIRY_SECONDS * 1000),
      index: { expireAfterSeconds: 0 },
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ============================================================
// بخش ۳: ایندکس‌ها
// ============================================================
StorySchema.index({ author: 1, createdAt: -1 });
StorySchema.index({ 'viewers.user': 1 });

// ============================================================
// بخش ۴: فیلدهای مجازی
// ============================================================
StorySchema.virtual('viewerCount').get(function () {
  return this.viewers ? this.viewers.length : 0;
});

StorySchema.virtual('likeCount').get(function () {
  return this.likes ? this.likes.length : 0;
});

// ============================================================
// بخش ۵: تبدیل خروجی JSON
// ============================================================
StorySchema.set('toJSON', {
  transform: function (doc, ret) {
    ret.id = ret._id;
    delete ret.__v;
    ret.viewerCount = ret.viewers ? ret.viewers.length : 0;
    ret.likeCount = ret.likes ? ret.likes.length : 0;
    return ret;
  },
});

const Story = mongoose.model('Story', StorySchema);
module.exports = Story;
