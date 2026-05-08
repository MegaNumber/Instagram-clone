// مسیر فایل: /handlers/socketHandler.js
// توضیح: مدیریت ارسال اعلان‌ها و به‌روزرسانی‌های بلادرنگ با Socket.io.
// این ماژول توابعی را برای ارسال نوتیفیکیشن، پست جدید و حذف پست به کاربران هدف ارائه می‌دهد.

// ============================================================
// بخش ۱: ثابت‌های رویدادها (Event Constants)
// ============================================================
// استفاده از ثابت‌ها برای نام رویدادها از بروز خطاهای تایپی جلوگیری می‌کند
// و مدیریت آن‌ها را در کل برنامه ساده‌تر می‌سازد.
const EVENTS = {
  NEW_NOTIFICATION: 'newNotification',
  NEW_POST: 'newPost',
  DELETE_POST: 'deletePost',
};

// ============================================================
// بخش ۲: تابع کمکی برای استخراج ایمن نمونه Socket.io
// ============================================================

/**
 * @function getIO
 * @description دریافت نمونه Socket.io از شیء req و بررسی وجود آن
 * @param {object} req - شیء درخواست Express
 * @returns {object|null} - نمونه Socket.io یا null در صورت عدم وجود
 */
const getIO = (req) => {
  try {
    const io = req.app.get('socketio');
    if (!io) {
      console.error('[SocketHandler] Socket.io instance is not available on req.app');
      return null;
    }
    return io;
  } catch (error) {
    console.error('[SocketHandler] Error accessing Socket.io instance:', error.message);
    return null;
  }
};

// ============================================================
// بخش ۳: تابع‌های اصلی ارسال پیام
// ============================================================

/**
 * @function sendNotification
 * @description ارسال یک نوتیفیکیشن بلادرنگ به کاربر گیرنده
 * @param {object} req - شیء درخواست Express برای دسترسی به io
 * @param {object} notification - شیء نوتیفیکیشن شامل type, sender, receiver و ...
 */
module.exports.sendNotification = (req, notification) => {
  const io = getIO(req);
  if (!io) return; // خروج ایمن در صورت نبودن io

  // اعتبارسنجی اولیه داده‌های نوتیفیکیشن
  if (!notification || !notification.receiver) {
    console.warn('[SocketHandler] Invalid notification object, skipping emit.');
    return;
  }

  // ارسال رویداد به روم اختصاصی کاربر (شناسه کاربر به عنوان نام روم)
  io.to(notification.receiver.toString()).emit(EVENTS.NEW_NOTIFICATION, notification);
  console.log(`[SocketHandler] Notification sent to user ${notification.receiver}`, {
    type: notification.notificationType,
    sender: notification.sender?._id || notification.sender,
  });
};

/**
 * @function sendPost
 * @description اطلاع‌رسانی به یک کاربر از ایجاد پست جدید (مثلاً در فید یا ارسال به دنبال‌کنندگان)
 * @param {object} req - شیء درخواست Express
 * @param {object} post - شیء پست جدید
 * @param {string|string[]} receiver - شناسه کاربر(های) گیرنده
 */
module.exports.sendPost = (req, post, receiver) => {
  const io = getIO(req);
  if (!io) return;

  if (!post || !receiver) {
    console.warn('[SocketHandler] Invalid post data or receiver, skipping emit.');
    return;
  }

  // امکان ارسال به چند کاربر به صورت آرایه
  const receivers = Array.isArray(receiver) ? receiver : [receiver];
  receivers.forEach((userId) => {
    if (userId) {
      io.to(userId.toString()).emit(EVENTS.NEW_POST, post);
      console.log(`[SocketHandler] New post sent to user ${userId}`);
    }
  });
};

/**
 * @function deletePost
 * @description اطلاع‌رسانی به کاربر(ان) از حذف یک پست
 * @param {object} req - شیء درخواست Express
 * @param {string} postId - شناسه پست حذف‌شده
 * @param {string|string[]} receiver - شناسه کاربر(های) گیرنده
 */
module.exports.deletePost = (req, postId, receiver) => {
  const io = getIO(req);
  if (!io) return;

  if (!postId || !receiver) {
    console.warn('[SocketHandler] Invalid postId or receiver, skipping emit.');
    return;
  }

  const receivers = Array.isArray(receiver) ? receiver : [receiver];
  receivers.forEach((userId) => {
    if (userId) {
      io.to(userId.toString()).emit(EVENTS.DELETE_POST, postId);
      console.log(`[SocketHandler] Post deletion (${postId}) sent to user ${userId}`);
    }
  });
};
