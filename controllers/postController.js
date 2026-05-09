// مسیر فایل: /controllers/postController.js
// توضیح: کنترلر مدیریت پست‌ها. شامل ایجاد، حذف، رأی‌دهی، دریافت فید
// و بازیابی پست‌ها. از سرویس ذخیره‌سازی یکپارچه، کش Redis، و پردازش
// تصویر با sharp استفاده می‌کند.
//
// @version 2.5.0
// @since 2026

// ============================================================
// بخش ۱: ایمپورت‌ها
// ============================================================
const sharp = require('sharp');
const linkify = require('linkifyjs');
require('linkifyjs/plugins/hashtag')(linkify);
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;

const Post = require('../models/Post');
const PostVote = require('../models/PostVote');
const Followers = require('../models/Followers');
const Notification = require('../models/Notification');
const socketHandler = require('../handlers/socketHandler');
const asyncHandler = require('../utils/asyncHandler');
const redisCache = require('../services/redisCache');
const storageService = require('../utils/storage');
const { saveUploadedFile } = require('../utils/fileUpload');
const { retrieveComments, populatePostsPipeline } = require('../utils/controllerUtils');
const filters = require('../utils/filters');

// ============================================================
// بخش ۲: توابع کمکی
// ============================================================

/**
 * استخراج هشتگ‌ها از متن
 * @param {string} caption
 * @returns {string[]}
 */
const extractHashtags = (caption) => {
  if (!caption) return [];
  const results = linkify.find(caption);
  const tags = [];
  results.forEach((r) => {
    if (r.type === 'hashtag') {
      tags.push(r.value.substring(1).toLowerCase());
    }
  });
  return [...new Set(tags)];
};

// ============================================================
// بخش ۳: ایجاد پست
// ============================================================
module.exports.createPost = asyncHandler(async (req, res) => {
  const user = res.locals.user;
  const { caption, filter: filterName } = req.body;

  if (!req.file) {
    return res.status(400).json({ success: false, error: 'لطفاً یک تصویر انتخاب کنید.' });
  }

  // ذخیره تصویر اصلی
  const imageUrl = await saveUploadedFile(req.file, 'uploads/posts', 'post');

  // تولید و ذخیره thumbnail
  const thumbnailFilename = storageService.StorageService.uniqueFilename(req.file.originalname, 'thumb');
  const thumbnailBuffer = await sharp(req.file.buffer)
    .resize(400, 400, { fit: 'cover' })
    .jpeg({ quality: 80 })
    .toBuffer();
  const thumbnailUrl = await storageService.saveBuffer(thumbnailBuffer, thumbnailFilename, 'uploads/thumbnails');

  const filterObject = filters.find((f) => f.name === filterName);
  const hashtags = extractHashtags(caption);

  const post = await Post.create({
    image: imageUrl,
    thumbnail: thumbnailUrl,
    filter: filterObject?.filter || '',
    caption: caption || '',
    author: user._id,
    hashtags,
  });

  // ایجاد سند رأی برای پست
  await PostVote.create({ post: post._id });

  // پاک‌سازی کش فید کاربر (اختیاری)
  await redisCache.delByPattern(`feed:${user._id}:*`);

  res.status(201).json({
    success: true,
    data: {
      ...post.toObject(),
      postVotes: [],
      comments: 0,
      author: { _id: user._id, avatar: user.avatar, username: user.username },
    },
  });

  // ارسال به دنبال‌کنندگان (در پس‌زمینه)
  const followersDoc = await Followers.findOne({ user: user._id }).lean();
  if (followersDoc?.followers) {
    const postObj = {
      ...post.toObject(),
      author: { _id: user._id, username: user.username, avatar: user.avatar },
      commentData: { commentCount: 0, comments: [] },
      postVotes: [],
    };
    followersDoc.followers.forEach((f) => socketHandler.sendPost(req, postObj, f.user));
  }
});

// ============================================================
// بخش ۴: حذف پست
// ============================================================
module.exports.deletePost = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const user = res.locals.user;

  const post = await Post.findOne({ _id: postId, author: user._id });
  if (!post) {
    return res.status(404).json({ success: false, error: 'پستی با این شناسه برای شما یافت نشد.' });
  }

  // حذف فایل‌های فیزیکی
  await Promise.allSettled([
    storageService.deleteFile(post.image),
    post.thumbnail ? storageService.deleteFile(post.thumbnail) : Promise.resolve(),
  ]);

  // حذف از دیتابیس (هوک‌های آبشاری وظایف مربوطه را انجام می‌دهند)
  await Post.deleteOne({ _id: postId });

  // پاک‌سازی کش
  await redisCache.delByPattern(`feed:${user._id}:*`);

  res.status(200).json({ success: true, message: 'پست با موفقیت حذف شد.' });

  // اطلاع‌رسانی به دنبال‌کنندگان
  const followersDoc = await Followers.findOne({ user: user._id }).lean();
  if (followersDoc?.followers) {
    followersDoc.followers.forEach((f) => socketHandler.deletePost(req, postId, f.user));
  }
  socketHandler.deletePost(req, postId, user._id);
});

