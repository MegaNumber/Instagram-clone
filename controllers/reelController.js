// مسیر فایل: /controllers/reelController.js
// توضیح: کنترلر مدیریت ریلز (Reels) – ویدئوهای کوتاه مشابه اینستاگرام.
// شامل ایجاد، دریافت فید، مشاهده، لایک/آنلایک، و حذف ریلز.
// از سرویس ذخیره‌سازی یکپارچه، پردازش ویدئو با ffmpeg، و متدهای
// استاتیک مدل Reel برای عملیات‌های مکرر استفاده می‌کند.
//
// @version 2.5.0
// @since 2026

const Reel = require('../models/Reel');
const asyncHandler = require('../utils/asyncHandler');
const storageService = require('../utils/storage');
const { saveUploadedFile } = require('../utils/fileUpload');
const { generateVideoThumbnail, getVideoDuration } = require('../utils/ffmpeg-utils');
const path = require('path');
const linkify = require('linkifyjs');
require('linkifyjs/plugins/hashtag')(linkify);

// ============================================================
// بخش ۱: ایجاد ریلز جدید
// ============================================================
module.exports.createReel = asyncHandler(async (req, res) => {
  const user = res.locals.user;
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'ویدیویی انتخاب نشده است.' });
  }

  // ذخیره ویدئو
  const videoUrl = await saveUploadedFile(req.file, 'uploads/videos', 'reel');
  const videoFullPath = path.join(storageService.basePath, videoUrl);

  // تولید thumbnail
  const thumbFilename = storageService.StorageService.uniqueFilename(req.file.originalname, 'thumb');
  const thumbFullPath = path.join(storageService.basePath, 'uploads/thumbnails', thumbFilename);
  let thumbnailUrl = '';
  let duration = 0;

  try {
    await generateVideoThumbnail(videoFullPath, thumbFullPath);
    thumbnailUrl = '/uploads/thumbnails/' + thumbFilename;
    duration = await getVideoDuration(videoFullPath);
  } catch (err) {
    console.error('[Reel] Thumbnail generation failed:', err.message);
  }

  // استخراج هشتگ‌ها از کپشن
  const hashtags = [];
  linkify.find(req.body.caption || '').forEach((result) => {
    if (result.type === 'hashtag') {
      hashtags.push(result.value.substring(1).toLowerCase());
    }
  });

  const reel = await Reel.create({
    author: user._id,
    videoUrl,
    thumbnailUrl,
    caption: req.body.caption || '',
    hashtags: [...new Set(hashtags)],
    duration: Math.round(duration || 0),
  });

  await reel.populate('author', 'username avatar');

  res.status(201).json({
    success: true,
    data: reel,
  });
});

// ============================================================
// بخش ۲: دریافت فید ریلز (همهٔ ریلزها با صفحه‌بندی)
// ============================================================
module.exports.getReelFeed = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(30, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const skip = (page - 1) * limit;

  const [reels, total] = await Promise.all([
    Reel.find()
      .populate('author', 'username avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Reel.countDocuments(),
  ]);

  res.status(200).json({
    success: true,
    data: reels,
    pagination: {
      page,
      limit,
      total,
      hasMore: skip + limit < total,
    },
  });
});

// ============================================================
// بخش ۳: دریافت یک ریلز خاص (و افزایش بازدید)
// ============================================================
module.exports.getReel = asyncHandler(async (req, res) => {
  const { reelId } = req.params;

  // استفاده از متد استاتیک مدل برای افزایش بازدید
  const updatedReel = await Reel.incrementViews(reelId);
  if (!updatedReel) {
    return res.status(404).json({ success: false, error: 'ریلز یافت نشد.' });
  }

  // دریافت کامل اطلاعات
  const reel = await Reel.findById(reelId).populate('author', 'username avatar');
  if (!reel) {
    return res.status(404).json({ success: false, error: 'ریلز یافت نشد.' });
  }

  res.status(200).json({
    success: true,
    data: reel,
  });
});

// ============================================================
// بخش ۴: لایک / آنلایک ریلز
// ============================================================
module.exports.likeReel = asyncHandler(async (req, res) => {
  const { reelId } = req.params;
  const user = res.locals.user;

  const reel = await Reel.findById(reelId).select('likes');
  if (!reel) {
    return res.status(404).json({ success: false, error: 'ریلز یافت نشد.' });
  }

  // منطق toggle لایک (با اعتبارسنجی یکتایی که در مدل تعریف شده)
  const idx = reel.likes.findIndex((id) => id.toString() === user._id.toString());
  let operation;

  if (idx === -1) {
    reel.likes.push(user._id);
    operation = 'like';
  } else {
    reel.likes.splice(idx, 1);
    operation = 'unlike';
  }

  await reel.save();

  res.status(200).json({
    success: true,
    operation,
    likeCount: reel.likes.length,
  });
});

// ============================================================
// بخش ۵: حذف ریلز
// ============================================================
module.exports.deleteReel = asyncHandler(async (req, res) => {
  const { reelId } = req.params;
  const user = res.locals.user;

  const reel = await Reel.findOne({ _id: reelId, author: user._id });
  if (!reel) {
    return res.status(404).json({ success: false, error: 'ریلز یافت نشد یا شما مجاز به حذف آن نیستید.' });
  }

  // حذف فایل‌های مرتبط
  await Promise.allSettled([
    storageService.deleteFile(reel.videoUrl),
    reel.thumbnailUrl ? storageService.deleteFile(reel.thumbnailUrl) : Promise.resolve(),
  ]);

  await Reel.deleteOne({ _id: reelId });

  res.status(200).json({ success: true, message: 'ریلز با موفقیت حذف شد.' });
});

module.exports = exports;
