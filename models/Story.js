// مسیر فایل: /models/Story.js
const mongoose = require('mongoose');

const StorySchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  mediaUrl: { type: String, required: true },
  thumbnailUrl: { type: String, default: '' },
  mediaType: { type: String, enum: ['image', 'video'], default: 'image' },
  caption: { type: String, maxlength: 500, default: '' },
  viewers: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    viewedAt: { type: Date, default: Date.now }
  }],
  likes: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    likedAt: { type: Date, default: Date.now }
  }],
  expiresAt: { type: Date, default: () => new Date(Date.now() + 24*60*60*1000), index: { expireAfterSeconds: 0 } }
}, { timestamps: true, versionKey: false });

module.exports = mongoose.model('Story', StorySchema);
