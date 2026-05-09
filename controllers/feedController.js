// مسیر فایل: /controllers/feedController.js
// توضیح: کنترلر فید هوشمند با الگوریتم رتبه‌بندی مشابه اینستاگرام.
// جایگزین retrievePostFeed ساده با Retrieval Stage (+200 کاندید) و
// امتیازدهی چندسیگنالی (Relationship, Interest, Recency, Engagement).
// همچنین فید اکسپلور (محتوای کاربران دنبال‌نشده) و پیشنهاد کاربران
// را با موتور rankingEngine و کش Redis ارائه می‌دهد.
//
// @version 2.5.0
// @since 2026

const Post = require('../models/Post');
const Following = require('../models/Following');
const asyncHandler = require('../utils/asyncHandler');
const redisCache = require('../services/redisCache');
const rankingEngine = require('../services/rankingEngine');

// ============================================================
// فید هوشمند (Smart Feed) – جایگزین Home Feed
// ============================================================
module.exports.getSmartFeed = asyncHandler(async (req, res) => {
  const user = res.locals.user;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const cacheKey = `smart_feed:${user._id}:${page}`;

  const result = await redisCache.get(cacheKey, async () => {
    // ۱. دریافت لیست دنبال‌شونده‌ها
    const followingDoc = await Following.findOne({ user: user._id }).lean();
    const followingIds = followingDoc?.following?.map(f => f.user) || [];
    if (!followingIds.includes(user._id.toString())) {
      followingIds.push(user._id); // پست‌های خود کاربر هم در فید بیاید
    }

    // ۲. Retrieval Stage – ۲۰۰ کاندید جدید
    const candidatePosts = await Post.find({
      author: { $in: followingIds },
      status: 'published',
    })
      .populate('author', 'username avatar fullName')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    // ۳. رتبه‌بندی با موتور rankingEngine
    const ranked = await rankingEngine.rankFeedPosts(user._id, candidatePosts, limit);

    // محاسبه total برای صفحه‌بندی (تقریبی)
    return { posts: ranked, total: ranked.length };
  }, 60); // کش ۶۰ ثانیه

  const startIndex = (page - 1) * limit;
  const paginatedPosts = result.posts.slice(startIndex, startIndex + limit);

  res.status(200).json({
    success: true,
    data: paginatedPosts,
    pagination: {
      page,
      limit,
      total: result.total,
      hasMore: startIndex + limit < result.total,
    },
  });
});

// ============================================================
// فید اکسپلور هوشمند (Smart Explore)
// ============================================================
module.exports.getSmartExplore = asyncHandler(async (req, res) => {
  const user = res.locals.user;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const cacheKey = `smart_explore:${user._id}:${page}`;

  const result = await redisCache.get(cacheKey, async () => {
    // ۱. لیست کاربران دنبال‌شده (برای حذف از نتایج)
    const followingDoc = await Following.findOne({ user: user._id }).lean();
    const followingIds = followingDoc?.following?.map(f => f.user) || [];
    followingIds.push(user._id); // خودش را هم حذف کن

    // ۲. Retrieval – پست‌های کاربران دنبال‌نشده
    const candidatePosts = await Post.find({
      author: { $nin: followingIds },
      status: 'published',
    })
      .populate('author', 'username avatar fullName')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    // ۳. رتبه‌بندی اکسپلور
    const ranked = await rankingEngine.rankExplorePosts(user._id, candidatePosts, limit);

    return { posts: ranked, total: ranked.length };
  }, 120); // کش ۲ دقیقه

  const startIndex = (page - 1) * limit;
  const paginatedPosts = result.posts.slice(startIndex, startIndex + limit);

  res.status(200).json({
    success: true,
    data: paginatedPosts,
    pagination: {
      page,
      limit,
      total: result.total,
      hasMore: startIndex + limit < result.total,
    },
  });
});

// ============================================================
// پیشنهاد کاربران هوشمند
// ============================================================
module.exports.getSuggestedUsersSmart = asyncHandler(async (req, res) => {
  const user = res.locals.user;
  const limit = Math.min(50, parseInt(req.query.limit, 10) || 20);

  const suggestedUsers = await rankingEngine.suggestUsers(user._id, limit);

  res.status(200).json({
    success: true,
    data: suggestedUsers,
  });
});
