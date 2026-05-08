// مسیر فایل: /models/Reel.js
const mongoose = require('mongoose');

const ReelSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  videoUrl: { type: String, required: true },
  thumbnailUrl: { type: String, default: '' },
  caption: { type: String, maxlength: 2200, default: '' },
  hashtags: [{ type: String, lowercase: true }],
  duration: { type: Number, default: 0 },
  views: { type: Number, default: 0 },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  comments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }],
  audioTitle: { type: String, default: '' },
  audioArtist: { type: String, default: '' },
}, { timestamps: true, versionKey: false, toJSON: { virtuals: true } });

ReelSchema.virtual('likeCount').get(function() { return this.likes.length; });
ReelSchema.virtual('commentCount').get(function() { return this.comments.length; });

module.exports = mongoose.model('Reel', ReelSchema);
