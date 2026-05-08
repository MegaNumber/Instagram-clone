// مسیر فایل: /controllers/authController.js
// توضیح: کنترلر احراز هویت. این فایل منطق اصلی ورود، ثبت‌نام، تغییر رمز عبور،
// احراز هویت گیت‌هاب و میدلورهای محافظت از مسیرها را مدیریت می‌کند.
// از jsonwebtoken برای توکن‌های امن و bcrypt با async/await برای هش کردن استفاده می‌کند.

// ============================================================
// بخش ۱: ایمپورت کتابخانه‌ها و وابستگی‌های اصلی
// ============================================================
const jwt = require('jsonwebtoken');        // کتابخانه استاندارد JWT (جایگزین jwt-simple)
const crypto = require('crypto');           // تولید اعداد تصادفی امن برای توکن‌های تأیید
const bcrypt = require('bcrypt');           // هش و مقایسه رمز عبور
const axios = require('axios');             // برای درخواست‌های HTTP به API گیت‌هاب

// ============================================================
// بخش ۲: ایمپورت مدل‌ها و ابزارهای کمکی
// ============================================================
const User = require('../models/User');
const ConfirmationToken = require('../models/ConfirmationToken');

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
// بخش ۳: ثابت‌های پیکربندی
// ============================================================
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'; // مدت اعتبار توکن: ۷ روز
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

// ============================================================
// بخش ۴: توابع کمکی (Utility Functions)
// ============================================================

/**
 * @function createToken
 * @description تولید یک JWT امضا‌شده برای کاربر
 * @param {string} userId - شناسه کاربر
 * @returns {string} توکن JWT
 */
const createToken = (userId) => {
  return jwt.sign(
    { id: userId },          // payload: فقط شامل شناسه کاربر
    JWT_SECRET,              // کلید مخفی برای امضا
    { expiresIn: JWT_EXPIRES_IN } // مدت اعتبار
  );
};

/**
 * @function setTokenCookie
 * @description تنظیم توکن در کوکی امن (httponly, sameSite)
 * @param {object} res - شیء پاسخ Express
 * @param {string} token - توکن JWT
 */
const setTokenCookie = (res, token) => {
  res.cookie('token', token, {
    httpOnly: true,          // غیرقابل دسترسی توسط جاوااسکریپت
    sameSite: 'Strict',      // جلوگیری از CSRF
    secure: process.env.NODE_ENV === 'production', // فقط در HTTPS
    maxAge: 7 * 24 * 60 * 60 * 1000, // ۷ روز
  });
};

// ============================================================
// بخش ۵: میدلورهای احراز هویت
// ============================================================

/**
 * @function requireAuth
 * @description میدلور محافظت از مسیرها - فقط کاربران احراز هویت شده مجازند
 * @route میدلور سراسری یا مسیری
 */
module.exports.requireAuth = async (req, res, next) => {
  // دریافت توکن از هدر Authorization یا کوکی
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
    // تأیید و رمزگشایی توکن
    const decoded = jwt.verify(token, JWT_SECRET);
    // یافتن کاربر با استفاده از شناسه موجود در توکن
    const user = await User.findById(decoded.id).select(
      'email username avatar bookmarks bio fullName confirmed website'
    );
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'کاربر مرتبط با این توکن دیگر وجود ندارد.',
      });
    }
    // ذخیره کاربر در res.locals برای استفاده در کنترلرهای بعدی
    res.locals.user = user;
    next();
  } catch (err) {
    // مدیریت خطاهای انقضا و نامعتبر بودن توکن
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'توکن شما منقضی شده است. لطفاً دوباره وارد شوید.',
      });
    }
    return res.status(401).json({
      success: false,
      error: 'توکن نامعتبر است. لطفاً دوباره وارد شوید.',
    });
  }
};

/**
 * @function optionalAuth
 * @description میدلور احراز هویت اختیاری - در صورت وجود توکن کاربر را تشخیص می‌دهد
 * @route مسیرهای عمومی که رفتار متفاوتی برای کاربران وارد شده دارند
 */
module.exports.optionalAuth = async (req, res, next) => {
  const token =
    req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.split(' ')[1]
      : req.cookies?.token;

  if (!token) {
    // بدون توکن هم ادامه می‌دهیم (مهمان)
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select(
      'email username avatar bookmarks bio fullName confirmed website'
    );
    if (user) {
      res.locals.user = user;
    }
  } catch (err) {
    // اگر توکن نامعتبر بود، خطا نمی‌دهیم و به عنوان مهمان ادامه می‌دهیم
  }
  next();
};

