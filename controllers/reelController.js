// مسیر فایل: /controllers/reelController.js
// توضیح: کنترلر مدیریت Reel (ویدیوهای کوتاه مانند اینستاگرام).

const Reel = require('../models/Reel');
const asyncHandler = require('../utils/asyncHandler');
const { generateVideoThumbnail, getVideoDuration } = require('../utils/ffmpeg-utils');
const { extractHashtags } = require('../utils/controllerUtils');
const fs = require('fs').promises;
const path = require('path');

// ============================================================
// بخش ۱: ایجاد Reel جدید
// ============================================================
module.exports.createReel = asyncHandler(async (req, res) => {
  const user = res.locals.user;
  const { caption } = req.body;

  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'لطفاً یک ویدیو انتخاب کنید.',
    });
  }

  const videoUrl = '/uploads/videos/' + req.file.filename;
  const videoFullPath = path.join(__dirname, '..', 'public', videoUrl);

  // تولید thumbnail
  const thumbnailFilename = req.file.filename.replace(/\.[^.]+$/, '.jpg');
  const thumbnailFullPath = path.join(__dirname, '..', 'public', 'uploads', 'thumbnails', thumbnailFilename);
  const thumbnailUrl = '/uploads/thumbnails/' + thumbnailFilename;

  let thumbnailPath = '';
  let duration = 0;

  try {
    thumbnailPath = await generateVideoThumbnail(videoFullPath, thumbnailFullPath);
    duration = await getVideoDuration(videoFullPath);
  } catch (err) {
    console.log('خطا در پردازش ویدیو:', err.message);
  }

  // استخراج هشتگ‌ها
  const hashtags = extractHashtags(caption || '');

  const reel = await Reel.create({
    author: user._id,
    videoUrl,
    thumbnailUrl: thumbnailPath ? thumbnailUrl : '',
    caption: caption || '',
    hashtags,
    duration: Math.round(duration),
  });

  await reel.populate('author', 'username avatar');

  res.status(201).json({
    success: true,
    data: reel,
  });
});

// ============================================================
// بخش ۲: دریافت فید Reel (همه ریلزها)
// ============================================================
module.exports.getReelFeed = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const reels = await Reel.find()
    .populate('author', 'username avatar')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await Reel.countDocuments();

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
// بخش ۳: دریافت یک Reel خاص
// ============================================================
module.exports.getReel = asyncHandler(async (req, res) => {
  const { reelId } = req.params;

  const reel = await Reel.findByIdAndUpdate(
    reelId,
    { $inc: { views: 1 } },
    { new: true }
  ).populate('author', 'username avatar');

  if (!reel) {
    return res.status(404).json({
      success: false,
      error: 'ریلز مورد نظر یافت نشد.',
    });
  }

  res.status(200).json({
    success: true,
    data: reel,
  });
});

// ============================================================
// بخش ۴: لایک Reel
// ============================================================
module.exports.likeReel = asyncHandler(async (req, res) => {
  const { reelId } = req.params;
  const user = res.locals.user;

  const reel = await Reel.findById(reelId);
  if (!reel) {
    return res.status(404).json({
      success: false,
      error: 'ریلز مورد نظر یافت نشد.',
    });
  }

  const alreadyLiked = reel.likes.some(
    (id) => id.toString() === user._id.toString()
  );

  if (alreadyLiked) {
    reel.likes = reel.likes.filter(
      (id) => id.toString() !== user._id.toString()
    );
    await reel.save();
    return res.status(200).json({
      success: true,
      operation: 'unlike',
      likeCount: reel.likes.length,
    });
  }

  reel.likes.push(user._id);
  await reel.save();

  res.status(200).json({
    success: true,
    operation: 'like',
    likeCount: reel.likes.length,
  });
});

// ============================================================
// بخش ۵: حذف Reel
// ============================================================
module.exports.deleteReel = asyncHandler(async (req, res) => {
  const { reelId } = req.params;
  const user = res.locals.user;

  const reel = await Reel.findOne({ _id: reelId, author: user._id });
  if (!reel) {
    return res.status(404).json({
      success: false,
      error: 'ریلز مورد نظر یافت نشد.',
    });
  }

  // حذف فایل‌ها
  try {
    const videoPath = path.join(__dirname, '..', 'public', reel.videoUrl);
    await fs.unlink(videoPath).catch(() => {});
    if (reel.thumbnailUrl) {
      const thumbPath = path.join(__dirname, '..', 'public', reel.thumbnailUrl);
      await fs.unlink(thumbPath).catch(() => {});
    }
  } catch (err) {
    console.log('خطا در حذف فایل‌های ریلز:', err.message);
  }

  await Reel.deleteOne({ _id: reelId });

  res.status(200).json({
    success: true,
    message: 'ریلز با موفقیت حذف شد.',
  });
});

module.exports = exports;
