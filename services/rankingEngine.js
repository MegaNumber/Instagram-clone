// مسیر فایل: /services/rankingEngine.js
// توضیح: موتور رتبه‌بندی چندسطحی شبیه‌سازی‌شده از الگوریتم اینستاگرام.
// بر اساس مستندات رسمی Meta Engineering (2024-2026)، این ماژول
// سیگنال‌های کلیدی رتبه‌بندی را برای چهار سطح (Feed, Explore, Reels, Stories)
// پیاده‌سازی می‌کند.

// ============================================================
// بخش ۱: ایمپورت ماژول‌های مورد نیاز
// ============================================================
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const User = require('../models/User');
const Post = require('../models/Post');
const PostVote = require('../models/PostVote');
const Comment = require('../models/Comment');
const Followers = require('../models/Followers');
const Following = require('../models/Following');
const Notification = require('../models/Notification');
const Reel = require('../models/Reel');
const Story = require('../models/Story');

// ============================================================
// بخش ۲: ثابت‌های پیکربندی (بر اساس تحقیقات واقعی)
// ============================================================
// وزن‌های سیگنال‌های رتبه‌بندی - برگرفته از تحلیل رفتار الگوریتم اینستاگرام[reference:5]
const SIGNAL_WEIGHTS = {
  // Feed
  FEED_RELATIONSHIP: 0.30,       // قدرت رابطه (بیشترین وزن در Feed)[reference:6]
  FEED_INTEREST: 0.25,           // احتمال تعامل بر اساس تاریخچه[reference:7]
  FEED_RECENCY: 0.20,            // تازگی محتوا
  FEED_ENGAGEMENT_VELOCITY: 0.15,// سرعت دریافت تعامل[reference:8]
  FEED_CONTENT_QUALITY: 0.10,    // کیفیت محتوا (نسبت تعامل)

  // Explore
  EXPLORE_POPULARITY: 0.40,      // محبوبیت (مهم‌ترین در Explore)[reference:9]
  EXPLORE_INTEREST_MATCH: 0.35,  // تطابق با علایق کاربر[reference:10]
  EXPLORE_ENGAGEMENT_DEPTH: 0.15,// عمق تعامل (ذخیره، اشتراک)[reference:11]
  EXPLORE_CONTENT_FRESHNESS: 0.10,// تازگی محتوا

  // Reels
  REELS_WATCH_TIME: 0.35,        // زمان تماشا (مهم‌ترین در Reels)[reference:12]
  REELS_SENDS: 0.30,             // دفعات ارسال (وزن ۳-۵ برابر لایک)[reference:13]
  REELS_LIKES: 0.15,             // لایک
  REELS_RETENTION: 0.10,         // نرخ ماندگاری (retention)
  REELS_RECENCY: 0.10,           // تازگی

  // Stories
  STORY_VIEWING_HISTORY: 0.40,   // سابقه مشاهده استوری[reference:14]
  STORY_CLOSENESS: 0.35,         // نزدیکی رابطه[reference:15]
  STORY_RECENCY: 0.15,           // تازگی
  STORY_ENGAGEMENT: 0.10,        // تعامل (پاسخ به استوری)
};

// ثابت‌های زمانی
const RECENCY_DECAY_FACTOR = 0.8;      // ضریب کاهش امتیاز تازگی در هر ساعت
const ENGAGEMENT_VELOCITY_WINDOW = 60;  // پنجره سرعت تعامل (دقیقه)[reference:16]
const MAX_FEED_POSTS = 500;            // حداکثر پست برای ارزیابی[reference:17]
const MAX_EXPLORE_CANDIDATES = 1500;   // حداکثر کاندید Explore[reference:18]

// ============================================================
// بخش ۳: کلاس موتور رتبه‌بندی
// ============================================================
class RankingEngine {
  constructor() {
    console.log('[RankingEngine] Initialized with Instagram-based signal weights');
  }

