// مسیر فایل: /controllers/userController.js
// توضیح: کنترلر مدیریت کاربران (پروفایل، دنبال کردن، بوکمارک‌ها، جستجو و …).
// تمام عملیات مربوط به کاربر در این فایل قرار دارد و از آخرین نسخه‌های
// مدل‌ها و سرویس‌های کمکی (مانند ذخیره‌سازی فایل و اعتبارسنجی) استفاده می‌کند.
//
// @version 2.5.0
// @since 2026

const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const User = require('../models/User');
const Post = require('../models/Post');
const Followers = require('../models/Followers');
const Following = require('../models/Following');
const ConfirmationToken = require('../models/ConfirmationToken');
const Notification = require('../models/Notification');
const socketHandler = require('../handlers/socketHandler');
const asyncHandler = require('../utils/asyncHandler');
const storageService = require('../utils/storage');
const { saveUploadedFile } = require('../utils/fileUpload');

const {
  validateEmail,
  validateFullName,
  validateUsername,
  validateBio,
  validateWebsite,
} = require('../utils/validation');
const { sendConfirmationEmail } = require('../utils/controllerUtils');
const rankingEngine = require('../services/rankingEngine'); // برای پیشنهاد کاربران هوشمند

// ============================================================
// ثابت‌ها
// ============================================================
const PAGINATION_LIMIT = 12;
const MAX_PAGINATION_LIMIT = 50;

const parsePagination = (query) => {
  const offset = Math.max(0, parseInt(query.offset, 10) || 0);
  const limit = Math.min(
    MAX_PAGINATION_LIMIT,
    Math.max(1, parseInt(query.limit, 10) || PAGINATION_LIMIT)
  );
  return { offset, limit };
};

// ============================================================
// پروفایل کاربر
// ============================================================
module.exports.retrieveUser = asyncHandler(async (req, res) => {
  const { username } = req.params;
  const requestingUser = res.locals.user;

  const user = await User.findOne({ username })
    .select('username fullName avatar bio bookmarks website _id')
    .lean();

  if (!user) {
    return res.status(404).json({ success: false, error: 'کاربری با این نام کاربری یافت نشد.' });
  }

  const [postsResult, followersDoc, followingDoc] = await Promise.all([
    Post.aggregate([
      { $match: { author: ObjectId(user._id) } },
      { $sort: { createdAt: -1 } },
      { $limit: 12 },
      {
        $lookup: {
          from: 'postvotes',
          localField: '_id',
          foreignField: 'post',
          pipeline: [{ $project: { _id: 1, votes: 1 } }],
          as: 'postVotes',
        },
      },
      {
        $lookup: {
          from: 'comments',
          localField: '_id',
          foreignField: 'post',
          pipeline: [{ $project: { _id: 1 } }],
          as: 'comments',
        },
      },
      {
        $addFields: {
          likeCount: { $size: '$postVotes.votes' },
          commentCount: { $size: '$comments' },
          image: '$thumbnail',
        },
      },
      { $project: { image: 1, thumbnail: 1, filter: 1, caption: 1, author: 1, likeCount: 1, commentCount: 1, createdAt: 1 } },
    ]),
    Followers.findOne({ user: ObjectId(user._id) }).lean(),
    Following.findOne({ user: ObjectId(user._id) }).lean(),
  ]);

  const isFollowing = requestingUser
    ? followersDoc?.followers?.some((f) => String(f.user) === String(requestingUser._id)) ?? false
    : false;

  res.status(200).json({
    success: true,
    data: {
      user,
      posts: postsResult,
      followersCount: followersDoc?.followers?.length || 0,
      followingCount: followingDoc?.following?.length || 0,
      postCount: postsResult.length,
      isFollowing,
    },
  });
});

