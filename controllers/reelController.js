// مسیر فایل: /controllers/reelController.js
const Reel = require('../models/Reel');
const asyncHandler = require('../utils/asyncHandler');
const { saveUploadedFile } = require('../utils/fileUpload');
const { generateVideoThumbnail, getVideoDuration } = require('../utils/ffmpeg-utils');
const storageService = require('../utils/storage');
const path = require('path');
const fs = require('fs').promises;

module.exports.createReel = asyncHandler(async (req, res) => {
  const user = res.locals.user;
  if (!req.file) return res.status(400).json({ success: false, error: 'ویدیویی انتخاب نشده است.' });

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
    console.log('خطا در پردازش ویدیو:', err.message);
  }

  const hashtags = require('linkifyjs').find(req.body.caption || '').filter(r => r.type === 'hashtag').map(r => r.value.substring(1));

  const reel = await Reel.create({
    author: user._id,
    videoUrl,
    thumbnailUrl,
    caption: req.body.caption || '',
    hashtags,
    duration: Math.round(duration),
  });
  await reel.populate('author', 'username avatar');
  res.status(201).json({ success: true, data: reel });
});

module.exports.getReelFeed = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const reels = await Reel.find().populate('author', 'username avatar').sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
  const total = await Reel.countDocuments();
  res.status(200).json({ success: true, data: reels, pagination: { page, limit, total, hasMore: skip + limit < total } });
});

module.exports.getReel = asyncHandler(async (req, res) => {
  const { reelId } = req.params;
  const reel = await Reel.findByIdAndUpdate(reelId, { $inc: { views: 1 } }, { new: true }).populate('author', 'username avatar');
  if (!reel) return res.status(404).json({ success: false, error: 'ریلز یافت نشد.' });
  res.status(200).json({ success: true, data: reel });
});

module.exports.likeReel = asyncHandler(async (req, res) => {
  const { reelId } = req.params;
  const user = res.locals.user;
  const reel = await Reel.findById(reelId);
  if (!reel) return res.status(404).json({ success: false, error: 'ریلز یافت نشد.' });
  const idx = reel.likes.findIndex(id => id.toString() === user._id.toString());
  if (idx === -1) {
    reel.likes.push(user._id);
    await reel.save();
    res.status(200).json({ success: true, operation: 'like', likeCount: reel.likes.length });
  } else {
    reel.likes.splice(idx, 1);
    await reel.save();
    res.status(200).json({ success: true, operation: 'unlike', likeCount: reel.likes.length });
  }
});

module.exports.deleteReel = asyncHandler(async (req, res) => {
  const { reelId } = req.params;
  const user = res.locals.user;
  const reel = await Reel.findOne({ _id: reelId, author: user._id });
  if (!reel) return res.status(404).json({ success: false, error: 'ریلز یافت نشد.' });
  await storageService.deleteFile(reel.videoUrl);
  if (reel.thumbnailUrl) await storageService.deleteFile(reel.thumbnailUrl);
  await Reel.deleteOne({ _id: reelId });
  res.status(200).json({ success: true });
});
