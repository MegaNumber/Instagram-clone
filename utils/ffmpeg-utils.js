// مسیر فایل: /utils/ffmpeg-utils.js
// توضیح: توابع کمکی برای پردازش ویدیو با FFmpeg.
// شامل تولید thumbnail از ویدیو.

const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');
const path = require('path');

// تنظیم مسیر ffmpeg
ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

/**
 * @function generateVideoThumbnail
 * @description تولید یک تصویر thumbnail از ویدیو
 * @param {string} videoPath - مسیر فایل ویدیو
 * @param {string} outputPath - مسیر خروجی thumbnail
 * @returns {Promise<string>} - مسیر فایل thumbnail
 */
module.exports.generateVideoThumbnail = (videoPath, outputPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        count: 1,
        folder: path.dirname(outputPath),
        filename: path.basename(outputPath),
        size: '640x360',
      })
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err));
  });
};

/**
 * @function getVideoDuration
 * @description دریافت طول مدت ویدیو به ثانیه
 * @param {string} videoPath - مسیر فایل ویدیو
 * @returns {Promise<number>} - مدت ویدیو به ثانیه
 */
module.exports.getVideoDuration = (videoPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration || 0);
    });
  });
};
