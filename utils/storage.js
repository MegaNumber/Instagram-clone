// مسیر فایل: /utils/storage.js
// توضیح: سرویس ذخیره‌سازی یکپارچه با پشتیبانی از Local و S3.
// با استفاده از این سرویس می‌توان به راحتی نوع ذخیره‌سازی را بدون تغییر در کنترلرها عوض کرد.

// ============================================================
// بخش ۱: ایمپورت کتابخانه‌های مورد نیاز
// ============================================================
const fs = require('fs').promises;
const path = require('path');
const { createReadStream } = require('fs');

// در صورت نیاز به S3 (در آینده)
// const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

// ============================================================
// بخش ۲: کلاس پایه Storage (Interface)
// ============================================================
class StorageService {
  /**
   * @param {object} config - تنظیمات سرویس
   * @param {string} config.type - نوع ذخیره‌سازی: 'local' یا 's3'
   * @param {string} config.basePath - مسیر پایه برای حالت local
   * @param {object} config.s3Config - تنظیمات S3 در صورت انتخاب
   */
  constructor(config) {
    this.type = config.type || 'local';
    this.basePath = config.basePath || path.join(__dirname, '..', 'public');
    // در صورت نیاز به S3، اینجا client ایجاد می‌شود
  }

  /**
   * ذخیره فایل از بافر
   * @param {Buffer} buffer - بافر فایل
   * @param {string} filename - نام فایل
   * @param {string} folder - پوشه مقصد (نسبت به basePath)
   * @returns {Promise<string>} - مسیر عمومی فایل ذخیره‌شده
   */
  async saveBuffer(buffer, filename, folder = 'uploads') {
    if (this.type === 'local') {
      const fullDir = path.join(this.basePath, folder);
      await fs.mkdir(fullDir, { recursive: true });
      const fullPath = path.join(fullDir, filename);
      await fs.writeFile(fullPath, buffer);
      return '/' + folder + '/' + filename;
    } else {
      throw new Error('S3 storage not implemented yet');
    }
  }

  /**
   * ذخیره فایل از مسیر موقت (temp path)
   * @param {string} tempPath - مسیر فایل موقت
   * @param {string} targetFolder - پوشه مقصد
   * @param {string} targetFilename - نام فایل نهایی (اختیاری، در صورت عدم ارائه از نام اصلی استفاده می‌شود)
   * @returns {Promise<string>} - مسیر عمومی فایل
   */
  async saveFile(tempPath, targetFolder, targetFilename = null) {
    if (this.type === 'local') {
      const filename = targetFilename || path.basename(tempPath);
      const fullDir = path.join(this.basePath, targetFolder);
      await fs.mkdir(fullDir, { recursive: true });
      const fullPath = path.join(fullDir, filename);
      // انتقال فایل
      await fs.rename(tempPath, fullPath);
      return '/' + targetFolder + '/' + filename;
    } else {
      throw new Error('S3 storage not implemented yet');
    }
  }

  /**
   * حذف فایل بر اساس مسیر عمومی
   * @param {string} publicPath - مسیر عمومی فایل مانند /uploads/image.jpg
   * @returns {Promise<void>}
   */
  async deleteFile(publicPath) {
    if (!publicPath || typeof publicPath !== 'string') return;
    if (this.type === 'local') {
      const fullPath = path.join(this.basePath, publicPath);
      try {
        await fs.unlink(fullPath);
      } catch (err) {
        // اگر فایل وجود نداشت، نادیده می‌گیریم
        if (err.code !== 'ENOENT') console.error('Error deleting file:', err.message);
      }
    } else {
      throw new Error('S3 storage not implemented yet');
    }
  }

  /**
   * تولید نام فایل یکتا با پسوند
   * @param {string} originalname - نام اصلی فایل
   * @param {string} prefix - پیشوند نام فایل (مثلاً 'post', 'avatar', 'story')
   * @returns {string} - نام فایل یکتا
   */
  static generateUniqueFilename(originalname, prefix = 'file') {
    const ext = path.extname(originalname);
    const timestamp = Date.now();
    const random = Math.round(Math.random() * 1e9);
    return `${prefix}-${timestamp}-${random}${ext}`;
  }
}

// ============================================================
// بخش ۳: ایجاد نمونه پیش‌فرض با کانفیگ از محیط
// ============================================================
const storageConfig = {
  type: process.env.STORAGE_TYPE || 'local',
  basePath: process.env.STORAGE_BASE_PATH || path.join(__dirname, '..', 'public'),
  // s3Config: { ... } در صورت نیاز
};

const storageService = new StorageService(storageConfig);

module.exports = storageService;
module.exports.StorageService = StorageService;
