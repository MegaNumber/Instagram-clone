// مسیر فایل: /controllers/postController.js
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const Post = require('../models/Post');
const PostVote = require('../models/PostVote');
const Followers = require('../models/Followers');
const Following = require('../models/Following');
const Notification = require('../models/Notification');
const socketHandler = require('../handlers/socketHandler');
const asyncHandler = require('../utils/asyncHandler');
const { retrieveComments, populatePostsPipeline } = require('../utils/controllerUtils');
const filters = require('../utils/filters');
const storageService = require('../utils/storage');
const { saveUploadedFile } = require('../utils/fileUpload');
// مسیر فایل: /controllers/postController.js — بخش retrievePostFeed
// (افزودن کش — فقط تکه کد مورد نیاز نمایش داده می‌شود)

const redisCache = require('../services/redisCache');

module.exports.retrievePostFeed = asyncHandler(async (req, res) => {
    const user = res.locals.user;
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const cacheKey = `feed:${user._id}:${offset}`;

    const result = await redisCache.get(cacheKey, async () => {
        // ... منطق اصلی دریافت پست‌ها (aggregation) ...
        return posts;
    }, 60); // TTL=۶۰ ثانیه

    res.status(200).json({ success: true, data: result });
});
// ... (توابع کمکی extractHashtags، generateThumbnail و غیره بدون تغییر)

module.exports.createPost = asyncHandler(async (req, res) => {
  const user = res.locals.user;
  const { caption, filter: filterName } = req.body;

  if (!req.file) return res.status(400).json({ success: false, error: 'لطفاً یک تصویر انتخاب کنید.' });

  // ۱. ذخیره تصویر اصلی
  const imageUrl = await saveUploadedFile(req.file, 'uploads/posts', 'post');

  // ۲. تولید و ذخیره thumbnail
  const thumbnailFilename = storageService.StorageService.uniqueFilename(req.file.originalname, 'thumb');
  const thumbnailBuffer = await sharp(req.file.buffer)
    .resize(400, 400, { fit: 'cover' })
    .jpeg({ quality: 80 })
    .toBuffer();
  const thumbnailUrl = await storageService.saveBuffer(thumbnailBuffer, thumbnailFilename, 'uploads/thumbnails');

  const filterObject = filters.find(f => f.name === filterName);
  const hashtags = require('linkifyjs').find(caption || '').filter(r => r.type === 'hashtag').map(r => r.value.substring(1));

  const post = await Post.create({
    image: imageUrl,
    thumbnail: thumbnailUrl,
    filter: filterObject?.filter || '',
    caption: caption || '',
    author: user._id,
    hashtags,
  });

  // PostVote هم ایجاد شود
  await PostVote.create({ post: post._id });

  res.status(201).json({
    success: true,
    data: {
      ...post.toObject(),
      postVotes: [],
      comments: 0,
      author: { _id: user._id, avatar: user.avatar, username: user.username },
    },
  });

  // ارسال به دنبال‌کنندگان
  const followersDoc = await Followers.findOne({ user: user._id }).lean();
  if (followersDoc?.followers) {
    const postObj = { ...post.toObject(), author: { _id: user._id, username: user.username, avatar: user.avatar }, commentData: { commentCount: 0, comments: [] }, postVotes: [] };
    followersDoc.followers.forEach(f => socketHandler.sendPost(req, postObj, f.user));
  }
});

// بقیه توابع (deletePost, retrievePost, votePost, retrievePostFeed, ...) بدون تغییر
// ...
