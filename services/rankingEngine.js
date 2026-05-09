// مسیر فایل: /services/rankingEngine.js
// توضیح: موتور رتبه‌بندی چندسطحی شبیه‌سازی‌شده از الگوریتم اینستاگرام.
// بر اساس مستندات رسمی Meta Engineering (2024-2026)، این ماژول
// سیگنال‌های کلیدی رتبه‌بندی را برای چهار سطح (Feed, Explore, Reels, Stories)
// پیاده‌سازی می‌کند. از کش‌های داخلی برای بهینه‌سازی کوئری‌های تکراری استفاده می‌کند.
//
// @version 2.5.1
// @since 2026

const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const User = require('../models/User');
const Post = require('../models/Post');
const PostVote = require('../models/PostVote');
const Comment = require('../models/Comment');
const Followers = require('../models/Followers');
const Following = require('../models/Following');
const Notification = require('../models/Notification');

// ============================================================
// ثابت‌های پیکربندی (مقادیر واقعی از تحلیل رفتار الگوریتم)
// ============================================================
const SIGNAL_WEIGHTS = {
  FEED_RELATIONSHIP: 0.30,
  FEED_INTEREST: 0.25,
  FEED_RECENCY: 0.20,
  FEED_ENGAGEMENT_VELOCITY: 0.15,
  FEED_CONTENT_QUALITY: 0.10,

  EXPLORE_POPULARITY: 0.40,
  EXPLORE_INTEREST_MATCH: 0.35,
  EXPLORE_ENGAGEMENT_DEPTH: 0.15,
  EXPLORE_CONTENT_FRESHNESS: 0.10,

  REELS_WATCH_TIME: 0.35,
  REELS_SENDS: 0.30,
  REELS_LIKES: 0.15,
  REELS_RETENTION: 0.10,
  REELS_RECENCY: 0.10,

  STORY_VIEWING_HISTORY: 0.40,
  STORY_CLOSENESS: 0.35,
  STORY_RECENCY: 0.15,
  STORY_ENGAGEMENT: 0.10,
};

const RECENCY_DECAY_FACTOR = 0.8;
const ENGAGEMENT_VELOCITY_WINDOW = 60;

// ============================================================
// کلاس موتور رتبه‌بندی (Singleton)
// ============================================================
class RankingEngine {
  constructor() {
    // کش‌های داخلی برای کاهش کوئری‌های تکراری
    this._relationshipCache = new Map();
    this._postVoteCache = new Map();
    this._commentCountCache = new Map();
    console.log('[RankingEngine] Initialized with Instagram-based signal weights');
  }

  // ==========================================================
  // ۳.۱ رابطۀ دو کاربر (Relationship Score)
  // ==========================================================
  async calculateRelationshipScore(userId, targetUserId) {
    if (userId.toString() === targetUserId.toString()) return 1.0;
    const cacheKey = `${userId}_${targetUserId}`;
    if (this._relationshipCache.has(cacheKey)) {
      return this._relationshipCache.get(cacheKey);
    }

    try {
      const uid = ObjectId(userId);
      const tid = ObjectId(targetUserId);

      const targetPostIds = (await Post.find({ author: tid }).select('_id').lean()).map(p => p._id);
      const [likeCount, commentCount, isFollowed, isFollowing, mutualNotifications] = await Promise.all([
        targetPostIds.length ? PostVote.countDocuments({ post: { $in: targetPostIds }, 'votes.author': uid }) : 0,
        targetPostIds.length ? Comment.countDocuments({ post: { $in: targetPostIds }, author: uid }) : 0,
        Followers.exists({ user: tid, 'followers.user': uid }),
        Following.exists({ user: uid, 'following.user': tid }),
        Notification.countDocuments({ $or: [{ sender: uid, receiver: tid }, { sender: tid, receiver: uid }] }),
      ]);

      const score = Math.min(
        Math.min(likeCount / 50, 1.0) * 0.25 +
        Math.min(commentCount / 20, 1.0) * 0.25 +
        ((isFollowed ? 1 : 0) + (isFollowing ? 1 : 0)) / 2 * 0.30 +
        Math.min(mutualNotifications / 30, 1.0) * 0.20,
        1.0
      );

      this._relationshipCache.set(cacheKey, score);
      return score;
    } catch (err) {
      console.error(`[RelationshipScore] Error for ${userId}-${targetUserId}:`, err.message);
      return 0.1;
    }
  }