// ============================================================
// پست‌های کاربر
// ============================================================
module.exports.retrievePosts = asyncHandler(async (req, res) => {
  const { username } = req.params;
  const { offset, limit } = parsePagination(req.query);

  const posts = await Post.aggregate([
    { $sort: { createdAt: -1 } },
    { $skip: offset },
    { $limit: limit },
    {
      $lookup: {
        from: 'users',
        localField: 'author',
        foreignField: '_id',
        pipeline: [{ $project: { username: 1, avatar: 1 } }],
        as: 'user',
      },
    },
    { $unwind: '$user' },
    { $match: { 'user.username': username } },
    {
      $lookup: {
        from: 'comments',
        localField: '_id',
        foreignField: 'post',
        pipeline: [{ $project: { _id: 1 } }],
        as: 'comments',
      },
    },
    {
      $lookup: {
        from: 'postvotes',
        localField: '_id',
        foreignField: 'post',
        pipeline: [{ $project: { _id: 1, votes: 1 } }],
        as: 'postVotes',
      },
    },
    {
      $addFields: {
        likeCount: { $size: '$postVotes.votes' },
        commentCount: { $size: '$comments' },
      },
    },
    {
      $project: {
        image: 1, caption: 1, createdAt: 1,
        'user.username': 1, 'user.avatar': 1,
        likeCount: 1, commentCount: 1,
      },
    },
  ]);

  if (posts.length === 0) {
    return res.status(404).json({ success: false, error: 'هیچ پستی برای این کاربر یافت نشد.' });
  }

  res.status(200).json({
    success: true,
    data: posts,
    pagination: { offset, limit, hasMore: posts.length === limit },
  });
});

// ============================================================
// بوکمارک
// ============================================================
module.exports.bookmarkPost = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const user = res.locals.user;
  const post = await Post.findById(postId).select('_id');
  if (!post) return res.status(404).json({ success: false, error: 'پستی با این شناسه یافت نشد.' });

  const update = await User.updateOne(
    { _id: user._id, 'bookmarks.post': { $ne: postId } },
    { $push: { bookmarks: { post: postId } } }
  );

  if (update.modifiedCount > 0) {
    return res.status(200).json({ success: true, operation: 'add', message: 'پست به بوکمارک‌ها اضافه شد.' });
  }

  const removeUpdate = await User.updateOne(
    { _id: user._id },
    { $pull: { bookmarks: { post: postId } } }
  );

  if (removeUpdate.modifiedCount === 0) {
    return res.status(500).json({ success: false, error: 'عملیات حذف بوکمارک با مشکل مواجه شد.' });
  }

  return res.status(200).json({ success: true, operation: 'remove', message: 'پست از بوکمارک‌ها حذف شد.' });
});

// ============================================================
// دنبال کردن
// ============================================================
module.exports.followUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const currentUser = res.locals.user;

  const targetUser = await User.findById(userId).select('_id');
  if (!targetUser) return res.status(404).json({ success: false, error: 'کاربر مورد نظر یافت نشد.' });

  // استفاده از متدهای استاتیک مدل‌ها برای عملیات toggle
  const [followerResult, followingResult] = await Promise.all([
    Followers.toggleFollow(userId, currentUser._id),
    Following.toggleFollow(currentUser._id, userId),
  ]);

  const operation = followerResult === 'followed' ? 'follow' : 'unfollow';
  const message = operation === 'follow' ? 'کاربر با موفقیت دنبال شد.' : 'دنبال کردن کاربر لغو شد.';

  // نوتیفیکیشن فقط در حالت follow
  if (operation === 'follow') {
    const sender = await User.findById(currentUser._id).select('username avatar').lean();
    const isFollowing = await Following.isFollowing(userId, currentUser._id);

    const notification = await Notification.create({
      notificationType: 'follow',
      sender: currentUser._id,
      receiver: userId,
      date: Date.now(),
    });

    socketHandler.sendNotification(req, {
      notificationType: 'follow',
      sender: {
        _id: sender._id,
        username: sender.username,
        avatar: sender.avatar,
      },
      receiver: userId,
      date: notification.date,
      isFollowing: !!isFollowing,
    });
  }

  res.status(200).json({ success: true, operation, message });
});

