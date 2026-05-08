// مسیر فایل: /utils/fileUpload.js
// توضیح: تعریف میدلورهای آپلود برای بخش‌های مختلف (پست، آواتار، استوری، چت، ریلز)
// با استفاده از Multer و سرویس ذخیره‌سازی یکپارچه.

const multer = require('multer');
const path = require('path');
const storageService = require('./storage');

// ============================================================
// بخش ۱: تنظیمات حافظه موقت (Memory Storage)
// برای پردازش بهتر، فایل‌ها ابتدا در حافظه ذخیره می‌شوند
// و سپس توسط storageService در مقصد نهایی ذخیره می‌گردند
// ============================================================
const memStorage = multer.memoryStorage();

// ============================================================
// بخش ۲: فیلترهای مجاز برای نوع‌های مختلف
// ============================================================
const imageFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('فقط تصاویر JPEG، PNG، WebP و GIF مجاز هستند.'));
  }
};

const videoFilter = (req, file, cb) => {
  const allowed = ['video/mp4', 'video/webm', 'video/quicktime'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('فقط ویدیوهای MP4، WebM و MOV مجاز هستند.'));
  }
};

const mediaFilter = (req, file, cb) => {
  const allowed = [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm', 'video/quicktime'
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('فقط تصاویر و ویدیوهای مجاز پذیرفته می‌شوند.'));
  }
};

const chatMediaFilter = (req, file, cb) => {
  // در چت همه نوع فایل قابل قبول است
  cb(null, true);
};

// ============================================================
// بخش ۳: ایجاد میدلورهای آماده برای هر بخش
// ============================================================

// پست (تصویر)
const uploadPostImage = multer({
  storage: memStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // ۱۰ مگابایت
  fileFilter: imageFilter,
}).single('image');

// آواتار (تصویر)
const uploadAvatar = multer({
  storage: memStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // ۲ مگابایت
  fileFilter: imageFilter,
}).single('image');

// استوری (تصویر/ویدیو)
const uploadStoryMedia = multer({
  storage: memStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // ۵۰ مگابایت
  fileFilter: mediaFilter,
}).single('media');

// چت (فایل)
const uploadChatFile = multer({
  storage: memStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // ۱۰ مگابایت
  fileFilter: chatMediaFilter,
}).single('file');

// ریلز (ویدیو)
const uploadReelVideo = multer({
  storage: memStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // ۱۰۰ مگابایت
  fileFilter: videoFilter,
}).single('video');

// ============================================================
// بخش ۴: توابع کمکی برای ذخیره‌سازی با سرویس یکپارچه
// ============================================================
const saveUploadedFile = async (file, folder, prefix) => {
  const filename = storageService.StorageService.generateUniqueFilename(
    file.originalname,
    prefix
  );
  const publicPath = await storageService.saveBuffer(
    file.buffer,
    filename,
    folder
  );
  return publicPath;
};

// ============================================================
// بخش ۵: صادرات
// ============================================================
module.exports = {
  uploadPostImage,
  uploadAvatar,
  uploadStoryMedia,
  uploadChatFile,
  uploadReelVideo,
  saveUploadedFile,
};
