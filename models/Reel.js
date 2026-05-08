// مسیر فایل: /models/Reel.js
// توضیح: مدل Mongoose برای Reel (ویدیوهای کوتاه).

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ReelSchema = new Schema(
  {
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    videoUrl: {
      type: String,
      required: true,
    },
    thumbnailUrl: {
      type: String,
      default: '',
    },
    caption: {
      type: String,
      maxlength: 2200,
      default: '',
    },
    hashtags: [
      {
        type: String,
        lowercase: true,
      },
    ],
    duration: {
      type: Number,
      default: 0,
    },
    views: {
      type: Number,
      default: 0,
    },
    likes: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    comments: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Comment',
      },
    ],
    audioTitle: {
      type: String,
      default: '',
    },
    audioArtist: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

ReelSchema.index({ author: 1, createdAt: -1 });
ReelSchema.index({ hashtags: 1, createdAt: -1 });

ReelSchema.virtual('likeCount').get(function () {
  return this.likes ? this.likes.length : 0;
});

ReelSchema.virtual('commentCount').get(function () {
  return this.comments ? this.comments.length : 0;
});

ReelSchema.set('toJSON', {
  transform: function (doc, ret) {
    ret.id = ret._id;
    delete ret.__v;
    ret.likeCount = ret.likes ? ret.likes.length : 0;
    ret.commentCount = ret.comments ? ret.comments.length : 0;
    return ret;
  },
});

module.exports = mongoose.model('Reel', ReelSchema);
