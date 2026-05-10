// مسیر فایل: /controllers/authController.js
// توضیح: کنترلر احراز هویت پیشرفته با پشتیبانی از Refresh Token.
// این نسخه علاوه بر access token، یک refresh token امن (httpOnly cookie)
// صادر می‌کند تا امکان تمدید نشست بدون ذخیره‌سازی در سمت کلاینت فراهم شود.
//
// [v2.3.0] تغییرات:
// - افزودن منطق تولید و ذخیره refresh token
// - بروزرسانی ورود/ثبت‌نام/گیتهاب برای برگرداندن refresh token در کوکی
// - افزودن کنترلر refreshToken برای تمدید access token
// - افزودن کنترلر logout برای ابطال refresh token
// - Access token مدت کوتاه‌تر (15 دقیقه)، Refresh token بلندمدت (30 روز)

// ============================================================
// بخش ۱: ایمپورت کتابخانه‌ها و وابستگی‌های اصلی
// ============================================================
const jwt = require('jsonwebtoken');                 // JWT
const crypto = require('crypto');                    // تولید توکن‌های تصادفی
const bcrypt = require('bcryptjs');                  // هش کردن امن (Async)
const axios = require('axios');                     // درخواست‌های HTTP

// ============================================================
// بخش ۲: ایمپورت مدل‌ها و ابزارهای کمکی
// ============================================================
const User = require('../models/User');
const ConfirmationToken = require('../models/ConfirmationToken');
const RefreshToken = require('../models/RefreshToken'); // [v2.3.0] جدید

const {
  sendConfirmationEmail,
  generateUniqueUsername,
} = require('../utils/controllerUtils');
const {
  validateEmail,
  validateFullName,
  validateUsername,
  validatePassword,
} = require('../utils/validation');

// ============================================================
// بخش ۳: ثابت‌های امنیتی
// ============================================================
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES || '15m';   // [v2.3.0] کوتاه‌مدت
const JWT_REFRESH_EXPIRES_DAYS = 30;                                   // ۳۰ روز
const SALT_ROUNDS = 12;
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

// ============================================================
// بخش ۴: توابع کمکی (Utility Functions)
// ============================================================

/**
 * @function createAccessToken
 * @description تولید Access Token کوتاه‌مدت (15 دقیقه)
 * @param {string} userId
 * @returns {string}
 */
const createAccessToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, {
    expiresIn: JWT_ACCESS_EXPIRES,
    clockTolerance: 30,
  });
};

/**
 * @function createRefreshToken
 * @description تولید Refresh Token تصادفی امن و ذخیره آن در پایگاه داده
 * @param {string} userId
 * @returns {string} توکن خام برای ارسال به کاربر
 */
const createRefreshToken = async (userId) => {
  const token = crypto.randomBytes(40).toString('hex'); // 80 کاراکتر
  const expiresAt = new Date(Date.now() + JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
  await RefreshToken.create({ token, user: userId, expiresAt });
  return token;
};

/**
 * @function setTokenCookies
 * @description ذخیره access token و refresh token در کوکی‌های امن
 */
const setTokenCookies = (res, accessToken, refreshToken) => {
  // Access token (کوتاه‌مدت)
  res.cookie('token', accessToken, {
    httpOnly: true,
    sameSite: 'Strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 15 * 60 * 1000, // 15 دقیقه (هماهنگ با expiry JWT)
  });
  // Refresh token (بلندمدت)
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    sameSite: 'Strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth',           // فقط در مسیرهای auth قابل ارسال
    maxAge: JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
  });
};

/**
 * @function clearTokenCookies
 * @description پاک‌سازی کوکی‌های احراز هویت (خروج)
 */
const clearTokenCookies = (res) => {
  res.clearCookie('token');
  res.clearCookie('refreshToken', { path: '/api/auth' });
};

// ============================================================
// بخش ۵: میدلورهای احراز هویت (بدون تغییر نسبت به نسخه قبل)
// ============================================================
module.exports.requireAuth = async (req, res, next) => {
  const token =
    req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.split(' ')[1]
      : req.cookies?.token;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'لطفاً وارد شوید. توکن احراز هویت یافت نشد.',
    });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).select(
      'email username avatar bookmarks bio fullName confirmed website'
    );
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'حساب کاربری مرتبط با این توکن دیگر وجود ندارد.',
      });
    }
    res.locals.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'نشست شما منقضی شده است. لطفاً دوباره وارد شوید.',
      });
    }
    return res.status(401).json({
      success: false,
      error: 'توکن نامعتبر است.',
    });
  }
};