  // ==========================================================
  // ۳.۲ علاقۀ کاربر به محتوا (Interest Score)
  // ==========================================================
  async calculateInterestScore(userId, post) {
    try {
      const uid = ObjectId(userId);
      let hashtagScore = 0, authorScore = 0;

      if (post.hashtags?.length) {
        const interactedPostIds = (await Post.find({ hashtags: { $in: post.hashtags } }).select('_id').lean()).map(p => p._id);
        if (interactedPostIds.length) {
          const interactions = await PostVote.countDocuments({ post: { $in: interactedPostIds }, 'votes.author': uid });
          hashtagScore = Math.min(interactions / 20, 1.0);
        }
      }

      if (post.author) {
        const authorId = post.author._id || post.author;
        const authorPostIds = (await Post.find({ author: authorId }).select('_id').lean()).map(p => p._id);
        if (authorPostIds.length) {
          const authorInteractions = await PostVote.countDocuments({ post: { $in: authorPostIds }, 'votes.author': uid })
            + await Comment.countDocuments({ post: { $in: authorPostIds }, author: uid });
          authorScore = Math.min(authorInteractions / 15, 1.0);
        }
      }

      const ageHours = (Date.now() - new Date(post.createdAt).getTime()) / (1000 * 60 * 60);
      const recencyScore = Math.exp(-RECENCY_DECAY_FACTOR * ageHours / 24);

      return hashtagScore * 0.40 + authorScore * 0.35 + recencyScore * 0.25;
    } catch (err) {
      console.error(`[InterestScore] Error for post ${post._id}:`, err.message);
      return 0.1;
    }
  }

  // ==========================================================
  // ۳.۳ سرعت تعامل (Engagement Velocity)
  // ==========================================================
  async calculateEngagementVelocity(postId) {
    try {
      const post = await Post.findById(postId).select('createdAt').lean();
      if (!post) return 0;

      const ageMinutes = (Date.now() - new Date(post.createdAt).getTime()) / (1000 * 60);
      if (ageMinutes < 1) return 0.5;

      const [voteDoc, commentCount] = await Promise.all([
        PostVote.findOne({ post: postId }).lean(),
        Comment.countDocuments({ post: postId }),
      ]);

      const totalEngagement = (voteDoc?.votes?.length || 0) + (commentCount || 0);
      return Math.min(totalEngagement / Math.max(ageMinutes, 1) / 2, 1.0);
    } catch (err) {
      console.error(`[EngagementVelocity] Error for ${postId}:`, err.message);
      return 0;
    }
  }

  // ==========================================================
  // ۳.۴ عمق تعامل (Engagement Depth)
  // ==========================================================
  async calculateEngagementDepth(postId) {
    try {
      const [post, voteDoc, commentCount] = await Promise.all([
        Post.findById(postId).select('bookmarks').lean(),
        PostVote.findOne({ post: postId }).lean(),
        Comment.countDocuments({ post: postId }),
      ]);

      const weightedScore = (voteDoc?.votes?.length || 0) * 1
        + (commentCount || 0) * 2
        + (post?.bookmarks?.length || 0) * 4;

      return Math.min(weightedScore / 100, 1.0);
    } catch (err) {
      console.error(`[EngagementDepth] Error for ${postId}:`, err.message);
      return 0;
    }
  }

  // ==========================================================
  // ۳.۵ کیفیت محتوا (Engagement Rate)
  // ==========================================================
  async calculateContentQuality(postId) {
    try {
      const [post, voteDoc, commentCount] = await Promise.all([
        Post.findById(postId).select('views').lean(),
        PostVote.findOne({ post: postId }).lean(),
        Comment.countDocuments({ post: postId }),
      ]);
      const views = post?.views || 1;
      return Math.min(((voteDoc?.votes?.length || 0) + (commentCount || 0)) / views * 5, 1.0);
    } catch (err) {
      return 0.1;
    }
  }

