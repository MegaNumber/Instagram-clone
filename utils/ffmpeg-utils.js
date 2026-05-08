// مسیر فایل: /utils/ffmpeg-utils.js
// توضیح: تولید thumbnail از ویدیو و دریافت مدت زمان ویدیو با ffmpeg.

const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');
const path = require('path');

ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

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
      .on('error', reject);
  });
};

module.exports.getVideoDuration = (videoPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration || 0);
    });
  });
};
