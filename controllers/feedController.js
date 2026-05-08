// مسیر فایل: /controllers/feedController.js
// توضیح: کنترلر فید هوشمند با رتبه‌بندی الگوریتمی.
// جایگزین retrievePostFeed ساده با الگوریتم رتبه‌بندی اینستاگرام.

const Post = require('../models/Post');
const Following = require('../models/Following');
const asyncHandler = require('../utils/asyncHandler');
const rankingEngine = require('../services/rankingEngine');

// ============================================================
// فید هوشمند با رتبه‌بندی (Smart Feed)
// ============================================================
module.exports.getSmartFeed = asyncHandler(async (req, res) => {
  const user = res.locals.user;
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const skip = (page - 1) * limit;

  // ۱. دریافت لیست دنبال‌شونده‌ها
  const followingDoc = await Following.findOne({ user: user._id }).lean();
  const followingIds = followingDoc?.following?.map(f => f.user) || [];
  followingIds.push(user._id); // پست‌های خود کاربر هم نمایش داده شود

  // ۲. دریافت پست‌های کاندید (Retrieval Stage - مشابه اینستاگرام)
  const candidatePosts = await Post.find({
    author: { $in: followingIds },
  })
    .populate('author', 'username avatar fullName')
    .sort({ createdAt: -1 })
    .limit(200) // تعداد بیشتر برای رتبه‌بندی
    .lean();

  // ۳. رتبه‌بندی با الگوریتم
  const rankedPosts = await rankingEngine.rankFeedPosts(user._id, candidatePosts, limit);

  // ۴. صفحه‌بندی روی نتایج رتبه‌بندی شده
  const paginatedPosts = rankedPosts.slice(skip, skip + limit);

  res.status(200).json({
    success: true,
    data: paginatedPosts,
    pagination: {
      page,
      limit,
      total: rankedPosts.length,
      hasMore: skip + limit < rankedPosts.length,
    },
  });
});

// ============================================================
// فید اکسپلور هوشمند
// ============================================================
module.exports.getSmartExplore = asyncHandler(async (req, res) => {
  const user = res.locals.user;
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);
  const skip = (page - 1) * limit;

  // ۱. دریافت پست‌هایی که کاربر هنوز ندیده (از افرادی که دنبال نمی‌کند)
  const followingDoc = await Following.findOne({ user: user._id }).lean();
  const followingIds = followingDoc?.following?.map(f => f.user) || [];
  followingIds.push(user._id);

  // ۲. بازیابی کاندیدها (Retrieval)
  const candidatePosts = await Post.find({
    author: { $nin: followingIds }, // از افرادی که دنبال نمی‌کند
  })
    .populate('author', 'username avatar fullName')
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  // ۳. رتبه‌بندی Explore
  const rankedPosts = await rankingEngine.rankExplorePosts(user._id, candidatePosts, limit);

  const paginatedPosts = rankedPosts.slice(skip, skip + limit);

  res.status(200).json({
    success: true,
    data: paginatedPosts,
    pagination: {
      page,
      limit,
      total: rankedPosts.length,
      hasMore: skip + limit < rankedPosts.length,
    },
  });
});

// ============================================================
// پیشنهاد کاربران
// ============================================================
module.exports.getSuggestedUsersSmart = asyncHandler(async (req, res) => {
  const user = res.locals.user;
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);

  const suggestedUsers = await rankingEngine.suggestUsers(user._id, limit);

  res.status(200).json({
    success: true,
    data: suggestedUsers,
  });
});
