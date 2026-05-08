// مسیر فایل: /controllers/postController.js
// توضیح: کنترلر مدیریت پست‌ها. این فایل منطق اصلی ایجاد، حذف، بازیابی، رأی‌دهی و
// نمایش فید پست‌ها را مدیریت می‌کند. همچنین شامل توابع بازیابی پست‌های پیشنهادی و
// جستجو بر اساس هشتگ است. از الگوی asyncHandler برای حذف try-catch تکراری
// و از sharp برای تولید خودکار بندانگشتی (thumbnail) استفاده می‌کند.

// ============================================================
// بخش ۱: ایمپورت کتابخانه‌ها و ماژول‌های مورد نیاز
// ============================================================
const sharp = require('sharp');               // پردازش تصویر: تولید بندانگشتی
const path = require('path');                 // مدیریت مسیرهای فایل
const fs = require('fs').promises;            // عملیات فایل async
const linkify = require('linkifyjs');         // استخراج هشتگ و منشن از متن
require('linkifyjs/plugins/hashtag')(linkify);
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

// ============================================================
// بخش ۲: ثابت‌های پیکربندی
// ============================================================
const FEED_PAGE_SIZE = 5;                     // تعداد پست در هر صفحه فید
const SUGGESTED_PAGE_SIZE = 20;               // تعداد پست‌های پیشنهادی
const HASHTAG_PAGE_SIZE = 20;                 // تعداد پست‌های هشتگ
const MAX_IMAGE_SIZE_MB = 10;                 // حداکثر حجم عکس (مگابایت)
const THUMBNAIL_WIDTH = 400;                  // عرض بندانگشتی
const THUMBNAIL_HEIGHT = 400;                 // ارتفاع بندانگشتی
const ALLOWED_IMAGE_TYPES = [                 // انواع مجاز تصویر
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];
const UNWANTED_USER_FIELDS = [                // فیلدهای کاربر که نباید افشا شوند
  'author.password',
  'author.private',
  'author.confirmed',
  'author.bookmarks',
  'author.email',
  'author.website',
  'author.bio',
  'author.githubId',
];

// ============================================================
// بخش ۳: توابع کمکی (Utility Functions)
// ============================================================

/**
 * @function isValidObjectId
 * @description بررسی اعتبار یک رشته به عنوان ObjectId مونگوس
 * @param {string} id - رشته مورد بررسی
 * @returns {boolean} - نتیجه بررسی
 */
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

/**
 * @function extractHashtags
 * @description استخراج هشتگ‌ها از متن کپشن با استفاده از linkifyjs
 * @param {string} caption - متن کپشن پست
 * @returns {string[]} - آرایه‌ای از هشتگ‌های استخراج‌شده (بدون علامت #)
 */
const extractHashtags = (caption) => {
  if (!caption) return [];
  const hashtags = [];
  linkify.find(caption).forEach((result) => {
    if (result.type === 'hashtag') {
      hashtags.push(result.value.substring(1).toLowerCase());
    }
  });
  // حذف هشتگ‌های تکراری
  return [...new Set(hashtags)];
};

/**
 * @function generateThumbnail
 * @description تولید نسخه بندانگشتی از تصویر اصلی با استفاده از sharp
 * @param {string} imagePath - مسیر فایل تصویر اصلی
 * @returns {Promise<string>} - مسیر فایل بندانگشتی
 */
const generateThumbnail = async (imagePath) => {
  const thumbnailPath = imagePath.replace(/(\.\w+)$/, '_thumb$1');
  try {
    await sharp(imagePath)
      .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toFile(thumbnailPath);
    return thumbnailPath;
  } catch (err) {
    console.error('[generateThumbnail] خطا در تولید بندانگشتی:', err.message);
    // در صورت خطا، مسیر اصلی را برمی‌گردانیم
    return imagePath;
  }
};

/**
 * @function broadcastToFollowers
 * @description ارسال یک رویداد به تمام دنبال‌کنندگان یک کاربر
 * @param {object} req - شیء درخواست Express
 * @param {string} userId - شناسه کاربر
 * @param {function} callback - تابع ارسال (مثل sendPost یا deletePost)
 * @param {any} data - داده‌ای که باید ارسال شود
 */
const broadcastToFollowers = async (req, userId, callback, data) => {
  try {
    const followersDoc = await Followers.findOne({ user: ObjectId(userId) }).lean();
    if (!followersDoc?.followers?.length) return;

    followersDoc.followers.forEach((follower) => {
      callback(req, data, follower.user);
    });
  } catch (err) {
    console.error('[broadcastToFollowers] خطا در ارسال به دنبال‌کنندگان:', err.message);
  }
};

