// مسیر فایل: /handlers/socketHandler.js
// توضیح: مدیریت ارتباط بلادرنگ با Socket.io. این ماژول توابع کمکی برای
// ارسال انواع رویدادها (نوتیفیکیشن، پست جدید، حذف پست، پیام چت،
// وضعیت تایپینگ و …) به کاربران هدف ارائه می‌دهد. از ثابت‌های رویداد
// برای جلوگیری از خطاهای تایپی و افزایش خوانایی استفاده می‌کند.
//
// @version 2.5.0
// @since 2026

// ============================================================
// بخش ۱: ثابت‌های رویدادها (Event Constants)
// ============================================================
const EVENTS = {
  NEW_NOTIFICATION: 'newNotification',   // نوتیفیکیشن جدید
  NEW_POST: 'newPost',                   // پست جدید در فید
  DELETE_POST: 'deletePost',             // حذف یک پست
  NEW_MESSAGE: 'newMessage',             // پیام جدید در چت
  TYPING: 'typing',                      // کاربر در حال تایپ
  STOP_TYPING: 'stopTyping',             // تایپ متوقف شد
  USER_ONLINE: 'userOnline',             // کاربر آنلاین شد
  USER_OFFLINE: 'userOffline',           // کاربر آفلاین شد
};

// ============================================================
// بخش ۲: تابع کمکی برای دریافت ایمن نمونه Socket.io
// ============================================================
const getIO = (req) => {
  try {
    const io = req.app.get('socketio');
    if (!io) {
      console.warn('[SocketHandler] Socket.io instance not available on req.app');
      return null;
    }
    return io;
  } catch (error) {
    console.error('[SocketHandler] Error accessing Socket.io:', error.message);
    return null;
  }
};

// ============================================================
// بخش ۳: توابع اصلی ارسال رویدادها
// ============================================================

/**
 * ارسال نوتیفیکیشن بلادرنگ به کاربر
 * @param {object} req - شیء درخواست Express
 * @param {object} notification - شیء نوتیفیکیشن با فیلدهای ضروری receiver, type و غیره
 */
module.exports.sendNotification = (req, notification) => {
  const io = getIO(req);
  if (!io) return;

  if (!notification?.receiver) {
    console.warn('[SocketHandler] Invalid notification (missing receiver)');
    return;
  }

  io.to(notification.receiver.toString()).emit(EVENTS.NEW_NOTIFICATION, notification);
  console.log(`[SocketHandler] Notification sent to ${notification.receiver}`);
};

/**
 * اطلاع‌رسانی پست جدید به کاربر(ان)
 * @param {object} req
 * @param {object} post - داده‌های پست
 * @param {string|string[]} receiver - شناسه کاربر یا آرایه‌ای از کاربران
 */
module.exports.sendPost = (req, post, receiver) => {
  const io = getIO(req);
  if (!io || !post || !receiver) return;

  const receivers = Array.isArray(receiver) ? receiver : [receiver];
  receivers.forEach((uid) => {
    if (uid) {
      io.to(uid.toString()).emit(EVENTS.NEW_POST, post);
    }
  });
};

/**
 * اطلاع‌رسانی حذف پست به کاربر(ان)
 * @param {object} req
 * @param {string} postId - شناسه پست حذف‌شده
 * @param {string|string[]} receiver
 */
module.exports.deletePost = (req, postId, receiver) => {
  const io = getIO(req);
  if (!io || !postId || !receiver) return;

  const receivers = Array.isArray(receiver) ? receiver : [receiver];
  receivers.forEach((uid) => {
    if (uid) {
      io.to(uid.toString()).emit(EVENTS.DELETE_POST, postId);
    }
  });
};

/**
 * ارسال پیام جدید چت به کاربر گیرنده
 * @param {object} req
 * @param {object} message - شیء کامل پیام
 * @param {string} receiverId - شناسه کاربر گیرنده
 */
module.exports.sendMessage = (req, message, receiverId) => {
  const io = getIO(req);
  if (!io || !message || !receiverId) return;

  io.to(receiverId.toString()).emit(EVENTS.NEW_MESSAGE, message);
};

/**
 * ارسال وضعیت تایپینگ
 * @param {object} req
 * @param {string} conversationId - شناسه مکالمه
 * @param {string} senderId - کاربری که تایپ می‌کند
 * @param {boolean} isTyping - شروع یا توقف تایپ
 */
module.exports.sendTypingStatus = (req, conversationId, senderId, isTyping = true) => {
  const io = getIO(req);
  if (!io || !conversationId) return;

  const event = isTyping ? EVENTS.TYPING : EVENTS.STOP_TYPING;
  // ارسال به کل روم مکالمه (همه اعضا)
  io.to(conversationId).emit(event, {
    conversationId,
    userId: senderId,
  });
};

/**
 * اطلاع‌رسانی آنلاین/آفلاین شدن کاربر (می‌توان در connection/disconnect استفاده کرد)
 * @param {object} io - نمونه Socket.io
 * @param {string} userId - کاربر هدف
 * @param {boolean} online
 */
module.exports.notifyOnlineStatus = (io, userId, online = true) => {
  if (!io || !userId) return;
  const event = online ? EVENTS.USER_ONLINE : EVENTS.USER_OFFLINE;
  // معمولاً به همه کاربران (broadcast) یا به لیست دوستان ارسال می‌شود
  // در اینجا به‌عنوان مثال به همه ارسال می‌کنیم
  io.emit(event, { userId, online });
};

module.exports.EVENTS = EVENTS; // صادرات ثابت‌ها برای استفاده در سایر ماژول‌ها
