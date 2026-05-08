// مسیر فایل: /index.js
// توضیح: نقطه ورودی اصلی سرور. این فایل مسئول راه‌اندازی Express، اعمال
// میدلورهای سراسری (امنیتی، فشرده‌سازی، لاگ‌گیری)، اتصال به MongoDB،
// سرو فایل‌های استاتیک و راه‌اندازی Socket.io با احراز هویت است.
// معماری آن به گونه‌ای طراحی شده که هم در محیط توسعه و هم در محیط تولید
// با حداکثر امنیت و عملکرد اجرا شود.

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
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const hpp = require('hpp');
const xss = require('xss-clean');
const jwt = require('jsonwebtoken');

// ============================================================
// بخش ۳: ایمپورت مسیرهای API
// ============================================================
const apiRouter = require('./routes');
const storyRoutes = require('./routes/story');
const messageRoutes = require('./routes/message');
const reelRoutes = require('./routes/reel');

// ============================================================
// بخش ۴: تنظیمات اولیه برنامه
// ============================================================
const app = express();
const PORT = process.env.PORT || 9000;

// بررسی متغیرهای حیاتی
if (!process.env.MONGO_URI || !process.env.JWT_SECRET) {
  console.error('FATAL ERROR: MONGO_URI or JWT_SECRET is not defined.');
  process.exit(1);
}

// ============================================================
// بخش ۵: میدلورهای امنیتی سراسری
// ============================================================

// ۵.۱. تنظیم هدرهای امنیتی با Helmet
app.use(helmet());
app.use(helmet.hidePoweredBy());

// ۵.۲. فعال‌سازی CORS
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : '*',
    credentials: true,
  })
);

// ۵.۳. محدودسازی نرخ درخواست‌ها برای تمام مسیرهای /api
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'تعداد درخواست‌ها بیش از حد مجاز است. لطفاً کمی صبر کنید.',
  },
});
app.use('/api', globalLimiter);

// ۵.۴. محافظت در برابر آلودگی پارامترهای HTTP و XSS
app.use(hpp());
app.use(xss());

// ============================================================
// بخش ۶: میدلورهای تجزیه بدنه و کوکی
// ============================================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ============================================================
// بخش ۷: میدلورهای غیرتولیدی (لاگ‌گیری)
// ============================================================
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// ============================================================
// بخش ۸: تنظیمات حیاتی اپلیکیشن
// ============================================================
app.set('trust proxy', 1);

// ============================================================
// بخش ۹: سرو فایل‌های استاتیک
// ============================================================
// ۹.۱. پوشه public (شامل uploads) در همه محیط‌ها
app.use(express.static(path.join(__dirname, 'public')));

// ۹.۲. مسیر کمکی مستقیم برای uploads
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// ============================================================
// بخش ۱۰: مسیرهای API
// ============================================================
app.use('/api', apiRouter);
app.use('/api/stories', storyRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/reels', reelRoutes);
// ============================================================
// بخش ۱۱: تنظیمات مخصوص محیط تولید
// ============================================================
if (process.env.NODE_ENV === 'production') {
  // فشرده‌سازی پاسخ‌ها
  app.use(compression());

  // سرو فایل‌های ساخته‌شده React
  app.use(express.static(path.join(__dirname, 'client/build')));

  // برای هر مسیری که با /api شروع نشود، index.html ری‌اکت را برگردان
  app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
  });
}

// ============================================================
// بخش ۱۲: اتصال به پایگاه داده MongoDB
// ============================================================
(async function connectToDatabase() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connection established successfully.');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
})();

// ============================================================
// بخش ۱۳: مدیریت خطاهای سراسری
// ============================================================
app.use((err, req, res, next) => {
  console.error(err.stack);

  // خطاهای Multer (حجم فایل)
  if (err.name === 'MulterError') {
    if (err.message === 'File too large') {
      return res.status(400).json({
        success: false,
        error: 'حجم فایل شما بیش از حد مجاز (۱۰ مگابایت) است.',
      });
    }
  }

  const statusCode = err.statusCode || 500;
  const message =
    err.isOperational
      ? err.message
      : statusCode === 500 && process.env.NODE_ENV === 'production'
      ? 'خطای غیرمنتظره‌ای رخ داده است.'
      : err.message;

  res.status(statusCode).json({
    success: false,
    error: message,
  });
});

// ============================================================
// بخش ۱۴: ایجاد سرور HTTP و راه‌اندازی Socket.io
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

app.set('socketio', io);
console.log('Socket.io engine configured and ready.');

// ============================================================
// بخش ۱۵: میدلور احراز هویت Socket.io
// ============================================================
io.use((socket, next) => {
  // دریافت توکن از handshake auth (ایمن‌تر از query)
  const token = socket.handshake.auth.token;

  if (!token) {
    return next(new Error('Authentication error: Token not provided.'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded; // ذخیره اطلاعات کاربر
    return next();
  } catch (err) {
    return next(new Error('Authentication error: Invalid token.'));
  }
});

// ============================================================
// بخش ۱۶: مدیریت اتصالات Socket.io
// ============================================================
io.on('connection', (socket) => {
  // هر کاربر به روم اختصاصی خود می‌پیوندد
  socket.join(socket.user.id);
  console.log(`User ${socket.user.id} connected to socket room.`);

  // در صورت نیاز، هندلرهای اضافی از فایل‌های دیگر بارگذاری شوند
  // require('./handlers/socketHandler')(socket, io);
});

// ============================================================
// بخش ۱۷: راه‌اندازی نهایی سرور
// ============================================================
server.listen(PORT, () => {
  console.log(`Backend server is up and running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