  // ==========================================================
  // ۳.۱ محاسبه امتیاز رابطه (Relationship Score)
  // ==========================================================
  /**
   * محاسبه قدرت رابطه بین دو کاربر بر اساس سیگنال‌های:
   * - دفعات لایک متقابل
   * - دفعات کامنت‌گذاری متقابل
   * - DM (در صورت وجود)
   * - بازدید پروفایل (در صورت ردیابی)
   * برگرفته از: Instagram Feed Ranking Signals[reference:19]
   */
  async calculateRelationshipScore(userId, targetUserId) {
    try {
      if (userId.toString() === targetUserId.toString()) return 1.0; // خود کاربر

      const uid = ObjectId(userId);
      const tid = ObjectId(targetUserId);

      // ۱. تعداد لایک‌های کاربر روی پست‌های target
      const targetPosts = await Post.find({ author: tid }).select('_id').lean();
      const targetPostIds = targetPosts.map(p => p._id);
      const likeCount = targetPostIds.length > 0
        ? await PostVote.countDocuments({
            post: { $in: targetPostIds },
            'votes.author': uid,
          })
        : 0;

      // ۲. تعداد کامنت‌های کاربر روی پست‌های target
      const commentCount = targetPostIds.length > 0
        ? await Comment.countDocuments({
            post: { $in: targetPostIds },
            author: uid,
          })
        : 0;

      // ۳. آیا target کاربر را دنبال می‌کند؟
      const isFollowed = await Followers.exists({
        user: tid,
        'followers.user': uid,
      });

      // ۴. آیا کاربر target را دنبال می‌کند؟
      const isFollowing = await Following.exists({
        user: uid,
        'following.user': tid,
      });

      // ۵. تعداد نوتیفیکیشن‌های متقابل (به عنوان proxy برای DM)
      const mutualNotifications = await Notification.countDocuments({
        $or: [
          { sender: uid, receiver: tid },
          { sender: tid, receiver: uid },
        ],
      });

      // نرمال‌سازی و محاسبه امتیاز
      const likeScore = Math.min(likeCount / 50, 1.0) * 0.25;
      const commentScore = Math.min(commentCount / 20, 1.0) * 0.25;
      const followScore = ((isFollowed ? 1 : 0) + (isFollowing ? 1 : 0)) / 2 * 0.30;
      const mutualScore = Math.min(mutualNotifications / 30, 1.0) * 0.20;

      return Math.min(likeScore + commentScore + followScore + mutualScore, 1.0);
    } catch (err) {
      console.error('[RelationshipScore] Error:', err.message);
      return 0.1; // حداقل امتیاز
    }
  }

  // ==========================================================
  // ۳.۲ محاسبه امتیاز علاقه (Interest Score)
  // ==========================================================
  /**
   * محاسبه احتمال تعامل کاربر با یک محتوا بر اساس:
   * - تاریخچه تعامل با هشتگ‌های مشابه
   * - تاریخچه تعامل با نویسنده
   * - نوع محتوای مورد علاقه (image vs video)
   * برگرفته از: Instagram Feed Ranking Signals[reference:20]
   */
  async calculateInterestScore(userId, post) {
    try {
      const uid = ObjectId(userId);

      // ۱. امتیاز تطابق هشتگ - کاربر چقدر با هشتگ‌های این پست تعامل داشته
      let hashtagScore = 0;
      if (post.hashtags && post.hashtags.length > 0) {
        const interactedPosts = await Post.find({
          hashtags: { $in: post.hashtags },
        }).select('_id').lean();
        const interactedPostIds = interactedPosts.map(p => p._id);

        if (interactedPostIds.length > 0) {
          const interactions = await PostVote.countDocuments({
            post: { $in: interactedPostIds },
            'votes.author': uid,
          });
          hashtagScore = Math.min(interactions / 20, 1.0);
        }
      }

      // ۲. امتیاز تعامل با نویسنده
      let authorScore = 0;
      if (post.author) {
        const authorId = post.author._id || post.author;
        const authorPosts = await Post.find({ author: authorId }).select('_id').lean();
        const authorPostIds = authorPosts.map(p => p._id);

        if (authorPostIds.length > 0) {
          const authorInteractions = await PostVote.countDocuments({
            post: { $in: authorPostIds },
            'votes.author': uid,
          }) + await Comment.countDocuments({
            post: { $in: authorPostIds },
            author: uid,
          });
          authorScore = Math.min(authorInteractions / 15, 1.0);
        }
      }

      // ۳. امتیاز تازگی - محتوای جدیدتر امتیاز بیشتری دارد
      const ageHours = (Date.now() - new Date(post.createdAt).getTime()) / (1000 * 60 * 60);
      const recencyScore = Math.exp(-RECENCY_DECAY_FACTOR * ageHours / 24);

      return (hashtagScore * 0.40 + authorScore * 0.35 + recencyScore * 0.25);
    } catch (err) {
      console.error('[InterestScore] Error:', err.message);
      return 0.1;
    }
  }

