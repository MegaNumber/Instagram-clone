// مسیر فایل: /utils/storage.js
// توضیح: سرویس ذخیره‌سازی انتزاعی برای مدیریت تمام فایل‌ها.
// با تغییر متغیر محیطی STORAGE_TYPE می‌توان از حالت local به S3 سوئیچ کرد.

const fs = require('fs').promises;
const path = require('path');

class StorageService {
  constructor(config = {}) {
    this.type = config.type || process.env.STORAGE_TYPE || 'local';
    this.basePath = config.basePath || process.env.STORAGE_BASE_PATH || path.join(__dirname, '..', 'public');
  }

  /**
   * ذخیره بافر در یک فایل و برگرداندن مسیر عمومی
   * @param {Buffer} buffer - محتوای فایل
   * @param {string} filename - نام فایل
   * @param {string} folder - زیرپوشه مقصد
   * @returns {Promise<string>} مسیر عمومی فایل
   */
  async saveBuffer(buffer, filename, folder = 'uploads') {
    if (this.type !== 'local') {
      throw new Error('S3 not implemented yet');
    }
    const dir = path.join(this.basePath, folder);
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, filename);
    await fs.writeFile(filePath, buffer);
    return '/' + folder + '/' + filename;
  }

  /**
   * انتقال یک فایل موقت به مقصد نهایی
   * @param {string} tempPath - مسیر موقت
   * @param {string} folder - پوشه مقصد
   * @param {string} newFilename - نام جدید (اختیاری)
   * @returns {Promise<string>} مسیر عمومی
   */
  async moveFile(tempPath, folder, newFilename = null) {
    if (this.type !== 'local') {
      throw new Error('S3 not implemented yet');
    }
    const filename = newFilename || path.basename(tempPath);
    const dir = path.join(this.basePath, folder);
    await fs.mkdir(dir, { recursive: true });
    const dest = path.join(dir, filename);
    await fs.rename(tempPath, dest);
    return '/' + folder + '/' + filename;
  }

  /**
   * حذف یک فایل با مسیر عمومی
   * @param {string} publicPath - مسیر عمومی فایل (مثلاً /uploads/post-123.jpg)
   */
  async deleteFile(publicPath) {
    if (!publicPath) return;
    if (this.type !== 'local') {
      throw new Error('S3 not implemented yet');
    }
    const fullPath = path.join(this.basePath, publicPath);
    try {
      await fs.unlink(fullPath);
    } catch (err) {
      if (err.code !== 'ENOENT') console.error('Error deleting file:', err.message);
    }
  }

  /**
   * تولید یک نام فایل یکتا
   * @param {string} originalname - نام اصلی
   * @param {string} prefix - پیشوند
   * @returns {string} نام یکتا با پسوند
   */
  static uniqueFilename(originalname, prefix = 'file') {
    const ext = path.extname(originalname);
    const ts = Date.now();
    const rnd = Math.round(Math.random() * 1e9);
    return `${prefix}-${ts}-${rnd}${ext}`;
  }
}

const storage = new StorageService();
module.exports = storage;
module.exports.StorageService = StorageService;