/**
 * @function sendLikeNotification
 * @description ایجاد و ارسال نوتیفیکیشن لایک
 */
const sendLikeNotification = async (req, user, post) => {
  if (String(post.author) === String(user._id)) return;

  try {
    const notification = await Notification.create({
      sender: user._id,
      receiver: post.author,
      notificationType: 'like',
      date: new Date(),
      notificationData: {
        postId: post._id,
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
  } catch (err) {
    console.error('[sendLikeNotification] خطا در ارسال نوتیفیکیشن لایک:', err.message);
  }
};

// ============================================================
// بخش ۴: کنترلر ایجاد پست (Create Post)
// ============================================================

/**
 * @function createPost
 * @description ایجاد پست جدید با تصویر محلی
 * @route POST /api/posts
 * @middleware requireAuth, multer.single('image')
 */
module.exports.createPost = asyncHandler(async (req, res) => {
  const user = res.locals.user;
  const { caption, filter: filterName } = req.body;

  // اعتبارسنجی وجود فایل تصویر
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'لطفاً یک تصویر برای پست انتخاب کنید.',
    });
  }

  // بررسی نوع فایل
  if (!ALLOWED_IMAGE_TYPES.includes(req.file.mimetype)) {
    await fs.unlink(req.file.path).catch(() => {});
    return res.status(400).json({
      success: false,
      error: 'فقط فایل‌های تصویری (JPEG، PNG، WebP، GIF) مجاز هستند.',
    });
  }

  // یافتن فیلتر
  const filterObject = filters.find((f) => f.name === filterName);
  const hashtags = extractHashtags(caption);

  // مسیر ذخیره‌سازی
  const imageUrl = '/uploads/' + req.file.filename;

  // تولید بندانگشتی
  const thumbnailFullPath = await generateThumbnail(req.file.path);
  const thumbnailUrl = thumbnailFullPath.replace('public', '');

  // ایجاد پست و رأی‌ها
  const [post] = await Promise.all([
    Post.create({
      image: imageUrl,
      thumbnail: thumbnailUrl,
      filter: filterObject?.filter || '',
      caption: caption || '',
      author: user._id,
      hashtags,
    }),
    PostVote.create({ post: undefined }), // ابتدا رأی را با post undefined می‌سازیم
  ]);

  // به‌روزرسانی شناسه پست در PostVote
  await PostVote.findOneAndUpdate(
    { post: undefined },
    { post: post._id },
    { sort: { _id: -1 } }
  );

  // پاسخ موفقیت
  res.status(201).json({
    success: true,
    message: 'پست با موفقیت ایجاد شد.',
    data: {
      ...post.toObject(),
      postVotes: [],
      comments: 0,
      author: {
        _id: user._id,
        avatar: user.avatar,
        username: user.username,
      },
    },
  });

  // ارسال به دنبال‌کنندگان (در پس‌زمینه - بدون await)
  const postObject = {
    ...post.toObject(),
    author: { _id: user._id, username: user.username, avatar: user.avatar },
    commentData: { commentCount: 0, comments: [] },
    postVotes: [],
  };
  broadcastToFollowers(req, user._id, socketHandler.sendPost, postObject);
});

// ============================================================
// بخش ۵: کنترلر حذف پست (Delete Post)
// ============================================================

/**
 * @function deletePost
 * @description حذف پست و فایل‌های مرتبط
 * @route DELETE /api/posts/:postId
 * @middleware requireAuth
 */
module.exports.deletePost = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const user = res.locals.user;

  // اعتبارسنجی شناسه
  if (!isValidObjectId(postId)) {
    return res.status(400).json({
      success: false,
      error: 'شناسه پست نامعتبر است.',
    });
  }

  // یافتن پست
  const post = await Post.findOne({ _id: postId, author: user._id });
  if (!post) {
    return res.status(404).json({
      success: false,
      error: 'پستی با این شناسه برای شما یافت نشد.',
    });
  }

  // حذف فایل‌های تصویر از دیسک
  const filesToDelete = [post.image, post.thumbnail]
    .filter(Boolean)
    .map((img) => path.join('public', img));
  await Promise.allSettled(
    filesToDelete.map((filePath) => fs.unlink(filePath))
  );

  // حذف پست از دیتابیس
  await Post.deleteOne({ _id: postId });

  res.status(200).json({
    success: true,
    message: 'پست با موفقیت حذف شد.',
  });

  // اطلاع‌رسانی به دنبال‌کنندگان
  broadcastToFollowers(req, user._id, socketHandler.deletePost, postId);
  // ارسال به خود کاربر
  socketHandler.deletePost(req, postId, user._id);
});