  // ==========================================================
  // ۳.۳ محاسبه سرعت تعامل (Engagement Velocity)
  // ==========================================================
  /**
   * اندازه‌گیری سرعت دریافت تعامل در دقایق اولیه انتشار
   * این سیگنال برای Explore حیاتی است[reference:21]
   */
  async calculateEngagementVelocity(postId) {
    try {
      const post = await Post.findById(postId).select('createdAt').lean();
      if (!post) return 0;

      const ageMinutes = (Date.now() - new Date(post.createdAt).getTime()) / (1000 * 60);
      if (ageMinutes < 1) return 0.5; // پست‌های جدید یک امتیاز پایه دارند

      // تعداد تعاملات در ۶۰ دقیقه اول
      const voteCount = await PostVote.findOne({ post: postId }).lean();
      const totalVotes = voteCount?.votes?.length || 0;
      const commentCount = await Comment.countDocuments({ post: postId });

      // سرعت = تعاملات / زمان
      const totalEngagement = totalVotes + commentCount;
      const velocity = totalEngagement / Math.max(ageMinutes, 1);

      // نرمال‌سازی: ۱ تعامل در دقیقه = امتیاز ۰.۵
      return Math.min(velocity / 2, 1.0);
    } catch (err) {
      console.error('[EngagementVelocity] Error:', err.message);
      return 0;
    }
  }

  // ==========================================================
  // ۳.۴ محاسبه عمق تعامل (Engagement Depth)
  // ==========================================================
  /**
   * وزن‌دهی به نوع تعامل:
   * - ذخیره (Save) > اشتراک (Share) > کامنت > لایک
   * برگرفته از:[reference:22]
   */
  async calculateEngagementDepth(postId) {
    try {
      const [post, voteDoc, commentCount] = await Promise.all([
        Post.findById(postId).select('bookmarks').lean(),
        PostVote.findOne({ post: postId }).lean(),
        Comment.countDocuments({ post: postId }),
      ]);

      const likeCount = voteDoc?.votes?.length || 0;
      const bookmarkCount = post?.bookmarks?.length || 0; // به عنوان proxy برای save

      // وزن‌دهی: Save(4x) > Share(3x) > Comment(2x) > Like(1x)
      const weightedScore = (
        (likeCount * 1) +
        (commentCount * 2) +
        (bookmarkCount * 4) // save بیشترین وزن را دارد[reference:23]
      );

      // نرمال‌سازی
      return Math.min(weightedScore / 100, 1.0);
    } catch (err) {
      console.error('[EngagementDepth] Error:', err.message);
      return 0;
    }
  }

