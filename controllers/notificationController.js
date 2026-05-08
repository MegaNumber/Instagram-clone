// مسیر فایل: /controllers/notificationController.js
// توضیح: کنترلر مدیریت نوتیفیکیشن‌ها. این فایل منطق دریافت لیست نوتیفیکیشن‌ها،
// علامت‌گذاری به عنوان خوانده‌شده و واکشی اطلاعات مرتبط با فرستنده را پیاده‌سازی
// می‌کند. از الگوی asyncHandler برای حذف try-catch تکراری استفاده می‌شود.

// ============================================================
// بخش ۱: ایمپورت ماژول‌های مورد نیاز
// ============================================================
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const asyncHandler = require('../utils/asyncHandler');
const Notification = require('../models/Notification');

// ============================================================
// بخش ۲: ثابت‌های پیکربندی
// ============================================================
const MAX_NOTIFICATIONS_PER_PAGE = 20; // تعداد نوتیفیکیشن‌ها در هر صفحه

// ============================================================
// بخش ۳: کنترلرها
// ============================================================

/**
 * @function retrieveNotifications
 * @description دریافت نوتیفیکیشن‌های کاربر با صفحه‌بندی
 * @route GET /api/notifications?offset=0&limit=20
 * @middleware requireAuth
 */
module.exports.retrieveNotifications = asyncHandler(async (req, res) => {
  const user = res.locals.user;
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const limit = Math.min(
    MAX_NOTIFICATIONS_PER_PAGE,
    Math.max(1, parseInt(req.query.limit, 10) || MAX_NOTIFICATIONS_PER_PAGE)
  );

  // بررسی وجود کاربر (در واقعیت res.locals.user از requireAuth می‌آید)
  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'کاربر احراز هویت نشده است.',
    });
  }

  // تجمیع (Aggregation) برای دریافت نوتیفیکیشن‌ها با اطلاعات فرستنده و بررسی وضعیت دنبال‌کردن
  const notifications = await Notification.aggregate([
    // فقط نوتیفیکیشن‌های کاربر جاری
    { $match: { receiver: ObjectId(user._id) } },
    // مرتب‌سازی جدیدترین‌ها
    { $sort: { createdAt: -1 } },
    // صفحه‌بندی
    { $skip: offset },
    { $limit: limit },
    // دریافت اطلاعات فرستنده (فقط فیلدهای ضروری)
    {
      $lookup: {
        from: 'users',
        localField: 'sender',
        foreignField: '_id',
        pipeline: [
          { $project: { username: 1, avatar: 1 } },
        ],
        as: 'sender',
      },
    },
    { $unwind: { path: '$sender', preserveNullAndEmptyArrays: true } },
    // دریافت اطلاعات گیرنده (برای هماهنگی با ساختار قدیم، می‌تواند حذف شود)
    {
      $lookup: {
        from: 'users',
        localField: 'receiver',
        foreignField: '_id',
        pipeline: [
          { $project: { _id: 1 } },
        ],
        as: 'receiver',
      },
    },
    { $unwind: { path: '$receiver', preserveNullAndEmptyArrays: true } },
    // بررسی اینکه آیا کاربر جاری دنبال‌کننده فرستنده هست یا نه
    {
      $lookup: {
        from: 'followers',
        let: { senderId: '$sender._id' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$user', '$$senderId'] },
            },
          },
          { $project: { followers: 1 } },
        ],
        as: 'senderFollowers',
      },
    },
    { $unwind: { path: '$senderFollowers', preserveNullAndEmptyArrays: true } },
    // ایجاد فیلد isFollowing
    {
      $addFields: {
        isFollowing: {
          $cond: {
            if: { $in: [user._id, { $ifNull: ['$senderFollowers.followers.user', []] }] },
            then: true,
            else: false,
          },
        },
      },
    },
    // انتخاب فیلدهای نهایی
    {
      $project: {
        read: 1,
        notificationType: 1,
        notificationData: 1,
        isFollowing: 1,
        createdAt: 1,
        'sender._id': 1,
        'sender.username': 1,
        'sender.avatar': 1,
        'receiver._id': 1,
      },
    },
  ]);

  // محاسبه تعداد کل برای صفحه‌بندی (اختیاری - می‌توان بهینه‌تر انجام داد)
  const totalCount = await Notification.countDocuments({ receiver: user._id });

  return res.status(200).json({
    success: true,
    data: notifications,
    pagination: {
      offset,
      limit,
      total: totalCount,
      hasMore: offset + limit < totalCount,
    },
  });
});

/**
 * @function readNotifications
 * @description علامت‌گذاری تمام نوتیفیکیشن‌های کاربر به عنوان خوانده‌شده
 * @route PUT /api/notifications/read
 * @middleware requireAuth
 */
module.exports.readNotifications = asyncHandler(async (req, res) => {
  const user = res.locals.user;

  await Notification.updateMany(
    { receiver: user._id, read: false },
    { $set: { read: true } }
  );

  return res.status(200).json({
    success: true,
    message: 'همه نوتیفیکیشن‌ها به عنوان خوانده‌شده علامت‌گذاری شدند.',
  });
});

module.exports = exports;
