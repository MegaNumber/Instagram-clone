// مسیر فایل: /controllers/storyController.js
// توضیح: کنترلر مدیریت استوری‌ها. ایجاد، دریافت فید، مشاهده، لایک، حذف
// و دریافت استوری‌های یک کاربر. استوری‌های منقضی‌شده (بیش از ۲۴ ساعت)
// به‌طور خودکار از دیتابیس و فایل‌سیستم حذف می‌شوند و در کوئری‌ها
// نیز فیلتر می‌شوند. برای ویدئوها thumbnail با ffmpeg تولید می‌شود.
//
// @version 2.5.0
// @since 2026

const Story = require('../models/Story');
const asyncHandler = require('../utils/asyncHandler');
const storageService = require('../utils/storage');
const { saveUploadedFile } = require('../utils/fileUpload');
const { generateVideoThumbnail } = require('../utils/ffmpeg-utils');
const path = require('path');

// ============================================================
// بخش ۱: ایجاد استوری
// ============================================================
module.exports.createStory = asyncHandler(async (req, res) => {
  const user = res.locals.user;
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'فایلی برای استوری انتخاب نشده است.' });
  }

  const folder = req.file.mimetype.startsWith('video/') ? 'uploads/stories/videos' : 'uploads/stories/images';
  const mediaUrl = await saveUploadedFile(req.file, folder, 'story');
  const mediaType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';

  let thumbnailUrl = '';
  let duration = 0;
  // تولید بندانگشتی برای ویدئوها
  if (mediaType === 'video') {
    try {
      const fullVideoPath = path.join(storageService.basePath, mediaUrl);
      const thumbFilename = storageService.StorageService.uniqueFilename(req.file.originalname, 'story_thumb');
      const thumbFullPath = path.join(storageService.basePath, 'uploads/stories/thumbnails', thumbFilename);
      await generateVideoThumbnail(fullVideoPath, thumbFullPath);
      thumbnailUrl = '/uploads/stories/thumbnails/' + thumbFilename;
      // دریافت مدت زمان ویدئو (اختیاری)
      const { getVideoDuration } = require('../utils/ffmpeg-utils');
      duration = await getVideoDuration(fullVideoPath).catch(() => 0);
    } catch (err) {
      console.error('[Story] Thumbnail generation failed:', err.message);
    }
  }

  const story = await Story.create({
    author: user._id,
    mediaUrl,
    mediaType,
    thumbnailUrl,
    duration: Math.round(duration || 0),
    caption: req.body.caption || '',
  });

  await story.populate('author', 'username avatar');
  res.status(201).json({ success: true, data: story });
});

// ============================================================
// بخش ۲: دریافت فید استوری (فقط استوری‌های فعال)
// ============================================================
module.exports.getStoryFeed = asyncHandler(async (req, res) => {
  const user = res.locals.user;

  // دریافت لیست دنبال‌شونده‌ها
  const Following = require('../models/Following');
  const followingDoc = await Following.findOne({ user: user._id }).lean();
  const followingIds = followingDoc ? followingDoc.following.map(f => f.user) : [];
  if (!followingIds.includes(user._id.toString())) {
    followingIds.push(user._id); // استوری‌های خود کاربر هم نمایش داده شود
  }

  // فقط استوری‌های فعال (منقضی‌نشده)
  const stories = await Story.find({
    author: { $in: followingIds },
    expiresAt: { $gt: new Date() }, // فقط فعال‌ها
  })
    .populate('author', 'username avatar')
    .sort({ createdAt: -1 })
    .lean();

  // گروه‌بندی بر اساس نویسنده
  const grouped = {};
  stories.forEach(story => {
    const authorId = story.author._id.toString();
    if (!grouped[authorId]) {
      grouped[authorId] = { user: story.author, stories: [], hasNewStory: false };
    }
    const isViewed = story.viewers?.some(v => v.user?.toString() === user._id.toString());
    grouped[authorId].stories.push(story);
    if (!isViewed) grouped[authorId].hasNewStory = true;
  });

  res.status(200).json({ success: true, data: Object.values(grouped) });
});

// ============================================================
// بخش ۳: ثبت بازدید
// ============================================================
module.exports.viewStory = asyncHandler(async (req, res) => {
  const { storyId } = req.params;
  const user = res.locals.user;

  const story = await Story.findById(storyId).select('_id expiresAt');
  if (!story) {
    return res.status(404).json({ success: false, error: 'استوری یافت نشد.' });
  }

  // فقط استوری‌های فعال قابل بازدید هستند
  if (story.expiresAt <= new Date()) {
    return res.status(410).json({ success: false, error: 'این استوری منقضی شده است.' });
  }

  const added = await Story.viewStory(storyId, user._id);
  res.status(200).json({ success: true, isNewView: added });
});

// ============================================================
// بخش ۴: لایک / آنلایک استوری
// ============================================================
module.exports.likeStory = asyncHandler(async (req, res) => {
  const { storyId } = req.params;
  const user = res.locals.user;

  const story = await Story.findById(storyId).select('likes expiresAt');
  if (!story) {
    return res.status(404).json({ success: false, error: 'استوری یافت نشد.' });
  }
  if (story.expiresAt <= new Date()) {
    return res.status(410).json({ success: false, error: 'این استوری منقضی شده است.' });
  }

  const idx = story.likes.findIndex(l => l.user.toString() === user._id.toString());
  if (idx === -1) {
    story.likes.push({ user: user._id });
    await story.save();
    return res.status(200).json({ success: true, operation: 'like' });
  } else {
    story.likes.splice(idx, 1);
    await story.save();
    return res.status(200).json({ success: true, operation: 'unlike' });
  }
});

// ============================================================
// بخش ۵: حذف استوری
// ============================================================
module.exports.deleteStory = asyncHandler(async (req, res) => {
  const { storyId } = req.params;
  const user = res.locals.user;

  const story = await Story.findOne({ _id: storyId, author: user._id });
  if (!story) {
    return res.status(404).json({ success: false, error: 'استوری یافت نشد.' });
  }

  // حذف فایل‌ها
  await Promise.allSettled([
    storageService.deleteFile(story.mediaUrl),
    story.thumbnailUrl ? storageService.deleteFile(story.thumbnailUrl) : Promise.resolve(),
  ]);

  await Story.deleteOne({ _id: storyId });
  res.status(200).json({ success: true, message: 'استوری با موفقیت حذف شد.' });
});

// ============================================================
// بخش ۶: دریافت استوری‌های یک کاربر (فقط فعال)
// ============================================================
module.exports.getUserStories = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const stories = await Story.find({
    author: userId,
    expiresAt: { $gt: new Date() },
  })
    .populate('author', 'username avatar')
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({ success: true, data: stories });
});

module.exports = exports;
