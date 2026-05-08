// مسیر فایل: /index.js
require('dotenv').config();
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

const apiRouter = require('./routes');
const app = express();
const PORT = process.env.PORT || 9000;

// امنیت
app.use(helmet());
app.use(helmet.hidePoweredBy());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*', credentials: true }));
app.use('/api', rateLimit({ windowMs: 15*60*1000, max: 200, standardHeaders: true, legacyHeaders: false }));
app.use(hpp());
app.use(xss());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));
app.set('trust proxy', 1);
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// مسیرهای API
app.use('/api', apiRouter);
// اضافه کردن مسیرهای جدید
app.use('/api/stories', require('./routes/story'));
app.use('/api/messages', require('./routes/message'));
app.use('/api/reels', require('./routes/reel'));

if (process.env.NODE_ENV === 'production') {
  app.use(compression());
  app.use(express.static(path.join(__dirname, 'client/build')));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(__dirname, 'client/build', 'index.html')));
}

// MongoDB
(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB error:', err.message);
    process.exit(1);
  }
})();

// مدیریت خطا
app.use((err, req, res, next) => {
  if (err.name === 'MulterError' && err.message === 'File too large')
    return res.status(400).json({ success: false, error: 'حجم فایل بیش از حد مجاز است.' });
  const status = err.statusCode || 500;
  const message = status === 500 && process.env.NODE_ENV === 'production' ? 'خطای سرور' : err.message;
  res.status(status).json({ success: false, error: message });
});

// Socket.io
const server = http.createServer(app);
const io = socketio(server, { cors: { origin: process.env.ALLOWED_ORIGINS?.split(',') || '*', methods: ['GET','POST'], credentials: true } });
app.set('socketio', io);

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication error'));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
}).on('connection', (socket) => {
  socket.join(socket.user.id);
  console.log('socket connected:', socket.id);
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
