// مسیر فایل: /utils/validation.js
// توضیح: ماژول جامع اعتبارسنجی ورودی‌های کاربر. تمام توابع مورد نیاز
// برای بررسی فرمت ایمیل، نام کاربری، رمز عبور، بیوگرافی و وب‌سایت را
// به همراه توابع کمکی برای ObjectId و صفحه‌بندی فراهم می‌کند.
// هر تابع در صورت صحیح بودن false و در غیر این صورت، پیام خطای فارسی برمی‌گرداند.
//
// @version 2.5.0
// @since 2026

const mongoose = require('mongoose');

// ============================================================
// بخش ۱: ثابت‌های پیکربندی
// ============================================================
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 30;
const PASSWORD_MIN_LENGTH = 8;
const BIO_MAX_LENGTH = 150;
const WEBSITE_MAX_LENGTH = 100;
const MAX_PAGE_SIZE = 100;

// ============================================================
// بخش ۲: توابع اعتبارسنجی
// ============================================================

/**
 * اعتبارسنجی ایمیل با regex مدرن
 */
module.exports.validateEmail = (email) => {
  if (!email || typeof email !== 'string' || !email.trim()) {
    return 'لطفاً یک آدرس ایمیل وارد کنید.';
  }

  // regex کاربردی و سازگار با استانداردهای مدرن
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  if (!emailRegex.test(email.trim())) {
    return 'لطفاً یک آدرس ایمیل معتبر وارد کنید.';
  }
  return false;
};

/**
 * اعتبارسنجی نام کامل (حداقل ۲ کاراکتر، حروف فارسی و انگلیسی)
 */
module.exports.validateFullName = (fullName) => {
  if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
    return 'لطفاً نام کامل خود را وارد کنید.';
  }
  if (fullName.trim().length < 2) {
    return 'نام کامل باید حداقل ۲ کاراکتر باشد.';
  }
  return false;
};

/**
 * اعتبارسنجی نام کاربری (مشابه قوانین اینستاگرام)
 */
module.exports.validateUsername = (username) => {
  if (!username || typeof username !== 'string' || !username.trim()) {
    return 'لطفاً یک نام کاربری انتخاب کنید.';
  }

  const trimmed = username.trim();

  if (trimmed.length < USERNAME_MIN_LENGTH || trimmed.length > USERNAME_MAX_LENGTH) {
    return `نام کاربری باید بین ${USERNAME_MIN_LENGTH} تا ${USERNAME_MAX_LENGTH} کاراکتر باشد.`;
  }

  if (!/^[a-zA-Z0-9._]+$/.test(trimmed)) {
    return 'نام کاربری فقط می‌تواند شامل حروف انگلیسی، اعداد، نقطه و زیرخط باشد.';
  }

  // جلوگیری از شروع یا پایان با نقطه یا زیرخط
  if (/^[._]/.test(trimmed) || /[._]$/.test(trimmed)) {
    return 'نام کاربری نمی‌تواند با نقطه یا زیرخط شروع یا تمام شود.';
  }

  // جلوگیری از تکرار متوالی نقطه یا زیرخط
  if (/[._]{2,}/.test(trimmed)) {
    return 'نام کاربری نمی‌تواند شامل نقطه یا زیرخط متوالی باشد.';
  }

  return false;
};

/**
 * اعتبارسنجی رمز عبور (حداقل ۸ کاراکتر، ترکیب حروف و عدد و علامت)
 */
module.exports.validatePassword = (password) => {
  if (!password || typeof password !== 'string') {
    return 'لطفاً یک رمز عبور وارد کنید.';
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return `رمز عبور باید حداقل ${PASSWORD_MIN_LENGTH} کاراکتر باشد.`;
  }

  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password);

  if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSpecialChar) {
    return 'رمز عبور باید شامل حداقل یک حرف بزرگ، یک حرف کوچک، یک عدد و یک کاراکتر خاص باشد.';
  }

  // لیست کلمات ممنوعه (پسوردهای خیلی ساده)
  const commonPasswords = ['password', '12345678', 'qwerty', 'admin123', 'instaclone'];
  if (commonPasswords.includes(password.toLowerCase())) {
    return 'این رمز عبور بیش از حد ساده و قابل حدس است.';
  }

  return false;
};

/**
 * اعتبارسنجی بیوگرافی (حداکثر طول)
 */
module.exports.validateBio = (bio) => {
  if (bio && typeof bio === 'string' && bio.length > BIO_MAX_LENGTH) {
    return `بیوگرافی نمی‌تواند بیشتر از ${BIO_MAX_LENGTH} کاراکتر باشد.`;
  }
  return false;
};

/**
 * اعتبارسنجی وب‌سایت (اختیاری)
 */
module.exports.validateWebsite = (website) => {
  if (!website || typeof website !== 'string' || !website.trim()) {
    return false; // وب‌سایت اختیاری است
  }

  const trimmed = website.trim();

  if (trimmed.length > WEBSITE_MAX_LENGTH) {
    return `آدرس وب‌سایت نمی‌تواند بیشتر از ${WEBSITE_MAX_LENGTH} کاراکتر باشد.`;
  }

  const websiteRegex = /^(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/;
  if (!websiteRegex.test(trimmed)) {
    return 'لطفاً یک آدرس وب‌سایت معتبر وارد کنید.';
  }

  return false;
};

// ============================================================
// بخش ۳: اعتبارسنجی‌های کمکی
// ============================================================

/**
 * بررسی معتبر بودن شناسه Mongoose
 * @param {string} id
 * @returns {string|false}
 */
module.exports.validateObjectId = (id) => {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return 'شناسهٔ ارسالی نامعتبر است.';
  }
  return false;
};

/**
 * اعتبارسنجی و نرمال‌سازی پارامترهای صفحه‌بندی
 * @param {object} query - req.query
 * @param {number} defaultLimit
 * @returns {{ offset: number, limit: number }}
 */
module.exports.validatePagination = (query, defaultLimit = 10) => {
  let offset = parseInt(query.offset, 10) || 0;
  let limit = parseInt(query.limit, 10) || defaultLimit;

  if (offset < 0) offset = 0;
  if (limit < 1) limit = 1;
  if (limit > MAX_PAGE_SIZE) limit = MAX_PAGE_SIZE;

  return { offset, limit };
};

/**
 * پاک‌سازی ورودی از کاراکترهای خطرناک (XSS)
 * @param {string} input
 * @returns {string}
 */
module.exports.sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
};
