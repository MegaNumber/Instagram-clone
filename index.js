require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const mongoose = require('mongoose');
const compression = require('compression');
const path = require('path');
const socketio = require('socket.io');
const jwt = require('jwt-simple');

const apiRouter = require('./routes');

const app = express();
const PORT = process.env.PORT || 9000;

// ============================================================
// تغییر جدید ۱: سرو فایل‌های استاتیک از پوشه 'public' در حالت توسعه
// این خط تضمین می‌کند که عکس‌های آپلودشده در 'public/uploads'
// همیشه از طریق مرورگر قابل دیدن باشند
// ============================================================
app.use(express.static(path.join(__dirname, 'public')));

if (process.env.NODE_ENV !== 'production') {
  const morgan = require('morgan');
  app.use(morgan('dev'));
}

app.use(helmet());
app.use(helmet.hidePoweredBy());
app.use(cors());
app.use(bodyParser.json());
app.set('trust proxy', 1);
app.use('/api', apiRouter);

if (process.env.NODE_ENV === 'production') {
  app.use(compression());
  // ============================================================
  // تغییر جدید ۲: در حالت تولید، سرو فایل‌های ساخته‌شده ری‌اکت
  // این بخش قبلاً وجود داشت و فقط برای تأکید نگهش می‌داریم
  // ============================================================
  app.use(express.static(path.join(__dirname, 'client/build')));

  // توجه: این بخش برای سرو فایل‌های اصلی ری‌اکت است.
  // فایل‌های پوشه 'public/uploads' همچنان از خط قبلی (بیرون از بلاک if) سرو می‌شوند.
  app.get('*', function (req, res) {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
  });
}

// ============================================================
// تغییر جدید ۳: اضافه کردن مسیر مستقیم برای دسترسی به فایل‌های uploads
// این یک لایه اطمینان اضافی است. اگر به هر دلیلی فایل‌ها از ریشه / پیدا نشدند،
// این مسیر کمکی وارد عمل می‌شود
// ============================================================
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

(async function () {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useCreateIndex: true,
    });
    console.log('Connected to database');
  } catch (err) {
    throw new Error(err);
  }
})();

// مدیریت خطاها (بدون تغییر)
app.use((err, req, res, next) => {
  console.log(err.message);
  if (!err.statusCode) {
    err.statusCode = 500;
  }
  if (err.name === 'MulterError') {
    if (err.message === 'File too large') {
      return res
        .status(400)
        .send({ error: 'Your file exceeds the limit of 10MB.' });
    }
  }
  res.status(err.statusCode || 500).send({
    error:
      err.statusCode >= 500 && !err.message
        ? 'An unexpected error ocurred, please try again later.'
        : err.message,
  });
});

const expressServer = app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});

const io = socketio(expressServer);
app.set('socketio', io);
console.log('Socket.io listening for connections');

// احراز هویت برای اتصال سوکت (بدون تغییر)
io.use((socket, next) => {
  const token = socket.handshake.query.token;
  if (token) {
    try {
      const user = jwt.decode(token, process.env.JWT_SECRET);
      if (!user) {
        return next(new Error('Not authorized.'));
      }
      socket.user = user;
      return next();
    } catch (err) {
      next(err);
    }
  } else {
    return next(new Error('Not authorized.'));
  }
}).on('connection', (socket) => {
  socket.join(socket.user.id);
  console.log('socket connected:', socket.id);
});