module.exports.optionalAuth = async (req, res, next) => {
  const token =
    req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.split(' ')[1]
      : req.cookies?.token;
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).select(
      'email username avatar bookmarks bio fullName confirmed website'
    );
    if (user) res.locals.user = user;
  } catch (_) { /* ignore */ }
  next();
};

// ============================================================
// بخش ۶: کنترلرهای احراز هویت (با افزودن refresh token)
// ============================================================

/**
 * @controller loginAuthentication
 * @description ورود کاربر و صدور access + refresh token
 * @route POST /api/auth/login
 */
module.exports.loginAuthentication = async (req, res, next) => {
  const { usernameOrEmail, password } = req.body;
  if (!usernameOrEmail || !password) {
    return res.status(400).json({
      success: false,
      error: 'لطفاً نام کاربری/ایمیل و رمز عبور را وارد کنید.',
    });
  }
  try {
    const user = await User.findOne({
      $or: [
        { email: usernameOrEmail.toLowerCase() },
        { username: usernameOrEmail.toLowerCase() },
      ],
    }).select('+password');

    if (!user || !user.password) {
      return res.status(401).json({
        success: false,
        error: 'نام کاربری یا رمز عبور اشتباه است.',
      });
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'نام کاربری یا رمز عبور اشتباه است.',
      });
    }

    const accessToken = createAccessToken(user._id);
    const refreshToken = await createRefreshToken(user._id); // [v2.3.0]
    setTokenCookies(res, accessToken, refreshToken);

    return res.status(200).json({
      success: true,
      data: {
        user: {
          _id: user._id,
          email: user.email,
          username: user.username,
          avatar: user.avatar,
          fullName: user.fullName,
          bio: user.bio,
          website: user.website,
          bookmarks: user.bookmarks,
        },
        accessToken,  // اختیاری: برخی کلاینت‌ها ترجیح می‌دهند توکن را در بدنه نیز بگیرند
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @controller register
 * @description ثبت‌نام کاربر جدید + صدور refresh token
 * @route POST /api/auth/register
 */
module.exports.register = async (req, res, next) => {
  const { username, fullName, email, password } = req.body;
  const usernameError = validateUsername(username);
  if (usernameError) return res.status(400).json({ success: false, error: usernameError });
  const fullNameError = validateFullName(fullName);
  if (fullNameError) return res.status(400).json({ success: false, error: fullNameError });
  const emailError = validateEmail(email);
  if (emailError) return res.status(400).json({ success: false, error: emailError });
  const passwordError = validatePassword(password);
  if (passwordError) return res.status(400).json({ success: false, error: passwordError });

  try {
    const user = new User({
      username: username.toLowerCase(),
      fullName,
      email: email.toLowerCase(),
      password,
    });
    const confirmationToken = new ConfirmationToken({
      user: user._id,
      token: crypto.randomBytes(20).toString('hex'),
    });
    await Promise.all([user.save(), confirmationToken.save()]);

    const accessToken = createAccessToken(user._id);
    const refreshToken = await createRefreshToken(user._id); // [v2.3.0]
    setTokenCookies(res, accessToken, refreshToken);

    sendConfirmationEmail(user.username, user.email, confirmationToken.token);

    return res.status(201).json({
      success: true,
      data: {
        user: {
          _id: user._id,
          email: user.email,
          username: user.username,
          fullName: user.fullName,
        },
        accessToken,
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue)[0];
      return res.status(409).json({
        success: false,
        error: `این ${field === 'email' ? 'ایمیل' : 'نام کاربری'} قبلاً ثبت شده است.`,
      });
    }
    next(err);
  }
};

/**
 * @controller githubLoginAuthentication
 * @description ورود/ثبت‌نام GitHub OAuth + refresh token
 * @route POST /api/auth/login/github
 */
module.exports.githubLoginAuthentication = async (req, res, next) => {
  const { code, state } = req.body;
  if (!code || !state) {
    return res.status(400).json({ success: false, error: 'کد دسترسی و state گیت‌هاب الزامی است.' });
  }
  try {
    const tokenResponse = await axios.post(
      'https://github.com/login/oauth/access_token',
      { client_id: GITHUB_CLIENT_ID, client_secret: GITHUB_CLIENT_SECRET, code, state },
      { headers: { Accept: 'application/json' } }
    );
    const accessTokenGit = tokenResponse.data.access_token;
    if (!accessTokenGit) {
      return res.status(400).json({ success: false, error: 'دریافت توکن دسترسی گیت‌هاب با خطا مواجه شد.' });
    }
    const [githubUserResponse, emailsResponse] = await Promise.all([
      axios.get('https://api.github.com/user', { headers: { Authorization: `token ${accessTokenGit}` } }),
      axios.get('https://api.github.com/user/emails', { headers: { Authorization: `token ${accessTokenGit}` } }),
    ]);
    const githubUser = githubUserResponse.data;
    const primaryEmail = emailsResponse.data.find(email => email.primary)?.email;
    if (!primaryEmail) {
      return res.status(400).json({ success: false, error: 'ایمیل اصلی گیت‌هاب شما یافت نشد.' });
    }

    let user = await User.findOne({ githubId: githubUser.id });
    if (user) {
      const accessToken = createAccessToken(user._id);
      const refreshToken = await createRefreshToken(user._id);
      setTokenCookies(res, accessToken, refreshToken);
      return res.status(200).json({
        success: true,
        data: {
          user: { _id: user._id, email: user.email, username: user.username, avatar: user.avatar, bookmarks: user.bookmarks },
          accessToken,
        },
      });
    }

    const existingUser = await User.findOne({
      $or: [{ email: primaryEmail }, { username: githubUser.login.toLowerCase() }],
    });
    let finalUsername = githubUser.login.toLowerCase();
    if (existingUser) {
      if (existingUser.email === primaryEmail) {
        return res.status(400).json({ success: false, error: 'کاربری با این ایمیل قبلاً وجود دارد.' });
      }
      finalUsername = await generateUniqueUsername(githubUser.login);
    }
    user = new User({
      email: primaryEmail,
      fullName: githubUser.name || githubUser.login,
      username: finalUsername,
      githubId: githubUser.id,
      avatar: githubUser.avatar_url,
      confirmed: true,
    });
    await user.save();

    const accessToken = createAccessToken(user._id);
    const refreshToken = await createRefreshToken(user._id);
    setTokenCookies(res, accessToken, refreshToken);
    return res.status(201).json({
      success: true,
      data: {
        user: { _id: user._id, email: user.email, username: user.username, avatar: user.avatar, bookmarks: user.bookmarks },
        accessToken,
      },
    });
  } catch (err) {
    if (err.response?.status === 401) {
      return res.status(400).json({ success: false, error: 'کد دسترسی گیت‌هاب نامعتبر یا منقضی شده است.' });
    }
    next(err);
  }
};

/**
 * @controller changePassword
 * @description تغییر رمز عبور (بدون تغییر)
 */
module.exports.changePassword = async (req, res, next) => {
  // ... (کد دقیقاً مانند قبل) ...
  // برای خلاص‌سازی از تکرار، همان پیاده‌سازی قبلی را حفظ کنید
};

// ============================================================
// [v2.3.0] کنترلرهای جدید برای Refresh Token و خروج
// ============================================================

/**
 * @controller refreshToken
 * @description دریافت access token جدید با ارائه refresh token معتبر
 * @route POST /api/auth/refresh-token
 */
module.exports.refreshToken = async (req, res, next) => {
  const refreshTokenValue = req.cookies?.refreshToken;
  if (!refreshTokenValue) {
    return res.status(401).json({ success: false, error: 'توکن تمدید یافت نشد.' });
  }

  try {
    // یافتن توکن در پایگاه داده
    const storedToken = await RefreshToken.findOne({ token: refreshTokenValue });
    if (!storedToken || storedToken.expiresAt < new Date()) {
      // در صورت نامعتبر بودن، کوکی را پاک کن
      clearTokenCookies(res);
      return res.status(401).json({ success: false, error: 'توکن تمدید نامعتبر یا منقضی شده است.' });
    }

    // (اختیاری) بررسی وجود کاربر
    const user = await User.findById(storedToken.user);
    if (!user) {
      await storedToken.remove(); // پاکسازی توکن بی‌صاحب
      clearTokenCookies(res);
      return res.status(401).json({ success: false, error: 'حساب کاربری یافت نشد.' });
    }

    // تولید access token جدید
    const newAccessToken = createAccessToken(user._id);
    // استراتژی چرخش refresh token: حذف قدیمی و ایجاد جدید (امنیت بیشتر)
    await storedToken.remove();
    const newRefreshToken = await createRefreshToken(user._id);

    setTokenCookies(res, newAccessToken, newRefreshToken);

    return res.status(200).json({
      success: true,
      accessToken: newAccessToken,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @controller logout
 * @description خروج کاربر و ابطال refresh token
 * @route POST /api/auth/logout
 */
module.exports.logout = async (req, res, next) => {
  const refreshTokenValue = req.cookies?.refreshToken;
  if (refreshTokenValue) {
    // حذف refresh token از DB (حتی اگر منقضی باشد، خطا مهم نیست)
    await RefreshToken.deleteOne({ token: refreshTokenValue }).catch(() => {});
  }
  clearTokenCookies(res);
  return res.status(200).json({ success: true, message: 'با موفقیت خارج شدید.' });
};
