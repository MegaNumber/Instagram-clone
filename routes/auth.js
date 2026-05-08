// مسیر فایل: /routes/auth.js
// توضیح: تعریف مسیرهای مربوط به احراز هویت. این فایل تمام endpointهای ورود، ثبت‌نام،
// تغییر رمز عبور و احراز هویت گیت‌هاب را به کنترلرهای مربوطه نگاشت می‌کند.
// میان‌افزارهای امنیتی مانند Rate Limiting و اعتبارسنجی ورودی‌ها در این سطح اعمال می‌شوند.

// ============================================================
// بخش ۱: ایمپورت وابستگی‌های اصلی
// ============================================================
const express = require('express');
const authRouter = express.Router();
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');

// ============================================================
// بخش ۲: ایمپورت میان‌افزارهای سفارشی
// ============================================================
const asyncHandler = require('../utils/asyncHandler'); // حذف try-catch تکراری
const { requireAuth } = require('../controllers/authController'); // میان‌افزار احراز هویت

// ============================================================
// بخش ۳: ایمپورت کنترلرهای احراز هویت
// ============================================================
const {
  loginAuthentication,
  register,
  changePassword,
  githubLoginAuthentication,
} = require('../controllers/authController');

// ============================================================
// بخش ۴: ثابت‌های پیکربندی
// ============================================================
const PASSWORD_MIN_LENGTH = 8;
const USERNAME_MIN_LENGTH = 3;

// ============================================================
// بخش ۵: پیکربندی Rate Limiting اختصاصی برای مسیرهای حساس
// ============================================================
// محدودسازی برای ورود: هر IP در ۱۵ دقیقه حداکثر ۵ تلاش
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // ۱۵ دقیقه
  max: 5, // حداکثر ۵ درخواست
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'تعداد تلاش‌های ورود بیش از حد مجاز است. لطفاً ۱۵ دقیقه صبر کنید.',
  },
});

// محدودسازی برای ثبت‌نام: هر IP در یک ساعت حداکثر ۳ بار
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // ۱ ساعت
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'ثبت‌نام بیش از حد مجاز است. لطفاً یک ساعت صبر کنید.',
  },
});

// محدودسازی برای تغییر رمز عبور
const passwordChangeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // ۱ ساعت
  max: 2,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'تغییر رمز عبور بیش از حد مجاز است. لطفاً یک ساعت صبر کنید.',
  },
});

// ============================================================
// بخش ۶: قوانین اعتبارسنجی (Validation Chains)
// ============================================================

/**
 * @constant registerValidation
 * @description زنجیره اعتبارسنجی برای ثبت‌نام: بررسی ایمیل، نام کاربری، نام کامل و رمز عبور
 */
const registerValidation = [
  body('email')
    .isEmail()
    .withMessage('لطفاً یک ایمیل معتبر وارد کنید.')
    .normalizeEmail(),
  body('username')
    .trim()
    .isLength({ min: USERNAME_MIN_LENGTH })
    .withMessage(`نام کاربری باید حداقل ${USERNAME_MIN_LENGTH} کاراکتر باشد.`)
    .matches(/^[a-zA-Z0-9._]+$/)
    .withMessage('نام کاربری فقط می‌تواند شامل حروف انگلیسی، اعداد، نقطه و زیرخط باشد.'),
  body('fullName')
    .trim()
    .isLength({ min: 2 })
    .withMessage('نام کامل باید حداقل ۲ کاراکتر باشد.'),
  body('password')
    .isLength({ min: PASSWORD_MIN_LENGTH })
    .withMessage(`رمز عبور باید حداقل ${PASSWORD_MIN_LENGTH} کاراکتر باشد.`),
];

/**
 * @constant loginValidation
 * @description زنجیره اعتبارسنجی برای ورود: بررسی ایمیل و رمز عبور
 */
const loginValidation = [
  body('email')
    .isEmail()
    .withMessage('لطفاً یک ایمیل معتبر وارد کنید.')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('رمز عبور الزامی است.'),
];

/**
 * @constant passwordChangeValidation
 * @description زنجیره اعتبارسنجی برای تغییر رمز عبور
 */
const passwordChangeValidation = [
  body('currentPassword')
    .notEmpty()
    .withMessage('رمز عبور فعلی الزامی است.'),
  body('newPassword')
    .isLength({ min: PASSWORD_MIN_LENGTH })
    .withMessage(`رمز عبور جدید باید حداقل ${PASSWORD_MIN_LENGTH} کاراکتر باشد.`),
];

// ============================================================
// بخش ۷: تعریف مسیرهای احراز هویت
// ============================================================

// ---------- ورود با گیت‌هاب ----------
// POST /api/auth/login/github
authRouter.post(
  '/login/github',
  githubLoginAuthentication
);

// ---------- ورود معمولی ----------
// POST /api/auth/login
authRouter.post(
  '/login',
  loginLimiter, // اعمال Rate Limiting برای جلوگیری از حملات Brute Force
  loginValidation, // اعتبارسنجی ورودی‌های ورود
  asyncHandler(loginAuthentication)
);

// ---------- ثبت‌نام ----------
// POST /api/auth/register
authRouter.post(
  '/register',
  registerLimiter, // اعمال Rate Limiting برای جلوگیری از ثبت‌نام جعلی
  registerValidation, // اعتبارسنجی ورودی‌های ثبت‌نام
  asyncHandler(register)
);

// ---------- تغییر رمز عبور ----------
// PUT /api/auth/password
authRouter.put(
  '/password',
  requireAuth, // فقط کاربران واردشده مجازند
  passwordChangeLimiter, // محدودسازی تعداد درخواست‌های تغییر رمز
  passwordChangeValidation, // اعتبارسنجی رمز عبور جدید
  asyncHandler(changePassword)
);

// ============================================================
// بخش ۸: صادرات Router
// ============================================================
module.exports = authRouter;
