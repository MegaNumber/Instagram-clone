// مسیر فایل: /index.js
// توضیح: نقطهٔ ورود اصلی سرور Express. این فایل مسئول پیکربندی و راه‌اندازی
// تمام میان‌افزارهای سراسری (امنیتی، عملکردی، لاگ‌گیری)، اتصال به MongoDB،
// فعال‌سازی Socket.io با احراز هویت JWT، و بارگذاری یکپارچهٔ مسیرهای API است.
//
// @author Sandermoen & Contributors
// @version 2.2.0 (اصلاح حذف بارگذاری مضاعف مسیرهای stories, messages, reels, reports)
//
// [v2.2.0] تغییرات:
// - حذف app.use اضافی برای stories, messages, reels, reports (اکنون فقط از apiRouter استفاده می‌شود)
// - حفظ module.exports = app جهت تست‌های یکپارچگی

// ============================================================
// بخش ۱: بارگذاری متغیرهای محیطی
// ============================================================
require('dotenv').config();

// ============================================================
// بخش ۲: ایمپورت کتابخانه‌های اصلی
// ============================================================
const express = require('express');               // express@4.x
const cors = require('cors');                     // cors@2.x
const helmet = require('helmet');                 // helmet@7.x
const compression = require('compression');       // compression@1.x
const path = require('path');
const http = require('http');
const socketio = require('socket.io');            // socket.io@4.x
const mongoose = require('mongoose');             // mongoose@7.x
const morgan = require('morgan');                 // morgan@1.x
const cookieParser = require('cookie-parser');    // cookie-parser@1.x
const hpp = require('hpp');                       // hpp@0.x
const xss = require('xss-clean');                 // xss-clean@0.x
const jwt = require('jsonwebtoken');              // jsonwebtoken@9.x

// ============================================================
// بخش ۳: ایمپورت میان‌افزارهای سفارشی و مسیرها
// ============================================================
const apiRouter = require('./routes');            // تجمیع همهٔ زیرمسیرها در یک Router
const { globalLimiter, apiSlowDown } = require('./middleware/rateLimiter');

// ============================================================
// بخش ۴: ایجاد نمونهٔ Express و تنظیم پورت
// ============================================================
const app = express();
const PORT = process.env.PORT || 9000;

// ============================================================
// بخش ۵: میان‌افزارهای امنیتی پایه
// ============================================================

// ۵.۱. تنظیم هدرهای امنیتی با Helmet
app.use(helmet());
app.use(helmet.hidePoweredBy());

// ۵.۲. فعال‌سازی CORS با کنترل دقیق Origin
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : '*',
    credentials: true,
  })
);

// ۵.۳. محافظت در برابر آلودگی پارامترهای HTTP (HPP)
app.use(hpp());

// ۵.۴. پاک‌سازی ورودی‌ها از کدهای مخرب XSS
app.use(xss());

// ============================================================
// بخش ۶: تجزیهٔ بدنهٔ درخواست‌ها و کوکی‌ها
// ============================================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ============================================================
// بخش ۷: لاگ‌گیری (فقط در محیط توسعه)
// ============================================================
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// ============================================================
// بخش ۸: اعتماد به پروکسی معکوس (ضروری برای Rate Limiter)
// ============================================================
app.set('trust proxy', 1);

// ============================================================
// بخش ۹: سرو فایل‌های استاتیک
// ============================================================
// ۹.۱. پوشهٔ public (شامل تمام فایل‌های آپلودشده)
app.use(express.static(path.join(__dirname, 'public')));

// ۹.۲. مسیر مستقیم برای دسترسی به فایل‌های آپلودی
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// ============================================================
// بخش ۱۰: اعمال Rate Limiting و Slow Down سراسری
// ============================================================
// ۱۰.۱. محدودیت نرخ عمومی با Redis Store
app.use('/api', globalLimiter);

// ۱۰.۲. کاهش سرعت پاسخ‌ها به‌جای رد کامل درخواست‌های پرشمار
app.use('/api', apiSlowDown);

// ============================================================
// بخش ۱۱: مسیرهای API (تجمیع‌شده)
// ============================================================
// تمام endpointها از طریق apiRouter ( routes/index.js ) مدیریت می‌شوند.
// این شامل auth، users، posts، comments، notifications، stories،
// messages، reels، feed هوشمند و reports می‌شود.
// [v2.2.0] دیگر نیازی به app.use مجزا برای stories, messages, reels, reports نیست.
app.use('/api', apiRouter);

// ============================================================
// بخش ۱۲: تنظیمات مخصوص محیط تولید
// ============================================================
if (process.env.NODE_ENV === 'production') {
  // فشرده‌سازی پاسخ‌ها با gzip
  app.use(compression());

  // سرو فایل‌های ساخته‌شدهٔ React (فرانت‌اند)
  app.use(express.static(path.join(__dirname, 'client/build')));

  // برای تمام مسیرهای غیر API، فایل index.html فرانت‌اند ارسال شود
  app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
  });
}

// ============================================================
// بخش ۱۳: اتصال به پایگاه داده MongoDB
// ============================================================
(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB connected successfully');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  }
})();

// ============================================================
// بخش ۱۴: مدیریت خطای سراسری (Global Error Handler)
// ============================================================
app.use((err, req, res, next) => {
  // خطای حجم فایل Multer
  if (err.name === 'MulterError' && err.message === 'File too large') {
    return res.status(400).json({
      success: false,
      error: 'حجم فایل بیش از حد مجاز است.',
    });
  }

  const status = err.statusCode || 500;
  const message =
    status === 500 && process.env.NODE_ENV === 'production'
      ? 'خطای غیرمنتظره‌ای رخ داد. لطفاً بعداً تلاش کنید.'
      : err.message;

  res.status(status).json({
    success: false,
    error: message,
  });
});

// ============================================================
// بخش ۱۵: ایجاد سرور HTTP و راه‌اندازی Socket.io
// ============================================================
const server = http.createServer(app);

const io = socketio(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// ذخیره نمونهٔ io در app برای استفاده در کنترلرها
app.set('socketio', io);
console.log('🟢 Socket.io engine configured');

// ============================================================
// بخش ۱۶: میان‌افزار احراز هویت Socket.io
// ============================================================
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error: Token not provided'));
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    return next();
  } catch (err) {
    return next(new Error('Authentication error: Invalid token'));
  }
});

// ============================================================
// بخش ۱۷: مدیریت اتصالات Socket.io
// ============================================================
io.on('connection', (socket) => {
  socket.join(socket.user.id);
  console.log(`🔗 Socket connected: user ${socket.user.id}, socket ${socket.id}`);

  // بارگذاری مدیریت‌کننده‌های رویداد (در صورت نیاز)
  // require('./handlers/socketHandler')(socket, io);
});

// ============================================================
// بخش ۱۸: راه‌اندازی نهایی سرور
// ============================================================
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
});

// ============================================================
// بخش ۱۹: مدیریت graceful shutdown (خاموشی آرام)
// ============================================================
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} دریافت شد. خاموشی آرام آغاز می‌شود...`);
  await mongoose.connection.close(false);
  console.log('اتصال MongoDB بسته شد.');
  io.close();
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ============================================================
// بخش ۲۰: مدیریت rejectionهای سراسری
// ============================================================
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// ============================================================
// بخش ۲۱: صادرات app برای تست‌های یکپارچگی
// ============================================================
module.exports = app;