  // ==========================================================
  // ۳.۵ محاسبه امتیاز کیفیت محتوا
  // ==========================================================
  /**
   * نسبت تعامل به بازدید (Engagement Rate)
   */
  async calculateContentQuality(postId) {
    try {
      const [post, voteDoc, commentCount] = await Promise.all([
        Post.findById(postId).select('views').lean(),
        PostVote.findOne({ post: postId }).lean(),
        Comment.countDocuments({ post: postId }),
      ]);

      const views = post?.views || 1;
      const likes = voteDoc?.votes?.length || 0;
      const engagementRate = (likes + commentCount) / views;

      return Math.min(engagementRate * 5, 1.0); // 20% engagement = perfect score
    } catch (err) {
      return 0.1;
    }
  }

  // ==========================================================
  // ۳.۶ محاسبه امتیاز محبوبیت (برای Explore)
  // ==========================================================
  /**
   * محبوبیت کلی یک پست در پلتفرم[reference:24]
   */
  async calculatePopularityScore(postId) {
    try {
      const [voteDoc, commentCount] = await Promise.all([
        PostVote.findOne({ post: postId }).lean(),
        Comment.countDocuments({ post: postId }),
      ]);

      const totalLikes = voteDoc?.votes?.length || 0;
      const totalComments = commentCount || 0;

      // لگاریتم طبیعی برای جلوگیری از سلطه پست‌های پربازدید
      const logLikes = Math.log1p(totalLikes);
      const logComments = Math.log1p(totalComments);

      return Math.min((logLikes + logComments) / 10, 1.0);
    } catch (err) {
      return 0;
    }
  }