// ============================================================
// بخش ۵: دریافت یک پست
// ============================================================
module.exports.retrievePost = asyncHandler(async (req, res) => {
  const { postId } = req.params;

  const post = await Post.findById(postId)
    .populate('author', 'username avatar fullName')
    .lean();

  if (!post) {
    return res.status(404).json({ success: false, error: 'پستی با این شناسه یافت نشد.' });
  }

  const comments = await retrieveComments(postId, 0);
  const votes = await PostVote.findOne({ post: post._id }).lean();

  res.status(200).json({
    success: true,
    data: {
      ...post,
      postVotes: votes?.votes || [],
      commentData: comments,
    },
  });
});

// ============================================================
// بخش ۶: رأی‌دهی (لایک/دیسلایک)
// ============================================================
module.exports.votePost = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const user = res.locals.user;

  const post = await Post.findById(postId).select('author image thumbnail filter');
  if (!post) {
    return res.status(404).json({ success: false, error: 'پستی با این شناسه یافت نشد.' });
  }

  const result = await PostVote.toggleVote(postId, user._id);

  // نوتیفیکیشن در صورت لایک
  if (result === 'added' && String(post.author) !== String(user._id)) {
    const notification = await Notification.create({
      notificationType: 'like',
      sender: user._id,
      receiver: post.author,
      notificationData: {
        postId,
        image: post.thumbnail || post.image,
        filter: post.filter,
      },
    });

    socketHandler.sendNotification(req, {
      ...notification.toObject(),
      sender: {
        _id: user._id,
        username: user.username,
        avatar: user.avatar,
      },
    });
  }

  res.status(200).json({ success: true, operation: result === 'added' ? 'like' : 'unlike' });
});

// ============================================================
// بخش ۷: فید پست‌ها (با Redis Cache)
// ============================================================
module.exports.retrievePostFeed = asyncHandler(async (req, res) => {
  const user = res.locals.user;
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const cacheKey = `feed:${user._id}:${offset}`;

  const result = await redisCache.get(cacheKey, async () => {
    // دریافت لیست دنبال‌شونده‌ها
    const followingDoc = await require('../models/Following').findOne({ user: user._id }).lean();
    const followingIds = followingDoc?.following?.map((f) => f.user) || [];
    followingIds.push(user._id); // شامل خود کاربر

    // بازیابی پست‌ها با aggregation
    const posts = await Post.aggregate([
      { $match: { author: { $in: followingIds.map((id) => ObjectId(id)) } } },
      { $sort: { createdAt: -1 } },
      { $skip: offset },
      { $limit: 5 },
      ...populatePostsPipeline,
    ]);

    return posts;
  }, 60); // TTL = ۶۰ ثانیه

  res.status(200).json({
    success: true,
    data: result,
    pagination: { offset, limit: 5, hasMore: result.length === 5 },
  });
});

// ============================================================
// بخش ۸: پست‌های پیشنهادی (اکسپلور ساده)
// ============================================================
module.exports.retrieveSuggestedPosts = asyncHandler(async (req, res) => {
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

  const posts = await Post.aggregate([
    { $sort: { createdAt: -1 } },
    { $skip: offset },
    { $limit: 40 },
    { $sample: { size: 20 } },
    ...populatePostsPipeline,
  ]);

  res.status(200).json({
    success: true,
    data: posts,
    pagination: { offset, limit: 20, hasMore: posts.length === 20 },
  });
});

// ============================================================
// بخش ۹: جستجوی پست بر اساس هشتگ
// ============================================================
module.exports.retrieveHashtagPosts = asyncHandler(async (req, res) => {
  const { hashtag } = req.params;
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

  const result = await Post.aggregate([
    { $match: { hashtags: hashtag.toLowerCase() } },
    {
      $facet: {
        posts: [
          { $sort: { createdAt: -1 } },
          { $skip: offset },
          { $limit: 20 },
          ...populatePostsPipeline,
        ],
        totalCount: [
          { $match: { hashtags: hashtag.toLowerCase() } },
          { $group: { _id: null, count: { $sum: 1 } } },
        ],
      },
    },
    { $unwind: { path: '$totalCount', preserveNullAndEmptyArrays: true } },
    { $addFields: { totalCount: { $ifNull: ['$totalCount.count', 0] } } },
  ]);

  const data = result[0] || { posts: [], totalCount: 0 };

  res.status(200).json({
    success: true,
    data: data.posts,
    totalCount: data.totalCount,
    pagination: { offset, limit: 20, hasMore: data.posts.length === 20 },
  });
});

module.exports = exports;