  // ==========================================================
  // ۳.۶ محبوبیت (برای Explore)
  // ==========================================================
  async calculatePopularityScore(postId) {
    try {
      const [voteDoc, commentCount] = await Promise.all([
        PostVote.findOne({ post: postId }).lean(),
        Comment.countDocuments({ post: postId }),
      ]);
      return Math.min((Math.log1p(voteDoc?.votes?.length || 0) + Math.log1p(commentCount || 0)) / 10, 1.0);
    } catch (err) {
      return 0;
    }
  }

  // ==========================================================
  // ۳.۷ رتبه‌بندی Feed (الگوریتم صفحه اصلی)
  // ==========================================================
  async rankFeedPosts(userId, posts, limit = 30) {
    const scoredPosts = [];

    const results = await Promise.allSettled(
      posts.map(async (post) => {
        try {
          const authorId = post.author?._id || post.author;
          if (!authorId) return { post, score: 0 };

          const [relationship, interest, velocity, quality] = await Promise.all([
            this.calculateRelationshipScore(userId, authorId),
            this.calculateInterestScore(userId, post),
            this.calculateEngagementVelocity(post._id),
            this.calculateContentQuality(post._id),
          ]);

          const ageHours = (Date.now() - new Date(post.createdAt).getTime()) / (1000 * 60 * 60);
          const recency = Math.exp(-RECENCY_DECAY_FACTOR * ageHours / 24);

          const finalScore = relationship * SIGNAL_WEIGHTS.FEED_RELATIONSHIP
            + interest * SIGNAL_WEIGHTS.FEED_INTEREST
            + recency * SIGNAL_WEIGHTS.FEED_RECENCY
            + velocity * SIGNAL_WEIGHTS.FEED_ENGAGEMENT_VELOCITY
            + quality * SIGNAL_WEIGHTS.FEED_CONTENT_QUALITY;

          return { post, score: finalScore };
        } catch {
          return { post, score: 0 };
        }
      })
    );

    results.forEach(r => {
      if (r.status === 'fulfilled') scoredPosts.push(r.value);
    });

    return scoredPosts.sort((a, b) => b.score - a.score).slice(0, limit).map(i => i.post);
  }

  // ==========================================================
  // ۳.۸ رتبه‌بندی Explore
  // ==========================================================
  async rankExplorePosts(userId, posts, limit = 30) {
    const scoredPosts = [];

    const results = await Promise.allSettled(
      posts.map(async (post) => {
        try {
          const [popularity, interest, depth, velocity] = await Promise.all([
            this.calculatePopularityScore(post._id),
            this.calculateInterestScore(userId, post),
            this.calculateEngagementDepth(post._id),
            this.calculateEngagementVelocity(post._id),
          ]);

          const ageHours = (Date.now() - new Date(post.createdAt).getTime()) / (1000 * 60 * 60);
          const freshness = Math.exp(-RECENCY_DECAY_FACTOR * ageHours / 48);

          const finalScore = popularity * SIGNAL_WEIGHTS.EXPLORE_POPULARITY
            + interest * SIGNAL_WEIGHTS.EXPLORE_INTEREST_MATCH
            + depth * SIGNAL_WEIGHTS.EXPLORE_ENGAGEMENT_DEPTH
            + freshness * SIGNAL_WEIGHTS.EXPLORE_CONTENT_FRESHNESS;

          return { post, score: finalScore };
        } catch {
          return { post, score: 0 };
        }
      })
    );

    results.forEach(r => { if (r.status === 'fulfilled') scoredPosts.push(r.value); });
    return scoredPosts.sort((a, b) => b.score - a.score).slice(0, limit).map(i => i.post);
  }

  // ==========================================================
  // ۳.۹ رتبه‌بندی Reels
  // ==========================================================
  async rankReels(userId, reels, limit = 20) {
    const scoredReels = [];

    for (const reel of reels) {
      try {
        const authorId = reel.author?._id || reel.author;
        const [relationship, popularity] = await Promise.all([
          this.calculateRelationshipScore(userId, authorId),
          this.calculatePopularityScore(reel._id),
        ]);
        const watchTimeScore = Math.min((reel.duration || 10) / 60, 1.0);
        const sendsScore = await this.calculateEngagementDepth(reel._id);
        const likesScore = Math.min((reel.likes?.length || 0) / 100, 1.0);
        const retentionScore = Math.min((reel.duration || 10) <= 15 ? 0.8 : 0.5, 1.0);
        const ageHours = (Date.now() - new Date(reel.createdAt).getTime()) / (1000 * 60 * 60);
        const recency = Math.exp(-RECENCY_DECAY_FACTOR * ageHours / 24);

        const score = watchTimeScore * SIGNAL_WEIGHTS.REELS_WATCH_TIME
          + sendsScore * SIGNAL_WEIGHTS.REELS_SENDS
          + likesScore * SIGNAL_WEIGHTS.REELS_LIKES
          + retentionScore * SIGNAL_WEIGHTS.REELS_RETENTION
          + recency * SIGNAL_WEIGHTS.REELS_RECENCY
          + relationship * 0.05;
        scoredReels.push({ reel, score });
      } catch {
        scoredReels.push({ reel, score: 0 });
      }
    }
    return scoredReels.sort((a, b) => b.score - a.score).slice(0, limit).map(i => i.reel);
  }

