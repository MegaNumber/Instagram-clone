// مسیر فایل: /utils/fileUpload.js
// توضیح: تعریف میدلورهای Multer با حافظه موقت و توابع کمکی برای ذخیره‌سازی فایل.

const multer = require('multer');
const path = require('path');
const storageService = require('./storage');

// حافظه موقت
const memStorage = multer.memoryStorage();

// فیلتر تصاویر
const imageFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('فقط تصاویر JPEG, PNG, WebP و GIF مجاز هستند.'));
  }
};

// فیلتر ویدیو
const videoFilter = (req, file, cb) => {
  const allowed = ['video/mp4', 'video/webm', 'video/quicktime'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('فقط ویدیوهای MP4, WebM و MOV مجاز هستند.'));
  }
};

// فیلتر ترکیبی (تصویر و ویدیو)
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

// فیلتر همه نوع فایل (چت)
const anyFilter = (req, file, cb) => cb(null, true);

// میدلورهای آماده
const uploadPostImage = multer({
  storage: memStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFilter,
}).single('image');

const uploadAvatar = multer({
  storage: memStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: imageFilter,
}).single('image');

const uploadStoryMedia = multer({
  storage: memStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: mediaFilter,
}).single('media');

const uploadChatFile = multer({
  storage: memStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: anyFilter,
}).single('file');

const uploadReelVideo = multer({
  storage: memStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: videoFilter,
}).single('video');

/**
 * ذخیره فایل آپلود شده (از req.file) با سرویس یکپارچه
 * @param {object} file - شیء req.file
 * @param {string} folder - پوشه مقصد
 * @param {string} prefix - پیشوند نام فایل
 * @returns {Promise<string>} مسیر عمومی فایل
 */
const saveUploadedFile = async (file, folder, prefix = 'file') => {
  const filename = storageService.StorageService.uniqueFilename(file.originalname, prefix);
  return await storageService.saveBuffer(file.buffer, filename, folder);
};

module.exports = {
  uploadPostImage,
  uploadAvatar,
  uploadStoryMedia,
  uploadChatFile,
  uploadReelVideo,
  saveUploadedFile,
};
