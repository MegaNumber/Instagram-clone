// مسیر فایل: /utils/validation.js
// توضیح: ماژول اعتبارسنجی ورودی‌های کاربر. این فایل شامل توابع اعتبارسنجی
// برای ایمیل، نام کامل، نام کاربری، رمز عبور، بیوگرافی و وب‌سایت است.
// هر تابع در صورت معتبر بودن مقدار false و در صورت نامعتبر بودن، یک
// پیام خطای فارسی برمی‌گرداند. منطبق با استانداردهای امنیتی روز.

// ============================================================
// بخش ۱: ثابت‌های پیکربندی
// ============================================================
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 30;
const PASSWORD_MIN_LENGTH = 8;
const BIO_MAX_LENGTH = 150;
const WEBSITE_MAX_LENGTH = 100;

// ============================================================
// بخش ۲: توابع اعتبارسنجی
// ============================================================

/**
 * @function validateEmail
 * @description اعتبارسنجی آدرس ایمیل با استفاده از regex استاندارد
 * @param {string} email - ایمیل ورودی
 * @returns {string|false} - پیام خطا در صورت نامعتبر بودن، در غیر این صورت false
 */
module.exports.validateEmail = (email) => {
  if (!email || typeof email !== 'string' || !email.trim()) {
    return 'لطفاً یک آدرس ایمیل وارد کنید.';
  }

  // regex استاندارد RFC 5322
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  if (!emailRegex.test(email.trim())) {
    return 'لطفاً یک آدرس ایمیل معتبر وارد کنید.';
  }

  return false; // معتبر است
};

/**
 * @function validateFullName
 * @description اعتبارسنجی نام کامل (حداقل ۲ کاراکتر، فقط حروف و فاصله)
 * @param {string} fullName - نام کامل ورودی
 * @returns {string|false} - پیام خطا یا false
 */
module.exports.validateFullName = (fullName) => {
  if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
    return 'لطفاً نام کامل خود را وارد کنید.';
  }

  if (fullName.trim().length < 2) {
    return 'نام کامل باید حداقل ۲ کاراکتر باشد.';
  }

  // فقط حروف (انگلیسی و فارسی) و فاصله مجاز است
  const nameRegex = /^[\u0600-\u06FF\uFB8A\u067E\u0686\u06AF\u200C\u200Fa-zA-Z\s]{2,}$/;
  if (!nameRegex.test(fullName.trim())) {
    return 'نام کامل فقط می‌تواند شامل حروف و فاصله باشد.';
  }

  return false;
};

/**
 * @function validateUsername
 * @description اعتبارسنجی نام کاربری (طول بین ۳ تا ۳۰، فقط حروف، اعداد، نقطه و زیرخط)
 * @param {string} username - نام کاربری ورودی
 * @returns {string|false} - پیام خطا یا false
 */
module.exports.validateUsername = (username) => {
  if (!username || typeof username !== 'string' || !username.trim()) {
    return 'لطفاً یک نام کاربری انتخاب کنید.';
  }

  const trimmed = username.trim();

  if (trimmed.length < USERNAME_MIN_LENGTH || trimmed.length > USERNAME_MAX_LENGTH) {
    return `نام کاربری باید بین ${USERNAME_MIN_LENGTH} تا ${USERNAME_MAX_LENGTH} کاراکتر باشد.`;
  }

  // الگوی مجاز: حروف انگلیسی بزرگ و کوچک، اعداد، نقطه و زیرخط
  const usernameRegex = /^[a-zA-Z0-9._]+$/;
  if (!usernameRegex.test(trimmed)) {
    return 'نام کاربری فقط می‌تواند شامل حروف انگلیسی، اعداد، نقطه و زیرخط باشد.';
  }

  // عدم شروع یا پایان با نقطه یا زیرخط (مانند اینستاگرام)
  if (/^[._]/.test(trimmed) || /[._]$/.test(trimmed)) {
    return 'نام کاربری نمی‌تواند با نقطه یا زیرخط شروع یا تمام شود.';
  }

  return false;
};

/**
 * @function validatePassword
 * @description اعتبارسنجی رمز عبور (حداقل طول ۸، شامل حروف بزرگ و کوچک، عدد و کاراکتر خاص)
 * @param {string} password - رمز عبور ورودی
 * @returns {string|false} - پیام خطا یا false
 */
module.exports.validatePassword = (password) => {
  if (!password || typeof password !== 'string') {
    return 'لطفاً یک رمز عبور وارد کنید.';
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return `رمز عبور باید حداقل ${PASSWORD_MIN_LENGTH} کاراکتر باشد.`;
  }

  // بررسی وجود حداقل یک حرف بزرگ، یک حرف کوچک، یک عدد و یک کاراکتر خاص
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password);

  if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSpecialChar) {
    return 'رمز عبور باید شامل حداقل یک حرف بزرگ، یک حرف کوچک، یک عدد و یک کاراکتر خاص باشد.';
  }

  return false;
};

/**
 * @function validateBio
 * @description اعتبارسنجی بیوگرافی پروفایل (حداکثر طول ۱۵۰ کاراکتر)
 * @param {string} bio - بیوگرافی ورودی
 * @returns {string|false} - پیام خطا یا false
 */
module.exports.validateBio = (bio) => {
  if (bio && typeof bio === 'string' && bio.length > BIO_MAX_LENGTH) {
    return `بیوگرافی نمی‌تواند بیشتر از ${BIO_MAX_LENGTH} کاراکتر باشد.`;
  }
  return false;
};

/**
 * @function validateWebsite
 * @description اعتبارسنجی آدرس وب‌سایت (اختیاری، اما در صورت وارد شدن باید معتبر باشد)
 * @param {string} website - آدرس وب‌سایت ورودی
 * @returns {string|false} - پیام خطا یا false
 */
module.exports.validateWebsite = (website) => {
  if (!website || typeof website !== 'string' || !website.trim()) {
    return false; // وب‌سایت اختیاری است
  }

  const trimmed = website.trim();

  if (trimmed.length > WEBSITE_MAX_LENGTH) {
    return `آدرس وب‌سایت نمی‌تواند بیشتر از ${WEBSITE_MAX_LENGTH} کاراکتر باشد.`;
  }

  // regex برای URL معتبر با پروتکل اختیاری
  const websiteRegex = /^(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/;
  if (!websiteRegex.test(trimmed)) {
    return 'لطفاً یک آدرس وب‌سایت معتبر وارد کنید.';
  }

  return false;
};

// ============================================================
// بخش ۳: اعتبارسنجی‌های اضافی (اختیاری)
// ============================================================

/**
 * @function sanitizeInput
 * @description پاک‌سازی ورودی‌ها از کاراکترهای خطرناک (XSS)
 * @param {string} input - ورودی کاربر
 * @returns {string} - ورودی پاک‌سازی‌شده
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
