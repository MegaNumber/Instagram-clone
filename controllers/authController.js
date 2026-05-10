// مسیر فایل: /controllers/authController.js
// توضیح: کنترلر احراز هویت پیشرفته. این فایل هسته اصلی امنیت برنامه شامل
// ورود، ثبت‌نام (محلی و OAuth)، تغییر رمز عبور، تمدید توکن و خروج را
// مدیریت می‌کند. از جدیدترین کتابخانه‌ها و الگوهای امنیتی استفاده می‌کند.
//
// [v2.4.0] تغییرات:
// - ثبت‌نام کاربر اکنون با تراکنش MongoDB انجام می‌شود (atomic User + ConfirmationToken)
// - افزودن Refresh Token و مسیرهای refresh-token / logout
// - استفاده از bcryptjs برای هش Async واقعی
// - JWT با clockTolerance و تفکیک Access Token کوتاه‌مدت (15m) از Refresh Token بلندمدت (30d)

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
const RefreshToken = require('../models/RefreshToken'); // [v2.3.0]

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
const runTransaction = require('../utils/transactionHelper'); // [v2.4.0] تراکنش

// ============================================================
// بخش ۳: ثابت‌های امنیتی
// ============================================================
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES || '15m';     // [v2.3.0] کوتاه‌مدت
const JWT_REFRESH_EXPIRES_DAYS = 30;                                     // ۳۰ روز
const SALT_ROUNDS = 12;
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

// ============================================================
// بخش ۴: توابع کمکی (Utility Functions)
// ============================================================

/**
 * @function createAccessToken
 * @description تولید Access Token کوتاه‌مدت (15 دقیقه)
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
 */
const createRefreshToken = async (userId) => {
  const token = crypto.randomBytes(40).toString('hex');
  const expiresAt = new Date(Date.now() + JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
  await RefreshToken.create({ token, user: userId, expiresAt });
  return token;
};

/**
 * @function setTokenCookies
 * @description ذخیره access token و refresh token در کوکی‌های امن
 */
const setTokenCookies = (res, accessToken, refreshToken) => {
  // Access token
  res.cookie('token', accessToken, {
    httpOnly: true,
    sameSite: 'Strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 15 * 60 * 1000, // 15 دقیقه
  });
  // Refresh token
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    sameSite: 'Strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth',           // فقط در مسیرهای auth
    maxAge: JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
  });
};

/**
 * @function clearTokenCookies
 * @description پاک‌سازی کوکی‌های احراز هویت
 */
const clearTokenCookies = (res) => {
  res.clearCookie('token');
  res.clearCookie('refreshToken', { path: '/api/auth' });
};

// ============================================================
// بخش ۵: میدلورهای احراز هویت
// ============================================================

/**
 * @middleware requireAuth
 * @description محافظت از مسیرهای خصوصی
 */
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

/**
 * @middleware optionalAuth
 * @description احراز هویت اختیاری
 */
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
// بخش ۶: کنترلرهای احراز هویت
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
    const refreshToken = await createRefreshToken(user._id);
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
        accessToken,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @controller register
 * @description ثبت‌نام کاربر جدید (اتمیک با تراکنش) + refresh token
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
    // [v2.4.0] تراکنش برای ایجاد هم‌زمان User و ConfirmationToken
    const { user, confirmationToken } = await runTransaction(async (session) => {
      const user = new User({
        username: username.toLowerCase(),
        fullName,
        email: email.toLowerCase(),
        password,
      });
      await user.save({ session });

      const confirmationToken = new ConfirmationToken({
        user: user._id,
        token: crypto.randomBytes(20).toString('hex'),
      });
      await confirmationToken.save({ session });

      return { user, confirmationToken };
    });

    const accessToken = createAccessToken(user._id);
    const refreshToken = await createRefreshToken(user._id);
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
 * @description احراز هویت از طریق گیت‌هاب OAuth + refresh token
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
 * @description تغییر رمز عبور کاربر
 * @route PUT /api/auth/password
 */
module.exports.changePassword = async (req, res, next) => {
  const { oldPassword, newPassword } = req.body;
  const user = res.locals.user;

  if (!oldPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      error: 'لطفاً رمز عبور فعلی و جدید را وارد کنید.',
    });
  }

  try {
    const userDocument = await User.findById(user._id).select('+password');

    const isOldPasswordValid = await bcrypt.compare(oldPassword, userDocument.password);
    if (!isOldPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'رمز عبور فعلی اشتباه است.',
      });
    }

    const newPasswordError = validatePassword(newPassword);
    if (newPasswordError) {
      return res.status(400).json({ success: false, error: newPasswordError });
    }

    const isSamePassword = await bcrypt.compare(newPassword, userDocument.password);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        error: 'رمز عبور جدید نمی‌تواند با رمز عبور فعلی یکسان باشد.',
      });
    }

    userDocument.password = newPassword;
    await userDocument.save();

    return res.status(200).json({
      success: true,
      message: 'رمز عبور با موفقیت تغییر یافت.',
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @controller refreshToken
 * @description دریافت access token جدید با refresh token
 * @route POST /api/auth/refresh-token
 */
module.exports.refreshToken = async (req, res, next) => {
  const refreshTokenValue = req.cookies?.refreshToken;
  if (!refreshTokenValue) {
    return res.status(401).json({ success: false, error: 'توکن تمدید یافت نشد.' });
  }

  try {
    const storedToken = await RefreshToken.findOne({ token: refreshTokenValue });
    if (!storedToken || storedToken.expiresAt < new Date()) {
      clearTokenCookies(res);
      return res.status(401).json({ success: false, error: 'توکن تمدید نامعتبر یا منقضی شده است.' });
    }

    const user = await User.findById(storedToken.user);
    if (!user) {
      await storedToken.remove();
      clearTokenCookies(res);
      return res.status(401).json({ success: false, error: 'حساب کاربری یافت نشد.' });
    }

    const newAccessToken = createAccessToken(user._id);
    // چرخش refresh token
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
    await RefreshToken.deleteOne({ token: refreshTokenValue }).catch(() => {});
  }
  clearTokenCookies(res);
  return res.status(200).json({ success: true, message: 'با موفقیت خارج شدید.' });
};