// ============================================================
// بخش ۶: کنترلرهای احراز هویت
// ============================================================

/**
 * @function loginAuthentication
 * @description کنترلر ورود کاربر - احراز هویت با ایمیل/نام کاربری و رمز عبور
 * @route POST /api/auth/login
 */
module.exports.loginAuthentication = async (req, res, next) => {
  const { usernameOrEmail, password } = req.body;

  // اعتبارسنجی اولیه (اعتبارسنجی دقیق‌تر در routes انجام می‌شود)
  if (!usernameOrEmail || !password) {
    return res.status(400).json({
      success: false,
      error: 'لطفاً نام کاربری/ایمیل و رمز عبور را وارد کنید.',
    });
  }

  try {
    // ۱. جستجوی کاربر با ایمیل یا نام کاربری
    // استفاده از select('+password') برای بازیابی رمز عبور که با select: false مخفی شده است
    const user = await User.findOne({
      $or: [
        { email: usernameOrEmail.toLowerCase() },
        { username: usernameOrEmail.toLowerCase() },
      ],
    }).select('+password');

    if (!user || !user.password) {
      return res.status(401).json({
        success: false,
        error: 'اطلاعات وارد شده اشتباه است. لطفاً مجدداً تلاش کنید.',
      });
    }

    // ۲. مقایسه رمز عبور با استفاده از bcrypt (async/await)
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'اطلاعات وارد شده اشتباه است. لطفاً مجدداً تلاش کنید.',
      });
    }

    // ۳. تولید توکن JWT
    const token = createToken(user._id);

    // ۴. تنظیم توکن در کوکی امن
    setTokenCookie(res, token);

    // ۵. ارسال پاسخ موفقیت
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
        token,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @function register
 * @description کنترلر ثبت‌نام کاربر جدید
 * @route POST /api/auth/register
 */