// ============================================================
// بخش ۶: کنترلر دریافت یک پست خاص (Retrieve Single Post)
// ============================================================

/**
 * @function retrievePost
 * @description دریافت اطلاعات کامل یک پست به همراه رأی‌ها، نویسنده و نظرات
 * @route GET /api/posts/:postId
 */
module.exports.retrievePost = asyncHandler(async (req, res) => {
  const { postId } = req.params;

  if (!isValidObjectId(postId)) {
    return res.status(400).json({
      success: false,
      error: 'شناسه پست نامعتبر است.',
    });
  }

  const postArray = await Post.aggregate([
    { $match: { _id: ObjectId(postId) } },
    {
      $lookup: {
        from: 'postvotes',
        localField: '_id',
        foreignField: 'post',
        as: 'postVotes',
      },
    },
    { $unwind: { path: '$postVotes', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'users',
        localField: 'author',
        foreignField: '_id',
        pipeline: [
          { $project: { username: 1, avatar: 1, fullName: 1 } },
        ],
        as: 'author',
      },
    },
    { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        postVotes: { $ifNull: ['$postVotes.votes', []] },
      },
    },
  ]);

  if (!postArray.length) {
    return res.status(404).json({
      success: false,
      error: 'پستی با این شناسه یافت نشد.',
    });
  }

  const comments = await retrieveComments(postId, 0);

  return res.status(200).json({
    success: true,
    data: { ...postArray[0], commentData: comments },
  });
});

// ============================================================
// بخش ۷: کنترلر رأی (لایک/دیسلایک) پست
// ============================================================

/**
 * @function votePost
 * @description رأی دادن یا لغو رأی به یک پست (Toggle Like)
 * @route POST /api/posts/:postId/vote
 * @middleware requireAuth
 */
module.exports.votePost = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const user = res.locals.user;

  if (!isValidObjectId(postId)) {
    return res.status(400).json({
      success: false,
      error: 'شناسه پست نامعتبر است.',
    });
  }

  // بررسی وجود پست
  const post = await Post.findById(postId).select('author image thumbnail filter');
  if (!post) {
    return res.status(404).json({
      success: false,
      error: 'پستی با این شناسه یافت نشد.',
    });
  }

  // تلاش برای افزودن رأی (با استفاده از $push با شرط عدم وجود)
  const addResult = await PostVote.updateOne(
    { post: ObjectId(postId), 'votes.author': { $ne: user._id } },
    { $push: { votes: { author: user._id } } }
  );

  if (addResult.modifiedCount > 0) {
    // رأی اضافه شد - ارسال نوتیفیکیشن
    await sendLikeNotification(req, user, post);

    return res.status(200).json({
      success: true,
      message: 'پست لایک شد.',
      data: { operation: 'like' },
    });
  }

  // رأی قبلاً وجود داشت - حذف آن
  const removeResult = await PostVote.updateOne(
    { post: ObjectId(postId) },
    { $pull: { votes: { author: user._id } } }
  );

  if (removeResult.modifiedCount === 0) {
    return res.status(500).json({
      success: false,
      error: 'عملیات دیسلایک با خطا مواجه شد.',
    });
  }

  return res.status(200).json({
    success: true,
    message: 'لایک پست برداشته شد.',
    data: { operation: 'unlike' },
  });
});

// ============================================================
// بخش ۸: کنترلر دریافت فید پست‌ها (Post Feed)
// ============================================================

/**
 * @function retrievePostFeed
 * @description دریافت فید پست‌های کاربر بر اساس دنبال‌شونده‌ها
 * @route GET /api/posts/feed?offset=0
 * @middleware requireAuth
 */
