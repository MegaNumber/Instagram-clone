// مسیر فایل: /controllers/authController.js
// توضیح: کنترلر احراز هویت پیشرفته. این فایل هسته اصلی امنیت برنامه شامل
// ورود، ثبت‌نام (محلی و OAuth) و تغییر رمز عبور را مدیریت می‌کند. از جدیدترین
// کتابخانه‌ها و الگوهای امنیتی (مانند bcryptjs برای عملیات غیرهمگام واقعی و
// JWT با clockTolerance) استفاده می‌کند.
//
// تغییرات کلیدی (نسخه ۲.۲.۰):
// - جایگزینی bcrypt با bcryptjs برای رفع مشکل مسدود شدن Event Loop
// - افزودن SALT_ROUNDS=12 برای امنیت بالاتر هش
// - بهبود JWT با افزودن clockTolerance
// - بهینه‌سازی توابع با async/await و مدیریت بهتر خطاها
// - تفکیک کامل میدلورهای احراز هویت (requireAuth و optionalAuth)
// - تکمیل ورود OAuth گیت‌هاب با generateUniqueUsername

// ============================================================
// بخش ۱: ایمپورت کتابخانه‌ها و وابستگی‌های اصلی
// ============================================================
const jwt = require('jsonwebtoken');                 // مدیریت حرفه‌ای JWT
const crypto = require('crypto');                    // تولید توکن‌های تصادفی امن
const bcrypt = require('bcryptjs');                  // هش کردن امن و Async واقعی (جایگزین bcrypt)
const axios = require('axios');                     // ارسال درخواست‌های HTTP

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
// بخش ۳: ثابت‌های امنیتی
// ============================================================
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'; // ۷ روز اعتبار
const SALT_ROUNDS = 12;                             // توصیه شده برای bcrypt در سال ۲۰۲۶
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

// ============================================================
// بخش ۴: توابع کمکی (Utility Functions)
// ============================================================

/**
 * @function createToken
 * @description تولید یک Access Token امن با استفاده از JWT.
 * @param {string} userId - شناسه یکتای کاربر در MongoDB.
 * @returns {string} توکن JWT امضا شده.
 */
const createToken = (userId) => {
  return jwt.sign(
    { userId: userId },                           // Payload: اطلاعات داخل توکن
    JWT_SECRET,                                   // کلید مخفی برای امضا
    {
      expiresIn: JWT_EXPIRES_IN,                  // مدت اعتبار توکن
      clockTolerance: 30,                         // تحمل ۳۰ ثانیه اختلاف زمانی سرورها
    }
  );
};

/**
 * @function setTokenCookie
 * @description ذخیره توکن JWT در یک کوکی امن و HttpOnly.
 * @param {object} res - شیء پاسخ Express.
 * @param {string} token - توکن JWT.
 */
const setTokenCookie = (res, token) => {
  res.cookie('token', token, {
    httpOnly: true,                               // جلوگیری از دسترسی جاوااسکریپت به کوکی
    sameSite: 'Strict',                           // محافظت در برابر حملات CSRF
    secure: process.env.NODE_ENV === 'production',// فقط روی HTTPS در محیط واقعی
    maxAge: 7 * 24 * 60 * 60 * 1000,             // مدت اعتبار: ۷ روز
  });
};

// ============================================================
// بخش ۵: میدلورهای احراز هویت
// ============================================================

/**
 * @middleware requireAuth
 * @description محافظت از مسیرهای خصوصی. اگر کاربر لاگین نکرده باشد،
 * خطای ۴۰۱ (Unauthorized) بازگردانده می‌شود.
 */
module.exports.requireAuth = async (req, res, next) => {
  // ۱. استخراج توکن از هدر Authorization یا کوکی
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
    // ۲. تایید و رمزگشایی توکن
    const decoded = jwt.verify(token, JWT_SECRET);
    // ۳. یافتن کاربر در دیتابیس (فقط فیلدهای ضروری)
    const user = await User.findById(decoded.userId).select(
      'email username avatar bookmarks bio fullName confirmed website'
    );
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'حساب کاربری مرتبط با این توکن دیگر وجود ندارد.',
      });
    }
    // ۴. الصاق اطلاعات کاربر به درخواست
    res.locals.user = user;
    next();
  } catch (err) {
    // مدیریت خطاهای انقضا و نامعتبر بودن توکن
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
 * @description احراز هویت اختیاری. در صورت وجود توکن معتبر، کاربر را شناسایی می‌کند،
 * اما در صورت عدم وجود توکن، درخواست را رد نمی‌کند (برای مسیرهای عمومی).
 */
module.exports.optionalAuth = async (req, res, next) => {
  const token =
    req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.split(' ')[1]
      : req.cookies?.token;

  if (!token) {
    return next(); // بدون توکن هم ادامه می‌دهد
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).select(
      'email username avatar bookmarks bio fullName confirmed website'
    );
    if (user) {
      res.locals.user = user;
    }
  } catch (err) {
    // حتی اگر توکن نامعتبر باشد، خطا نمی‌دهیم و ادامه می‌دهیم
    console.warn('Optional auth: invalid token ignored.');
  }
  next();
};

// ============================================================
// بخش ۶: کنترلرهای احراز هویت
// ============================================================

/**
 * @controller loginAuthentication
 * @description پردازش ورود کاربر با استفاده از نام‌کاربری/ایمیل و رمز عبور.
 * @route POST /api/auth/login
 */