// ============================================================
// لیست دنبال‌کننده‌ها / دنبال‌شونده‌ها
// ============================================================
module.exports.retrieveFollowing = asyncHandler(async (req, res) => {
  const { userId, offset = 0 } = req.params;
  const user = res.locals.user;
  const result = await retrieveRelatedUsers(user, userId, offset, false);
  res.status(200).json({ success: true, data: result.users, totalCount: result.totalCount });
});

module.exports.retrieveFollowers = asyncHandler(async (req, res) => {
  const { userId, offset = 0 } = req.params;
  const user = res.locals.user;
  const result = await retrieveRelatedUsers(user, userId, offset, true);
  res.status(200).json({ success: true, data: result.users, totalCount: result.totalCount });
});

// ============================================================
// جستجوی کاربران
// ============================================================
module.exports.searchUsers = asyncHandler(async (req, res) => {
  const { username, offset = 0 } = req.query;
  if (!username || !username.trim()) {
    return res.status(400).json({ success: false, error: 'نام کاربری را وارد کنید.' });
  }

  const users = await User.aggregate([
    { $match: { username: { $regex: username, $options: 'i' } } },
    {
      $lookup: {
        from: 'followers',
        localField: '_id',
        foreignField: 'user',
        pipeline: [{ $project: { _id: 1, followers: 1 } }],
        as: 'followers',
      },
    },
    {
      $addFields: {
        followersCount: { $size: { $ifNull: ['$followers.followers', []] } },
      },
    },
    { $sort: { followersCount: -1 } },
    { $skip: Number(offset) },
    { $limit: 10 },
    { $project: { _id: 1, username: 1, avatar: 1, fullName: 1 } },
  ]);

  if (users.length === 0) {
    return res.status(404).json({ success: false, error: 'کاربری یافت نشد.' });
  }
  res.status(200).json({ success: true, data: users });
});

// ============================================================
// تأیید ایمیل
// ============================================================
module.exports.confirmUser = asyncHandler(async (req, res) => {
  const { token } = req.body;
  const user = res.locals.user;
  if (!token) return res.status(400).json({ success: false, error: 'توکن الزامی است.' });

  const confirmationToken = await ConfirmationToken.findOneValid(user._id, token);
  if (!confirmationToken) {
    return res.status(404).json({ success: false, error: 'توکن نامعتبر یا منقضی شده است.' });
  }

  await Promise.all([
    ConfirmationToken.deleteOne({ _id: confirmationToken._id }),
    User.updateOne({ _id: user._id }, { confirmed: true }),
  ]);

  res.status(200).json({ success: true, message: 'ایمیل با موفقیت تأیید شد.' });
});

// ============================================================
// مدیریت آواتار (ذخیره‌سازی محلی)
// ============================================================
module.exports.changeAvatar = asyncHandler(async (req, res) => {
  const user = res.locals.user;
  if (!req.file) return res.status(400).json({ success: false, error: 'تصویری انتخاب نشده.' });

  // حذف آواتار قبلی
  if (user.avatar && user.avatar !== 'default-avatar.png') {
    await storageService.deleteFile(user.avatar);
  }

  const avatarUrl = await saveUploadedFile(req.file, 'uploads/avatars', 'avatar');
  await User.updateOne({ _id: user._id }, { avatar: avatarUrl });

  res.status(200).json({ success: true, data: { avatar: avatarUrl } });
});

module.exports.removeAvatar = asyncHandler(async (req, res) => {
  const user = res.locals.user;
  if (user.avatar && user.avatar !== 'default-avatar.png') {
    await storageService.deleteFile(user.avatar);
  }
  await User.updateOne({ _id: user._id }, { $unset: { avatar: '' } });
  res.status(204).send();
});