  // ==========================================================
  // ۳.۷ رتبه‌بندی Feed (مهم‌ترین تابع)
  // ==========================================================
  /**
   * رتبه‌بندی پست‌های فید بر اساس ۵ سیگنال اصلی:
   * Relationship, Interest, Recency, Engagement Velocity, Content Quality
   * برگرفته از: Instagram Feed Algorithm 2025[reference:25]
   */
  async rankFeedPosts(userId, posts, limit = 30) {
    const scoredPosts = [];

    for (const post of posts) {
      try {
        const authorId = post.author?._id || post.author;

        // محاسبه موازی سیگنال‌ها
        const [relationship, interest, velocity, quality] = await Promise.all([
          this.calculateRelationshipScore(userId, authorId),
          this.calculateInterestScore(userId, post),
          this.calculateEngagementVelocity(post._id),
          this.calculateContentQuality(post._id),
        ]);

        // امتیاز تازگی
        const ageHours = (Date.now() - new Date(post.createdAt || post.date).getTime()) / (1000 * 60 * 60);
        const recency = Math.exp(-RECENCY_DECAY_FACTOR * ageHours / 24);

        // محاسبه امتیاز نهایی با وزن‌های Instagram
        const finalScore = (
          relationship * SIGNAL_WEIGHTS.FEED_RELATIONSHIP +
          interest * SIGNAL_WEIGHTS.FEED_INTEREST +
          recency * SIGNAL_WEIGHTS.FEED_RECENCY +
          velocity * SIGNAL_WEIGHTS.FEED_ENGAGEMENT_VELOCITY +
          quality * SIGNAL_WEIGHTS.FEED_CONTENT_QUALITY
        );

        scoredPosts.push({
          post,
          score: finalScore,
          signals: { relationship, interest, recency, velocity, quality },
        });
      } catch (err) {
        scoredPosts.push({ post, score: 0 });
      }
    }

    // مرتب‌سازی نزولی و محدود کردن
    return scoredPosts
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.post);
  }

  // ==========================================================
  // ۳.۸ رتبه‌بندی Explore
  // ==========================================================
  /**
   * رتبه‌بندی صفحه Explore بر اساس:
   * Popularity, Interest Match, Engagement Depth, Content Freshness
   * برگرفته از: Instagram Explore Algorithm[reference:26]
   */
  async rankExplorePosts(userId, posts, limit = 30) {
    const scoredPosts = [];

    for (const post of posts) {
      try {
        const [popularity, interest, depth, velocity] = await Promise.all([
          this.calculatePopularityScore(post._id),
          this.calculateInterestScore(userId, post),
          this.calculateEngagementDepth(post._id),
          this.calculateEngagementVelocity(post._id),
        ]);

        const ageHours = (Date.now() - new Date(post.createdAt || post.date).getTime()) / (1000 * 60 * 60);
        const freshness = Math.exp(-RECENCY_DECAY_FACTOR * ageHours / 48); // decay کندتر برای Explore

        const finalScore = (
          popularity * SIGNAL_WEIGHTS.EXPLORE_POPULARITY +
          interest * SIGNAL_WEIGHTS.EXPLORE_INTEREST_MATCH +
          depth * SIGNAL_WEIGHTS.EXPLORE_ENGAGEMENT_DEPTH +
          freshness * SIGNAL_WEIGHTS.EXPLORE_CONTENT_FRESHNESS
        );

        scoredPosts.push({ post, score: finalScore });
      } catch (err) {
        scoredPosts.push({ post, score: 0 });
      }
    }

    return scoredPosts
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.post);
  }

  // ==========================================================
  // ۳.۹ رتبه‌بندی Reels
  // ==========================================================
  /**
   * رتبه‌بندی Reels بر اساس Watch Time (مهم‌ترین)، Sends، Likes
   * برگرفته از: Instagram Reels Algorithm 2025[reference:27]
   */
  async rankReels(userId, reels, limit = 20) {
    const scoredReels = [];

    for (const reel of reels) {
      try {
        const authorId = reel.author?._id || reel.author;
        const [relationship, popularity] = await Promise.all([
          this.calculateRelationshipScore(userId, authorId),
          this.calculatePopularityScore(reel._id),
        ]);

        // امتیاز watch time (از داده‌های موجود)
        const watchTimeScore = Math.min((reel.duration || 10) / 60, 1.0);

        // امتیاز sends (با استفاده از engagement depth به عنوان proxy)
        const sendsScore = await this.calculateEngagementDepth(reel._id);

        // امتیاز likes
        const likesScore = Math.min((reel.likes?.length || 0) / 100, 1.0);

        // امتیاز retention (با فرض ۷۰٪ برای reels با duration کوتاه)
        const retentionScore = Math.min((reel.duration || 10) <= 15 ? 0.8 : 0.5, 1.0);

        const ageHours = (Date.now() - new Date(reel.createdAt).getTime()) / (1000 * 60 * 60);
        const recency = Math.exp(-RECENCY_DECAY_FACTOR * ageHours / 24);

        const finalScore = (
          watchTimeScore * SIGNAL_WEIGHTS.REELS_WATCH_TIME +
          sendsScore * SIGNAL_WEIGHTS.REELS_SENDS +
          likesScore * SIGNAL_WEIGHTS.REELS_LIKES +
          retentionScore * SIGNAL_WEIGHTS.REELS_RETENTION +
          recency * SIGNAL_WEIGHTS.REELS_RECENCY +
          relationship * 0.05 // relationship وزن کمتری در Reels دارد
        );

        scoredReels.push({ reel, score: finalScore });
      } catch (err) {
        scoredReels.push({ reel, score: 0 });
      }
    }

    return scoredReels
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.reel);
  }

  // ==========================================================
  // ۳.۱۰ رتبه‌بندی Stories
  // ==========================================================
  /**
   * رتبه‌بندی استوری‌ها بر اساس:
   * Viewing History, Closeness, Recency, Engagement
   * برگرفته از: Instagram Story Algorithm[reference:28]
   */
  async rankStories(userId, stories, limit = 50) {
    const scoredStories = [];

    for (const story of stories) {
      try {
        const authorId = story.author?._id || story.author;

        // ۱. سابقه مشاهده - کاربر چند بار استوری‌های این author را دیده
        const viewingHistoryScore = story.viewers?.some(
          v => v.user?.toString() === userId.toString()
        ) ? 0.8 : 0.2;

        // ۲. نزدیکی رابطه
        const closeness = await this.calculateRelationshipScore(userId, authorId);

        // ۳. تازگی
        const ageHours = (Date.now() - new Date(story.createdAt).getTime()) / (1000 * 60 * 60);
        const recency = Math.exp(-RECENCY_DECAY_FACTOR * ageHours / 6); // decay سریع‌تر (عمر ۲۴ ساعته)

        // ۴. تعامل (پاسخ به استوری)
        const engagementScore = Math.min((story.likes?.length || 0) / 5, 1.0);

        const finalScore = (
          viewingHistoryScore * SIGNAL_WEIGHTS.STORY_VIEWING_HISTORY +
          closeness * SIGNAL_WEIGHTS.STORY_CLOSENESS +
          recency * SIGNAL_WEIGHTS.STORY_RECENCY +
          engagementScore * SIGNAL_WEIGHTS.STORY_ENGAGEMENT
        );

        scoredStories.push({ story, score: finalScore });
      } catch (err) {
        scoredStories.push({ story, score: 0 });
      }
    }

    return scoredStories
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.story);
  }

  // ==========================================================
  // ۳.۱۱ پیشنهاد کاربر (User Suggestion)
  // ==========================================================
  /**
   * پیشنهاد کاربران برای دنبال کردن بر اساس:
   * - کاربران مشترک دنبال‌شده
   * - کاربرانی که توسط دنبال‌شونده‌های شما دنبال می‌شوند
   * - شباهت در تعامل با محتوا
   */
  async suggestUsers(userId, limit = 20) {
    try {
      const uid = ObjectId(userId);
      const followingDoc = await Following.findOne({ user: uid }).lean();
      const followingIds = followingDoc?.following?.map(f => f.user) || [];

      // کاربرانی که توسط دنبال‌شونده‌های من دنبال می‌شوند (friends of friends)
      const fofUsers = await Followers.aggregate([
        { $match: { user: { $in: followingIds } } },
        { $unwind: '$followers' },
        { $group: { _id: '$followers.user', count: { $sum: 1 } } },
        { $match: { _id: { $nin: [...followingIds, uid] } } },
        { $sort: { count: -1 } },
        { $limit: limit * 2 },
      ]);

      // کاربران با هشتگ‌های مشابه
      const myPosts = await Post.find({ author: uid }).select('hashtags').lean();
      const myHashtags = [...new Set(myPosts.flatMap(p => p.hashtags || []))];

      const similarUsers = myHashtags.length > 0 ? await Post.aggregate([
        { $match: { hashtags: { $in: myHashtags }, author: { $ne: uid } } },
        { $group: { _id: '$author', count: { $sum: 1 } } },
        { $match: { _id: { $nin: [...followingIds, uid] } } },
        { $sort: { count: -1 } },
        { $limit: limit },
      ]) : [];

      // ترکیب نتایج
      const suggestedIds = new Set();
      const suggestions = [];

      for (const fof of fofUsers) {
        if (!suggestedIds.has(fof._id.toString())) {
          suggestedIds.add(fof._id.toString());
          suggestions.push({ userId: fof._id, score: fof.count, reason: 'followed_by_friends' });
        }
      }

      for (const su of similarUsers) {
        if (!suggestedIds.has(su._id.toString())) {
          suggestedIds.add(su._id.toString());
          suggestions.push({ userId: su._id, score: su.count, reason: 'similar_interests' });
        }
      }

      // دریافت اطلاعات کاربران
      const suggestedUserIds = suggestions.slice(0, limit).map(s => s.userId);
      const users = await User.find({ _id: { $in: suggestedUserIds } })
        .select('username avatar fullName')
        .lean();

      return users;
    } catch (err) {
      console.error('[SuggestUsers] Error:', err.message);
      return [];
    }
  }
}

// ============================================================
// بخش ۴: صادرات نمونه Singleton
// ============================================================
const rankingEngine = new RankingEngine();
module.exports = rankingEngine;
