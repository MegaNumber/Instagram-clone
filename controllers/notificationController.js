// مسیر فایل: /controllers/notificationController.js
// توضیح: کنترلر مدیریت نوتیفیکیشن‌ها. دریافت لیست نوتیفیکیشن‌ها با
// صفحه‌بندی و اطلاعات فرستنده، و علامت‌گذاری خوانده‌شده را انجام می‌دهد.
//
// @version 2.5.0
// @since 2026

// ============================================================
// بخش ۱: ایمپورت‌ها
// ============================================================
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const asyncHandler = require('../utils/asyncHandler');
const Notification = require('../models/Notification');

// ============================================================
// بخش ۲: ثابت‌ها
// ============================================================
const DEFAULT_PAGE_SIZE = 20;

// ============================================================
// بخش ۳: دریافت نوتیفیکیشن‌ها
// ============================================================
module.exports.retrieveNotifications = asyncHandler(async (req, res) => {
  const user = res.locals.user;
  if (!user) {
    return res.status(401).json({ success: false, error: 'کاربر احراز هویت نشده است.' });
  }

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(DEFAULT_PAGE_SIZE, Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_PAGE_SIZE));
  const skip = (page - 1) * limit;

  const notifications = await Notification.aggregate([
    { $match: { receiver: ObjectId(user._id) } },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },
    {
      $lookup: {
        from: 'users',
        localField: 'sender',
        foreignField: '_id',
        pipeline: [{ $project: { username: 1, avatar: 1 } }],
        as: 'sender',
      },
    },
    { $unwind: { path: '$sender', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'followers',
        let: { senderId: '$sender._id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$user', '$$senderId'] } } },
          { $project: { followers: 1 } },
        ],
        as: 'senderFollowers',
      },
    },
    { $unwind: { path: '$senderFollowers', preserveNullAndEmptyArrays: true } },
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
    {
      $project: {
        _id: 1,
        notificationType: 1,
        notificationData: 1,
        read: 1,
        isFollowing: 1,
        createdAt: 1,
        'sender._id': 1,
        'sender.username': 1,
        'sender.avatar': 1,
      },
    },
  ]);

  const totalCount = await Notification.countDocuments({ receiver: user._id });

  res.status(200).json({
    success: true,
    data: notifications,
    pagination: {
      page,
      limit,
      total: totalCount,
      hasMore: skip + limit < totalCount,
    },
  });
});

// ============================================================
// بخش ۴: علامت‌گذاری همه به عنوان خوانده‌شده
// ============================================================
module.exports.readNotifications = asyncHandler(async (req, res) => {
  const user = res.locals.user;
  const count = await Notification.markAllAsRead(user._id);

  res.status(200).json({
    success: true,
    message: `همه نوتیفیکیشن‌ها (${count} مورد) به عنوان خوانده‌شده علامت‌گذاری شدند.`,
  });
});

module.exports = exports;