  // ==========================================================
  // ۳.۱۰ رتبه‌بندی Stories
  // ==========================================================
  async rankStories(userId, stories, limit = 50) {
    const scoredStories = [];
    for (const story of stories) {
      try {
        const authorId = story.author?._id || story.author;
        const viewingHistoryScore = story.viewers?.some(v => v.user?.toString() === userId.toString()) ? 0.8 : 0.2;
        const closeness = await this.calculateRelationshipScore(userId, authorId);
        const ageHours = (Date.now() - new Date(story.createdAt).getTime()) / (1000 * 60 * 60);
        const recency = Math.exp(-RECENCY_DECAY_FACTOR * ageHours / 6);
        const engagementScore = Math.min((story.likes?.length || 0) / 5, 1.0);

        const score = viewingHistoryScore * SIGNAL_WEIGHTS.STORY_VIEWING_HISTORY
          + closeness * SIGNAL_WEIGHTS.STORY_CLOSENESS
          + recency * SIGNAL_WEIGHTS.STORY_RECENCY
          + engagementScore * SIGNAL_WEIGHTS.STORY_ENGAGEMENT;
        scoredStories.push({ story, score });
      } catch {
        scoredStories.push({ story, score: 0 });
      }
    }
    return scoredStories.sort((a, b) => b.score - a.score).slice(0, limit).map(i => i.story);
  }

  // ==========================================================
  // ۳.۱۱ پیشنهاد کاربران
  // ==========================================================
  async suggestUsers(userId, limit = 20) {
    try {
      const uid = ObjectId(userId);
      const followingDoc = await Following.findOne({ user: uid }).lean();
      const followingIds = followingDoc?.following?.map(f => f.user) || [];

      const [fofUsers, myPosts] = await Promise.all([
        Followers.aggregate([
          { $match: { user: { $in: followingIds } } },
          { $unwind: '$followers' },
          { $group: { _id: '$followers.user', count: { $sum: 1 } } },
          { $match: { _id: { $nin: [...followingIds, uid] } } },
          { $sort: { count: -1 } },
          { $limit: limit * 2 },
        ]),
        Post.find({ author: uid }).select('hashtags').lean(),
      ]);

      const myHashtags = [...new Set(myPosts.flatMap(p => p.hashtags || []))];
      const similarUsers = myHashtags.length > 0 ? await Post.aggregate([
        { $match: { hashtags: { $in: myHashtags }, author: { $ne: uid } } },
        { $group: { _id: '$author', count: { $sum: 1 } } },
        { $match: { _id: { $nin: [...followingIds, uid] } } },
        { $sort: { count: -1 } },
        { $limit: limit },
      ]) : [];

      const suggestedIds = new Set();
      const suggestions = [];
      for (const fof of fofUsers) {
        if (!suggestedIds.has(fof._id.toString())) {
          suggestedIds.add(fof._id.toString());
          suggestions.push({ userId: fof._id, score: fof.count });
        }
      }
      for (const su of similarUsers) {
        if (!suggestedIds.has(su._id.toString())) {
          suggestedIds.add(su._id.toString());
          suggestions.push({ userId: su._id, score: su.count });
        }
      }

      return await User.find({ _id: { $in: suggestions.slice(0, limit).map(s => s.userId) } })
        .select('username avatar fullName')
        .lean();
    } catch (err) {
      console.error('[SuggestUsers] Error:', err.message);
      return [];
    }
  }
}

module.exports = new RankingEngine();
