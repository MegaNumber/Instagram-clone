// مسیر فایل: /controllers/storyController.js
// توضیح: کنترلر مدیریت استوری‌ها. این فایل منطق ایجاد، دریافت،
// ثبت بازدید، لایک و حذف استوری‌ها را مدیریت می‌کند.

const Story = require('../models/Story');
const asyncHandler = require('../utils/asyncHandler');
const fs = require('fs').promises;
const path = require('path');

// ============================================================
// بخش ۱: ایجاد استوری جدید
// ============================================================
module.exports.createStory = asyncHandler(async (req, res) => {
  const user = res.locals.user;

  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'لطفاً یک تصویر یا ویدیو برای استوری انتخاب کنید.',
    });
  }

  const mediaUrl = '/uploads/stories/' + req.file.filename;
  const mediaType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';

  const story = await Story.create({
    author: user._id,
    mediaUrl,
    mediaType,
    caption: req.body.caption || '',
  });

  await story.populate('author', 'username avatar');

  res.status(201).json({
    success: true,
    data: story,
  });
});

// ============================================================
// بخش ۲: دریافت استوری‌های کاربران دنبال‌شده (Feed)
// ============================================================
module.exports.getStoryFeed = asyncHandler(async (req, res) => {
  const user = res.locals.user;
  const Following = require('../models/Following');

  const followingDoc = await Following.findOne({ user: user._id }).lean();
  const followingIds = followingDoc
    ? followingDoc.following.map((f) => f.user)
    : [];
  followingIds.push(user._id); // استوری‌های خود کاربر هم نمایش داده شود

  const stories = await Story.find({
    author: { $in: followingIds },
  })
    .populate('author', 'username avatar')
    .sort({ createdAt: -1 })
    .lean();

  // گروه‌بندی بر اساس نویسنده
  const grouped = {};
  stories.forEach((story) => {
    const authorId = story.author._id.toString();
    if (!grouped[authorId]) {
      grouped[authorId] = {
        user: story.author,
        stories: [],
        hasNewStory: false,
      };
    }
    // بررسی اینکه کاربر فعلی این استوری را دیده یا نه
    const isViewed = story.viewers?.some(
      (v) => v.user?.toString() === user._id.toString()
    );
    grouped[authorId].stories.push(story);
    if (!isViewed) grouped[authorId].hasNewStory = true;
  });

  res.status(200).json({
    success: true,
    data: Object.values(grouped),
  });
});

// ============================================================
// بخش ۳: ثبت بازدید استوری
// ============================================================
module.exports.viewStory = asyncHandler(async (req, res) => {
  const { storyId } = req.params;
  const user = res.locals.user;

  const story = await Story.findById(storyId);
  if (!story) {
    return res.status(404).json({
      success: false,
      error: 'استوری مورد نظر یافت نشد.',
    });
  }

  // اگر قبلاً بازدید نکرده، اضافه کن
  const alreadyViewed = story.viewers.some(
    (v) => v.user.toString() === user._id.toString()
  );
  if (!alreadyViewed) {
    story.viewers.push({ user: user._id });
    await story.save();
  }

  res.status(200).json({
    success: true,
    message: 'بازدید ثبت شد.',
  });
});

// ============================================================
// بخش ۴: لایک استوری
// ============================================================
module.exports.likeStory = asyncHandler(async (req, res) => {
  const { storyId } = req.params;
  const user = res.locals.user;

  const story = await Story.findById(storyId);
  if (!story) {
    return res.status(404).json({
      success: false,
      error: 'استوری مورد نظر یافت نشد.',
    });
  }

  const alreadyLiked = story.likes.some(
    (l) => l.user.toString() === user._id.toString()
  );

  if (alreadyLiked) {
    story.likes = story.likes.filter(
      (l) => l.user.toString() !== user._id.toString()
    );
    await story.save();
    return res.status(200).json({
      success: true,
      operation: 'unlike',
    });
  }

  story.likes.push({ user: user._id });
  await story.save();

  res.status(200).json({
    success: true,
    operation: 'like',
  });
});

// ============================================================
// بخش ۵: حذف استوری
// ============================================================
module.exports.deleteStory = asyncHandler(async (req, res) => {
  const { storyId } = req.params;
  const user = res.locals.user;

  const story = await Story.findOne({ _id: storyId, author: user._id });
  if (!story) {
    return res.status(404).json({
      success: false,
      error: 'استوری مورد نظر یافت نشد.',
    });
  }

  // حذف فایل از سرور
  try {
    const filePath = path.join(__dirname, '..', 'public', story.mediaUrl);
    await fs.unlink(filePath).catch(() => {});
  } catch (err) {
    console.log('خطا در حذف فایل استوری:', err.message);
  }

  await Story.deleteOne({ _id: storyId });

  res.status(200).json({
    success: true,
    message: 'استوری با موفقیت حذف شد.',
  });
});

// ============================================================
// بخش ۶: دریافت استوری‌های یک کاربر خاص
// ============================================================
module.exports.getUserStories = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const stories = await Story.find({ author: userId })
    .populate('author', 'username avatar')
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({
    success: true,
    data: stories,
  });
});

module.exports = exports;