module.exports.retrievePostFeed = asyncHandler(async (req, res) => {
  const user = res.locals.user;
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

  const followingDoc = await Following.findOne({ user: user._id }).lean();
  if (!followingDoc?.following?.length) {
    // اگر کاربر کسی را دنبال نمی‌کند، پست‌های خودش را نمایش ده
    const ownPosts = await Post.aggregate([
      { $match: { author: ObjectId(user._id) } },
      { $sort: { date: -1 } },
      { $skip: offset },
      { $limit: FEED_PAGE_SIZE },
      ...populatePostsPipeline,
    ]);

    return res.status(200).json({
      success: true,
      data: ownPosts,
    });
  }

  const followingIds = followingDoc.following.map((f) => f.user);

  const posts = await Post.aggregate([
    {
      $match: {
        $or: [
          { author: { $in: followingIds.map((id) => ObjectId(id)) } },
          { author: ObjectId(user._id) },
        ],
      },
    },
    { $sort: { date: -1 } },
    { $skip: offset },
    { $limit: FEED_PAGE_SIZE },
    {
      $lookup: {
        from: 'users',
        localField: 'author',
        foreignField: '_id',
        pipeline: [{ $project: { username: 1, avatar: 1, fullName: 1 } }],
        as: 'author',
      },
    },
    { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'postvotes',
        localField: '_id',
        foreignField: 'post',
        as: 'postVotes',
      },
    },
    { $unwind: { path: '$postVotes', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'comments',
        let: { postId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$post', '$$postId'] } } },
          { $sort: { date: -1 } },
          { $limit: 3 },
          {
            $lookup: {
              from: 'users',
              localField: 'author',
              foreignField: '_id',
              pipeline: [{ $project: { username: 1, avatar: 1 } }],
              as: 'author',
            },
          },
          { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'commentvotes',
              localField: '_id',
              foreignField: 'comment',
              as: 'commentVotes',
            },
          },
          { $unwind: { path: '$commentVotes', preserveNullAndEmptyArrays: true } },
          { $addFields: { commentVotes: { $ifNull: ['$commentVotes.votes', []] } } },
        ],
        as: 'comments',
      },
    },
    {
      $lookup: {
        from: 'comments',
        let: { postId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$post', '$$postId'] } } },
          { $group: { _id: null, count: { $sum: 1 } } },
        ],
        as: 'commentCount',
      },
    },
    { $unwind: { path: '$commentCount', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        postVotes: { $ifNull: ['$postVotes.votes', []] },
        commentData: {
          comments: '$comments',
          commentCount: { $ifNull: ['$commentCount.count', 0] },
        },
      },
    },
    { $unset: ['comments', 'commentCount'] },
  ]);

  return res.status(200).json({
    success: true,
    data: posts,
    pagination: {
      offset,
      limit: FEED_PAGE_SIZE,
      hasMore: posts.length === FEED_PAGE_SIZE,
    },
  });
});

// ============================================================
// بخش ۹: کنترلر دریافت پست‌های پیشنهادی (Suggested Posts)
// ============================================================

/**
 * @function retrieveSuggestedPosts
 * @description دریافت پست‌های تصادفی برای بخش اکسپلور
 * @route GET /api/posts/suggested?offset=0
 */
module.exports.retrieveSuggestedPosts = asyncHandler(async (req, res) => {
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

  const posts = await Post.aggregate([
    { $sort: { date: -1 } },
    { $skip: offset },
    { $limit: SUGGESTED_PAGE_SIZE * 2 }, // دو برابر می‌گیریم
    { $sample: { size: SUGGESTED_PAGE_SIZE } }, // سپس تصادفی انتخاب می‌کنیم
    ...populatePostsPipeline,
  ]);

  return res.status(200).json({
    success: true,
    data: posts,
    pagination: {
      offset,
      limit: SUGGESTED_PAGE_SIZE,
      hasMore: posts.length === SUGGESTED_PAGE_SIZE,
    },
  });
});

// ============================================================
// بخش ۱۰: کنترلر دریافت پست‌های یک هشتگ خاص
// ============================================================

/**
 * @function retrieveHashtagPosts
 * @description جستجوی پست‌ها بر اساس هشتگ
 * @route GET /api/posts/hashtag/:hashtag?offset=0
 */
module.exports.retrieveHashtagPosts = asyncHandler(async (req, res) => {
  const { hashtag } = req.params;
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

  if (!hashtag || hashtag.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'لطفاً یک هشتگ برای جستجو وارد کنید.',
    });
  }

  const cleanHashtag = hashtag.toLowerCase().trim();

  const result = await Post.aggregate([
    {
      $facet: {
        posts: [
          { $match: { hashtags: cleanHashtag } },
          { $sort: { date: -1 } },
          { $skip: offset },
          { $limit: HASHTAG_PAGE_SIZE },
          ...populatePostsPipeline,
        ],
        totalCount: [
          { $match: { hashtags: cleanHashtag } },
          { $group: { _id: null, count: { $sum: 1 } } },
        ],
      },
    },
    { $unwind: { path: '$totalCount', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        totalCount: { $ifNull: ['$totalCount.count', 0] },
      },
    },
  ]);

  const data = result[0] || { posts: [], totalCount: 0 };

  return res.status(200).json({
    success: true,
    data: data.posts,
    totalCount: data.totalCount,
    pagination: {
      offset,
      limit: HASHTAG_PAGE_SIZE,
      hasMore: data.posts.length === HASHTAG_PAGE_SIZE,
    },
  });
});

module.exports = exports;