// ============================================================
// به‌روزرسانی پروفایل
// ============================================================
module.exports.updateProfile = asyncHandler(async (req, res) => {
  const user = res.locals.user;
  const { fullName, username, website, bio, email } = req.body;

  const userDocument = await User.findById(user._id);
  const updatedFields = {};
  let confirmationToken = null;

  if (fullName !== undefined) {
    const err = validateFullName(fullName);
    if (err) return res.status(400).json({ success: false, error: err });
    userDocument.fullName = fullName;
    updatedFields.fullName = fullName;
  }

  if (username !== undefined) {
    const err = validateUsername(username);
    if (err) return res.status(400).json({ success: false, error: err });
    if (username !== user.username) {
      const existing = await User.findOne({ username });
      if (existing) return res.status(400).json({ success: false, error: 'این نام کاربری قبلاً انتخاب شده.' });
      userDocument.username = username;
      updatedFields.username = username;
    }
  }

  if (website !== undefined) {
    const err = validateWebsite(website);
    if (err) return res.status(400).json({ success: false, error: err });
    const formatted = website.includes('http') ? website : `https://${website}`;
    userDocument.website = formatted;
    updatedFields.website = formatted;
  }

  if (bio !== undefined) {
    const err = validateBio(bio);
    if (err) return res.status(400).json({ success: false, error: err });
    userDocument.bio = bio;
    updatedFields.bio = bio;
  }

  if (email !== undefined) {
    const err = validateEmail(email);
    if (err) return res.status(400).json({ success: false, error: err });
    if (email !== user.email) {
      const existing = await User.findOne({ email });
      if (existing) return res.status(400).json({ success: false, error: 'این ایمیل قبلاً ثبت شده.' });
      confirmationToken = await ConfirmationToken.create({
        user: user._id,
        token: require('crypto').randomBytes(20).toString('hex'),
      });
      userDocument.email = email;
      userDocument.confirmed = false;
      updatedFields.email = email;
      updatedFields.confirmed = false;
    }
  }

  if (Object.keys(updatedFields).length === 0) {
    return res.status(400).json({ success: false, error: 'هیچ فیلدی برای به‌روزرسانی ارسال نشده است.' });
  }

  await userDocument.save();

  if (confirmationToken) {
    sendConfirmationEmail(userDocument.username, userDocument.email, confirmationToken.token);
  }

  res.status(200).json({ success: true, data: updatedFields, message: 'پروفایل به‌روزرسانی شد.' });
});

// ============================================================
// کاربران پیشنهادی (از موتور رتبه‌بندی)
// ============================================================
module.exports.retrieveSuggestedUsers = asyncHandler(async (req, res) => {
  const { max = 20 } = req.query;
  const user = res.locals.user;

  const users = await rankingEngine.suggestUsers(user._id, Math.min(Number(max), 50));

  res.status(200).json({ success: true, data: users });
});

// ============================================================
// تابع کمکی داخلی برای دریافت لیست دنبال‌کننده/شونده
// ============================================================
async function retrieveRelatedUsers(currentUser, userId, offset, followersFlag) {
  const { limit } = parsePagination({ limit: 10 });
  const field = followersFlag ? 'followers' : 'following';
  const Model = followersFlag ? Followers : Following;

  const pipeline = [
    { $match: { user: ObjectId(userId) } },
    {
      $lookup: {
        from: 'users',
        let: { userIds: `$${field}.user` },
        pipeline: [
          { $match: { $expr: { $in: ['$_id', '$$userIds'] } } },
          { $skip: Number(offset) },
          { $limit: limit },
        ],
        as: 'users',
      },
    },
    {
      $lookup: {
        from: 'followers',
        localField: 'users._id',
        foreignField: 'user',
        pipeline: [{ $project: { _id: 1, followers: 1 } }],
        as: 'userFollowers',
      },
    },
    {
      $project: {
        'users._id': 1,
        'users.username': 1,
        'users.avatar': 1,
        'users.fullName': 1,
        userFollowers: 1,
        totalCount: { $size: `$${field}` },
      },
    },
  ];

  const result = await Model.aggregate(pipeline);

  if (!result || result.length === 0) {
    return { users: [], totalCount: 0 };
  }

  const data = result[0];
  const followedUsers = new Set();

  data.userFollowers?.forEach((f) => {
    if (f.followers?.some((fl) => String(fl.user) === String(currentUser._id))) {
      followedUsers.add(String(f.user));
    }
  });

  data.users?.forEach((u) => {
    u.isFollowing = followedUsers.has(String(u._id));
  });

  return { users: data.users || [], totalCount: data.totalCount || 0 };
}

module.exports = exports;
