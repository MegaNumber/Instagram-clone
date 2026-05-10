// مسیر فایل: /utils/storage.js
// توضیح: سرویس ذخیره‌سازی انتزاعی برای مدیریت تمام فایل‌ها.
// با تنظیم متغیر محیطی STORAGE_TYPE روی "s3" (یا "local") می‌توان
// درایور فعال را تغییر داد. حالت S3 از AWS SDK v3 استفاده می‌کند
// و فایل‌ها را در bucket مشخص‌شده آپلود می‌کند. برای stateful نبودن،
// کلاینت S3 در زمان ساخت نمونه ایجاد می‌شود.
//
// [v2.0.0] تغییرات:
// - اضافه شدن پشتیبانی کامل از S3
// - پیکربندی با متغیرهای محیطی: S3_BUCKET, S3_REGION, S3_ACCESS_KEY, S3_SECRET_KEY
// - متدهای saveBuffer, moveFile, deleteFile اکنون هر دو حالت را پوشش می‌دهند
//
// @dependency npm install @aws-sdk/client-s3 (برای حالت S3)

const fs = require('fs').promises;
const path = require('path');

// بارگذاری تنبل (lazy) کلاینت S3 تا در حالت local نیاز نباشد
let S3Client, PutObjectCommand, DeleteObjectCommand, CopyObjectCommand;
try {
  ({ S3Client, PutObjectCommand, DeleteObjectCommand, CopyObjectCommand } = require('@aws-sdk/client-s3'));
} catch (e) {
  // در صورت نبودن ماژول S3 فقط حالت local کار می‌کند
}

class StorageService {
  constructor(config = {}) {
    this.type = config.type || process.env.STORAGE_TYPE || 'local';
    this.basePath = config.basePath || process.env.STORAGE_BASE_PATH || path.join(__dirname, '..', 'public');
    
    // راه‌اندازی کلاینت S3 در صورت نیاز
    if (this.type === 's3') {
      if (!S3Client) {
        throw new Error('Missing @aws-sdk/client-s3 module. Install it via: npm install @aws-sdk/client-s3');
      }
      this.s3Bucket = config.bucket || process.env.S3_BUCKET;
      if (!this.s3Bucket) {
        throw new Error('S3_BUCKET environment variable is required for S3 storage');
      }
      this.s3Client = new S3Client({
        region: config.region || process.env.S3_REGION || 'us-east-1',
        credentials: {
          accessKeyId: config.accessKeyId || process.env.S3_ACCESS_KEY,
          secretAccessKey: config.secretAccessKey || process.env.S3_SECRET_KEY,
        },
      });
    }
  }

  /**
   * ذخیره بافر در مکان دائمی و برگرداندن مسیر عمومی / URL
   * @param {Buffer} buffer - محتوای فایل
   * @param {string} filename - نام فایل
   * @param {string} folder - زیرپوشه (در S3 به‌عنوان پیشوند کلید استفاده می‌شود)
   * @returns {Promise<string>} مسیر عمومی فایل (نسبی در local، URL کامل در S3)
   */
  async saveBuffer(buffer, filename, folder = 'uploads') {
    if (this.type === 'local') {
      const dir = path.join(this.basePath, folder);
      await fs.mkdir(dir, { recursive: true });
      const filePath = path.join(dir, filename);
      await fs.writeFile(filePath, buffer);
      return '/' + folder + '/' + filename;
    } 
    
    if (this.type === 's3') {
      const key = `${folder}/${filename}`;
      const command = new PutObjectCommand({
        Bucket: this.s3Bucket,
        Key: key,
        Body: buffer,
        ContentType: this._getContentType(filename),
        // ACL: 'public-read' // اگر bucket سیاست public-read داشته باشد می‌توان فعال کرد
      });
      await this.s3Client.send(command);
      // بازگرداندن URL عمومی S3 (فرض می‌کنیم bucket به‌صورت public یا از طریق CDN در دسترس است)
      return `https://${this.s3Bucket}.s3.${this.s3Client.config.region}.amazonaws.com/${key}`;
    }
    
    throw new Error(`Unsupported storage type: ${this.type}`);
  }

  /**
   * انتقال فایل موقت به مقصد نهایی و برگرداندن مسیر عمومی
   * @param {string} tempPath - مسیر موقت (در local)
   * @param {string} folder - پوشه مقصد
   * @param {string} newFilename - نام جدید (اختیاری)
   * @returns {Promise<string>} مسیر عمومی
   */
  async moveFile(tempPath, folder, newFilename = null) {
    const filename = newFilename || path.basename(tempPath);
    
    if (this.type === 'local') {
      const dir = path.join(this.basePath, folder);
      await fs.mkdir(dir, { recursive: true });
      const dest = path.join(dir, filename);
      await fs.rename(tempPath, dest);
      return '/' + folder + '/' + filename;
    }
    
    if (this.type === 's3') {
      // خواندن محتوای فایل موقت و آپلود
      const buffer = await fs.readFile(tempPath);
      const url = await this.saveBuffer(buffer, filename, folder);
      // حذف فایل موقت
      try { await fs.unlink(tempPath); } catch (e) { /* ignore */ }
      return url;
    }
    
    throw new Error(`Unsupported storage type: ${this.type}`);
  }

  /**
   * حذف یک فایل با مسیر عمومی
   * @param {string} publicPath - مسیر عمومی (نسبی در local، URL کامل در S3)
   */
  async deleteFile(publicPath) {
    if (!publicPath) return;
    
    if (this.type === 'local') {
      const fullPath = path.join(this.basePath, publicPath);
      try {
        await fs.unlink(fullPath);
      } catch (err) {
        if (err.code !== 'ENOENT') console.error('Error deleting file:', err.message);
      }
      return;
    }
    
    if (this.type === 's3') {
      const key = this._extractKeyFromUrl(publicPath);
      if (!key) {
        console.error('Invalid S3 URL, cannot delete:', publicPath);
        return;
      }
      try {
        await this.s3Client.send(new DeleteObjectCommand({
          Bucket: this.s3Bucket,
          Key: key,
        }));
      } catch (err) {
        console.error('Error deleting S3 object:', err.message);
      }
      return;
    }
    // fallback
  }

  /**
   * تولید نام یکتای فایل
   */
  static uniqueFilename(originalname, prefix = 'file') {
    const ext = path.extname(originalname);
    const ts = Date.now();
    const rnd = Math.round(Math.random() * 1e9);
    return `${prefix}-${ts}-${rnd}${ext}`;
  }

  // --- یوتیلیتی‌های خصوصی ---

  /**
   * حدس Content-Type بر اساس پسوند (برای S3)
   */
  _getContentType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const types = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
      '.pdf': 'application/pdf',
    };
    return types[ext] || 'application/octet-stream';
  }

  /**
   * استخراج کلید S3 از URL (https://bucket.s3.region.amazonaws.com/key)
   */
  _extractKeyFromUrl(url) {
    try {
      const parsed = new URL(url);
      // مسیر بدون اسلش ابتدایی
      return parsed.pathname.substring(1);
    } catch (e) {
      return null;
    }
  }
}

const storage = new StorageService();
module.exports = storage;
module.exports.StorageService = StorageService;
