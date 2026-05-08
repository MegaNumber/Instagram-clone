// مسیر فایل: /index.js
// توضیح: نقطهٔ ورود اصلی سرور Express. این فایل مسئول پیکربندی و راه‌اندازی
// تمام میان‌افزارهای سراسری (امنیتی، عملکردی، لاگ‌گیری)، اتصال به MongoDB،
// فعال‌سازی Socket.io با احراز هویت JWT، و بارگذاری مسیرهای API است.
// طراحی آن بر اساس آخرین متدهای امنیتی و معماری لایه‌ای انجام شده است.
//
// ویژگی‌های کلیدی:
// - Helmet برای تنظیم هدرهای امنیتی
// - CORS مدیریت‌شده
// - Rate Limiting مبتنی بر Redis با استراتژی‌های مختلف
// - Slow Down برای کاهش نرخ درخواست‌های بیش‌ازحد
// - محافظت در برابر HPP و XSS
// - تجزیهٔ کوکی‌ها
// - فشرده‌سازی در محیط Production
// - پشتیبانی از چندین مسیر API شامل Stories، Messages، Reels، Feed هوشمند و Reports
// - مدیریت خطای ساختاریافته با پیام‌های فارسی
// - ارتباط بلادرنگ با Socket.io و احراز هویت از طریق handshake token
//
// @author Sandermoen & Contributors
// @version 2.1.0
// @since 2026

// ============================================================
// بخش ۱: بارگذاری متغیرهای محیطی
// ============================================================
require('dotenv').config();

// ============================================================
// بخش ۲: ایمپورت کتابخانه‌های اصلی
// ============================================================
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const http = require('http');
const socketio = require('socket.io');
const mongoose = require('mongoose');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const hpp = require('hpp');
const xss = require('xss-clean');
const jwt = require('jsonwebtoken');

// ============================================================
// بخش ۳: ایمپورت میان‌افزارهای سفارشی و مسیرها
// ============================================================
const apiRouter = require('./routes');
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
// مخفی‌سازی هدر X-Powered-By برای کاهش اطلاعات افشاشده
app.use(helmet.hidePoweredBy());

// ۵.۲. فعال‌سازی CORS با کنترل دقیق Origin
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : '*',
    credentials: true, // ارسال کوکی‌ها
  })
);

// ۵.۳. محافظت در برابر حملات آلودگی پارامترهای HTTP (HPP)
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
// بخش ۸: اعتماد به پروکسی معکوس (ضروری برای دریافت IP واقعی)
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
// بخش ۱۰: اعمال Rate Limiting و Slow Down
// ============================================================
// ۱۰.۱. محدودیت نرخ عمومی با Redis Store
app.use('/api', globalLimiter);

// ۱۰.۲. کاهش سرعت پاسخ‌ها به‌جای رد کامل درخواست‌های پرشمار
app.use('/api', apiSlowDown);

// ============================================================
// بخش ۱۱: مسیرهای API
// ============================================================
app.use('/api', apiRouter);

// اضافه کردن مسیرهای جدیدی که مستقیماً در اینجا بارگذاری می‌شوند
app.use('/api/stories', require('./routes/story'));
app.use('/api/messages', require('./routes/message'));
app.use('/api/reels', require('./routes/reel'));
app.use('/api/reports', require('./routes/report'));

// ============================================================
// بخش ۱۲: تنظیمات مخصوص محیط تولید
// ============================================================
if (process.env.NODE_ENV === 'production') {
  // فشرده‌سازی پاسخ‌ها با gzip
  app.use(compression());

  // سرو فایل‌های ساخته‌شدهٔ React (فرانت‌اند)
  app.use(express.static(path.join(__dirname, 'client/build')));

  // برای تمام مسیرهایی که با /api شروع نمی‌شوند، index.html ارسال شود
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
    socket.user = decoded; // اطلاعات کاربر در socket ذخیره می‌شود
    return next();
  } catch (err) {
    return next(new Error('Authentication error: Invalid token'));
  }
});

// ============================================================
// بخش ۱۷: مدیریت اتصالات Socket.io
// ============================================================
io.on('connection', (socket) => {
  // هر کاربر به یک room اختصاصی با شناسهٔ خود ملحق می‌شود
  socket.join(socket.user.id);
  console.log(`🔗 Socket connected: user ${socket.user.id}, socket ${socket.id}`);

  // در صورت نیاز، سایر رویدادها از فایل‌های جداگانه بارگذاری شوند
  // require('./handlers/socketHandler')(socket, io);
});

// ============================================================
// بخش ۱۸: راه‌اندازی نهایی سرور
// ============================================================
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
});

module.exports = app; // برای تست‌های احتمالی