module.exports.register = async (req, res, next) => {
  const { username, fullName, email, password } = req.body;

  // اعتبارسنجی دستی (اعتبارسنجی اولیه - اعتبارسنجی دقیق‌تر در routes انجام می‌شود)
  const usernameError = validateUsername(username);
  if (usernameError) return res.status(400).json({ success: false, error: usernameError });

  const fullNameError = validateFullName(fullName);
  if (fullNameError) return res.status(400).json({ success: false, error: fullNameError });

  const emailError = validateEmail(email);
  if (emailError) return res.status(400).json({ success: false, error: emailError });

  const passwordError = validatePassword(password);
  if (passwordError) return res.status(400).json({ success: false, error: passwordError });

  try {
    // ۱. ایجاد کاربر جدید (رمز عبور در هوک pre-save مدل User هش می‌شود)
    const user = new User({
      username: username.toLowerCase(),
      fullName,
      email: email.toLowerCase(),
      password,
    });

    // ۲. ایجاد توکن تأیید ایمیل
    const confirmationToken = new ConfirmationToken({
      user: user._id,
      token: crypto.randomBytes(20).toString('hex'),
    });

    // ۳. ذخیره همزمان کاربر و توکن تأیید
    await Promise.all([user.save(), confirmationToken.save()]);

    // ۴. تولید توکن JWT
    const token = createToken(user._id);

    // ۵. تنظیم توکن در کوکی
    setTokenCookie(res, token);

    // ۶. ارسال ایمیل تأیید (بدون await - ارسال در پس‌زمینه)
    sendConfirmationEmail(user.username, user.email, confirmationToken.token);

    // ۷. ارسال پاسخ موفقیت
    return res.status(201).json({
      success: true,
      data: {
        user: {
          _id: user._id,
          email: user.email,
          username: user.username,
          fullName: user.fullName,
        },
        token,
      },
    });
  } catch (err) {
    // مدیریت خطای یکتایی (duplicate key)
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
 * @function githubLoginAuthentication
 * @description کنترلر ورود/ثبت‌نام از طریق گیت‌هاب OAuth
 * @route POST /api/auth/login/github
 */
module.exports.githubLoginAuthentication = async (req, res, next) => {
  const { code, state } = req.body;

  // اعتبارسنجی ورودی‌ها
  if (!code || !state) {
    return res.status(400).json({
      success: false,
      error: 'کد دسترسی و state گیت‌هاب الزامی است.',
    });
  }

  try {
    // ۱. تبادل کد موقت با توکن دسترسی گیت‌هاب
    const tokenResponse = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        state,
      },
      {
        headers: { Accept: 'application/json' }, // دریافت پاسخ به صورت JSON
      }
    );

    const accessToken = tokenResponse.data.access_token;
    if (!accessToken) {
      return res.status(400).json({
        success: false,
        error: 'دریافت توکن دسترسی گیت‌هاب با خطا مواجه شد.',
      });
    }

    // ۲. دریافت اطلاعات کاربر از گیت‌هاب
    const [githubUserResponse, emailsResponse] = await Promise.all([
      axios.get('https://api.github.com/user', {
        headers: { Authorization: `token ${accessToken}` },
      }),
      axios.get('https://api.github.com/user/emails', {
        headers: { Authorization: `token ${accessToken}` },
      }),
    ]);

    const githubUser = githubUserResponse.data;
    const primaryEmail = emailsResponse.data.find((email) => email.primary)?.email;

    if (!primaryEmail) {
      return res.status(400).json({
        success: false,
        error: 'ایمیل اصلی گیت‌هاب شما یافت نشد. لطفاً یک ایمیل به حساب خود اضافه کنید.',
      });
    }

    // ۳. بررسی وجود کاربر با githubId
    let user = await User.findOne({ githubId: githubUser.id });
    if (user) {
      const token = createToken(user._id);
      setTokenCookie(res, token);
      return res.status(200).json({
        success: true,
        data: {
          user: {
            _id: user._id,
            email: user.email,
            username: user.username,
            avatar: user.avatar,
            bookmarks: user.bookmarks,
          },
          token,
        },
      });
    }

    // ۴. بررسی تداخل ایمیل یا نام کاربری
    const existingUser = await User.findOne({
      $or: [{ email: primaryEmail }, { username: githubUser.login.toLowerCase() }],
    });

    let finalUsername = githubUser.login.toLowerCase();
    if (existingUser) {
      if (existingUser.email === primaryEmail) {
        return res.status(400).json({
          success: false,
          error:
            'کاربری با این ایمیل قبلاً وجود دارد. لطفاً ایمیل اصلی گیت‌هاب خود را تغییر دهید.',
        });
      }
      // تولید نام کاربری یکتا
      finalUsername = await generateUniqueUsername(githubUser.login);
    }

    // ۵. ایجاد کاربر جدید
    user = new User({
      email: primaryEmail,
      fullName: githubUser.name || githubUser.login,
      username: finalUsername,
      githubId: githubUser.id,
      avatar: githubUser.avatar_url,
      confirmed: true, // ایمیل گیت‌هاب قبلاً تأیید شده است
    });

    await user.save();

    // ۶. تولید توکن و پاسخ
    const token = createToken(user._id);
    setTokenCookie(res, token);

    return res.status(201).json({
      success: true,
      data: {
        user: {
          _id: user._id,
          email: user.email,
          username: user.username,
          avatar: user.avatar,
          bookmarks: user.bookmarks,
        },
        token,
      },
    });
  } catch (err) {
    // مدیریت خطاهای axios
    if (err.response?.status === 401) {
      return res.status(400).json({
        success: false,
        error: 'کد دسترسی گیت‌هاب نامعتبر یا منقضی شده است.',
      });
    }
    next(err);
  }
};

/**
 * @function changePassword
 * @description کنترلر تغییر رمز عبور کاربر
 * @route PUT /api/auth/password
 */
module.exports.changePassword = async (req, res, next) => {
  const { oldPassword, newPassword } = req.body;
  const user = res.locals.user;

  // اعتبارسنجی اولیه
  if (!oldPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      error: 'لطفاً رمز عبور فعلی و رمز عبور جدید را وارد کنید.',
    });
  }

  try {
    // ۱. یافتن کاربر با رمز عبور
    const userDocument = await User.findById(user._id).select('+password');

    // ۲. بررسی صحت رمز عبور فعلی
    const isOldPasswordValid = await bcrypt.compare(oldPassword, userDocument.password);
    if (!isOldPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'رمز عبور فعلی اشتباه است. لطفاً مجدداً تلاش کنید.',
      });
    }

    // ۳. اعتبارسنجی رمز عبور جدید
    const newPasswordError = validatePassword(newPassword);
    if (newPasswordError) {
      return res.status(400).json({ success: false, error: newPasswordError });
    }

    // ۴. جلوگیری از استفاده مجدد از رمز عبور فعلی
    const isSamePassword = await bcrypt.compare(newPassword, userDocument.password);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        error: 'رمز عبور جدید نمی‌تواند با رمز عبور فعلی یکسان باشد.',
      });
    }

    // ۵. به‌روزرسانی رمز عبور (هش شدن در هوک pre-save مدل User انجام می‌شود)
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