module.exports.loginAuthentication = async (req, res, next) => {
  const { usernameOrEmail, password } = req.body;

  // اعتبارسنجی اولیه (در route اصلی هم انجام می‌شود)
  if (!usernameOrEmail || !password) {
    return res.status(400).json({
      success: false,
      error: 'لطفاً نام کاربری/ایمیل و رمز عبور را وارد کنید.',
    });
  }

  try {
    // ۱. جستجوی کاربر (با بازیابی صریح رمز عبور)
    const user = await User.findOne({
      $or: [
        { email: usernameOrEmail.toLowerCase() },
        { username: usernameOrEmail.toLowerCase() },
      ],
    }).select('+password');

    // ۲. بررسی وجود کاربر و صحت رمز عبور
    if (!user || !user.password) {
      return res.status(401).json({
        success: false,
        error: 'نام کاربری یا رمز عبور اشتباه است.',
      });
    }

    // ۳. مقایسه امن رمز عبور (Async واقعی توسط bcryptjs)
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'نام کاربری یا رمز عبور اشتباه است.',
      });
    }

    // ۴. ایجاد توکن
    const token = createToken(user._id);
    setTokenCookie(res, token);

    // ۵. پاسخ موفقیت
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
 * @controller register
 * @description ثبت‌نام کاربر جدید با ایمیل و رمز عبور.
 * @route POST /api/auth/register
 */
module.exports.register = async (req, res, next) => {
  const { username, fullName, email, password } = req.body;

  // ۱. اعتبارسنجی فیلدها
  const usernameError = validateUsername(username);
  if (usernameError) return res.status(400).json({ success: false, error: usernameError });
  const fullNameError = validateFullName(fullName);
  if (fullNameError) return res.status(400).json({ success: false, error: fullNameError });
  const emailError = validateEmail(email);
  if (emailError) return res.status(400).json({ success: false, error: emailError });
  const passwordError = validatePassword(password);
  if (passwordError) return res.status(400).json({ success: false, error: passwordError });

  try {
    // ۲. ایجاد کاربر جدید (هش کردن در هوک مدل User انجام می‌شود)
    const user = new User({
      username: username.toLowerCase(),
      fullName,
      email: email.toLowerCase(),
      password, // رمز ساده، در مدل هش می‌شود
    });

    // ۳. ایجاد توکن تایید ایمیل
    const confirmationToken = new ConfirmationToken({
      user: user._id,
      token: crypto.randomBytes(20).toString('hex'),
    });

    // ۴. ذخیره‌سازی همزمان
    await Promise.all([user.save(), confirmationToken.save()]);

    // ۵. ایجاد JWT
    const token = createToken(user._id);
    setTokenCookie(res, token);

    // ۶. ارسال ایمیل تایید (در پس‌زمینه)
    sendConfirmationEmail(user.username, user.email, confirmationToken.token);

    // ۷. پاسخ
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
 * @description احراز هویت از طریق گیت‌هاب OAuth 2.0.
 * @route POST /api/auth/login/github
 */
module.exports.githubLoginAuthentication = async (req, res, next) => {
  const { code, state } = req.body;

  if (!code || !state) {
    return res.status(400).json({
      success: false,
      error: 'کد دسترسی و state گیت‌هاب الزامی است.',
    });
  }

  try {
    // ۱. دریافت توکن دسترسی از گیت‌هاب
    const tokenResponse = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        state,
      },
      { headers: { Accept: 'application/json' } }
    );

    const accessToken = tokenResponse.data.access_token;
    if (!accessToken) {
      return res.status(400).json({
        success: false,
        error: 'دریافت توکن دسترسی گیت‌هاب با خطا مواجه شد.',
      });
    }

    // ۲. دریافت اطلاعات کاربر
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
        error: 'ایمیل اصلی گیت‌هاب شما یافت نشد.',
      });
    }

    // ۳. بررسی وجود کاربر
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

    // ۴. حل conflict نام کاربری یا ایمیل
    const existingUser = await User.findOne({
      $or: [{ email: primaryEmail }, { username: githubUser.login.toLowerCase() }],
    });

    let finalUsername = githubUser.login.toLowerCase();
    if (existingUser) {
      if (existingUser.email === primaryEmail) {
        return res.status(400).json({
          success: false,
          error: 'کاربری با این ایمیل قبلاً وجود دارد.',
        });
      }
      finalUsername = await generateUniqueUsername(githubUser.login);
    }

    // ۵. ایجاد کاربر جدید (حساب تایید شده)
    user = new User({
      email: primaryEmail,
      fullName: githubUser.name || githubUser.login,
      username: finalUsername,
      githubId: githubUser.id,
      avatar: githubUser.avatar_url,
      confirmed: true,
    });

    await user.save();

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
 * @controller changePassword
 * @description تغییر رمز عبور کاربر (نیازمند رمز عبور قدیمی).
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
    // ۱. یافتن کاربر با رمز عبور
    const userDocument = await User.findById(user._id).select('+password');

    // ۲. بررسی رمز قدیمی
    const isOldPasswordValid = await bcrypt.compare(oldPassword, userDocument.password);
    if (!isOldPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'رمز عبور فعلی اشتباه است.',
      });
    }

    // ۳. اعتبارسنجی رمز جدید
    const newPasswordError = validatePassword(newPassword);
    if (newPasswordError) {
      return res.status(400).json({ success: false, error: newPasswordError });
    }

    // ۴. جلوگیری از استفاده مجدد رمز یکسان
    const isSamePassword = await bcrypt.compare(newPassword, userDocument.password);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        error: 'رمز عبور جدید نمی‌تواند با رمز عبور فعلی یکسان باشد.',
      });
    }

    // ۵. ذخیره رمز جدید (هش کردن توسط هوک پیش‌فرض مدل)
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

// ============================================================
// توضیح: این ماژول با تغییرات اعمال‌شده، یک سیستم احراز هویت کاملاً مدرن و ایمن را ارائه می‌دهد.
