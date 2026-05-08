// مسیر فایل: /services/contentCategorizer.js
// توضیح: سرویس دسته‌بندی خودکار محتوا بر اساس هشتگ‌ها و کپشن.
// اینستاگرام از topic clustering برای ۹-۱۲ پست آخر استفاده می‌کند[reference:29]

// ============================================================
// بخش ۱: نگاشت هشتگ به دسته‌بندی‌های موضوعی
// ============================================================
const TOPIC_MAPPING = {
  technology: ['tech', 'programming', 'coding', 'developer', 'software', 'ai', 'ml', 'javascript', 'python', 'react', 'nodejs'],
  photography: ['photography', 'photo', 'photooftheday', 'camera', 'landscape', 'portrait', 'naturephotography'],
  food: ['food', 'foodie', 'cooking', 'recipe', 'delicious', 'homemade', 'bakery', 'restaurant'],
  fitness: ['fitness', 'workout', 'gym', 'exercise', 'health', 'training', 'bodybuilding', 'yoga'],
  travel: ['travel', 'wanderlust', 'adventure', 'explore', 'vacation', 'trip', 'nature'],
  fashion: ['fashion', 'style', 'outfit', 'clothing', 'designer', 'beauty', 'makeup'],
  music: ['music', 'song', 'musician', 'guitar', 'piano', 'concert', 'singer', 'rap'],
  art: ['art', 'drawing', 'sketch', 'painting', 'digitalart', 'illustration', 'design'],
  sports: ['sports', 'football', 'soccer', 'basketball', 'baseball', 'tennis', 'running'],
  lifestyle: ['lifestyle', 'life', 'motivation', 'inspiration', 'daily', 'vlog'],
};

/**
 * دسته‌بندی پست بر اساس هشتگ‌ها
 */
function categorizeByHashtags(hashtags = []) {
  const scores = {};
  for (const [topic, keywords] of Object.entries(TOPIC_MAPPING)) {
    scores[topic] = hashtags.filter(h => keywords.includes(h.toLowerCase())).length;
  }
  const topTopic = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return topTopic && topTopic[1] > 0 ? topTopic[0] : 'general';
}

/**
 * دریافت topic cluster کاربر (بر اساس ۱۲ پست آخر)
 */
async function getUserTopicCluster(userId) {
  const Post = require('../models/Post');
  const posts = await Post.find({ author: userId })
    .sort({ createdAt: -1 })
    .limit(12)
    .select('hashtags')
    .lean();

  const topicCounts = {};
  posts.forEach(post => {
    const topic = categorizeByHashtags(post.hashtags || []);
    topicCounts[topic] = (topicCounts[topic] || 0) + 1;
  });

  return Object.entries(topicCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'general';
}

module.exports = { categorizeByHashtags, getUserTopicCluster, TOPIC_MAPPING };
