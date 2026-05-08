// مسیر فایل: /controllers/userController.js
// توضیح: کنترلر مدیریت کاربران. این فایل منطق اصلی مربوط به پروفایل کاربر،
// دنبال کردن، بوکمارک کردن، جستجو و سایر عملیات مرتبط با کاربر را مدیریت می‌کند.

// ============================================================
// بخش ۱: ایمپورت ماژول‌های مورد نیاز
// ============================================================
const User = require('../models/User');
const Post = require('../models/Post');
const Followers = require('../models/Followers');
const Following = require('../models/Following');
const ConfirmationToken = require('../models/ConfirmationToken');
const Notification = require('../models/Notification');
const socketHandler = require('../handlers/socketHandler');
const ObjectId = require('mongoose').Types.ObjectId;
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const crypto = require('crypto');

// کتابخانه‌های کمکی جدید
const retry = require('async-retry'); // برای تلاش مجدد عملیات‌های حساس
const asyncHandler = require('../utils/asyncHandler'); // حذف try-catch تکراری
const userService = require('../services/userService'); // انتقال منطق پیچیده به سرویس

// ابزارهای اعتبارسنجی
const {
  validateEmail,
  validateFullName,
  validateUsername,
  validateBio,
  validateWebsite,
} = require('../utils/validation');
const { sendConfirmationEmail } = require('../utils/controllerUtils');

// ============================================================
// بخش ۲: ثابت‌های پیکربندی
// ============================================================
const PAGINATION_LIMIT = 12; // تعداد آیتم در هر صفحه
const MAX_PAGINATION_LIMIT = 50; // حداکثر آیتم مجاز در هر صفحه

// تنظیمات Cloudinary (بهتر است در فایل کانفیگ جداگانه باشد)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ============================================================
// بخش ۳: توابع کمکی (Utility Functions)
// ============================================================

/**
 * @function parsePagination
 * @description تجزیه و اعتبارسنجی پارامترهای صفحه‌بندی از درخواست
 * @param {object} query - شیء query درخواست
 * @returns {object} - شامل offset و limit معتبر
 */
const parsePagination = (query) => {
  const offset = Math.max(0, parseInt(query.offset, 10) || 0);
  const limit = Math.min(
    MAX_PAGINATION_LIMIT,
    Math.max(1, parseInt(query.limit, 10) || PAGINATION_LIMIT)
  );
  return { offset, limit };
};

// ============================================================
// بخش ۴: کنترلرهای اصلی
// ============================================================

/**
 * @function retrieveUser
 * @description دریافت اطلاعات کامل پروفایل یک کاربر به همراه پست‌ها
 * @route GET /api/users/:username
 */
module.exports.retrieveUser = asyncHandler(async (req, res) => {
  const { username } = req.params;
  const requestingUser = res.locals.user;

  // ۱. یافتن کاربر با اسم کاربری
  const user = await User.findOne({ username })
    .select('username fullName avatar bio bookmarks website _id')
    .lean(); // .lean() برای بازگرداندن آبجکت ساده JS (عملکرد بهتر)

  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'کاربری با این نام کاربری یافت نشد.',
    });
  }

  // ۲. دریافت اطلاعات پست‌ها، دنبال‌کننده‌ها و دنبال‌شونده‌ها به صورت همزمان
  const [postsResult, followersDocument, followingDocument] = await Promise.all([
    Post.aggregate([
      { $match: { author: ObjectId(user._id) } },
      { $sort: { createdAt: -1 } },
      { $limit: 12 },
      // استفاده از lookup بهینه‌شده
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
      // افزودن تعداد لایک‌ها و کامنت‌ها با استفاده از $addFields
      {
        $addFields: {
          likeCount: { $size: '$postVotes.votes' },
          commentCount: { $size: '$comments' },
          image: '$thumbnail',
        },
      },
      // انتخاب فیلدهای نهایی
      {
        $project: {
          image: 1,
          thumbnail: 1,
          filter: 1,
          caption: 1,
          author: 1,
          likeCount: 1,
          commentCount: 1,
          createdAt: 1,
        },
      },
    ]),
    Followers.findOne({ user: ObjectId(user._id) }).lean(),
    Following.findOne({ user: ObjectId(user._id) }).lean(),
  ]);

  // ۳. محاسبه وضعیت دنبال‌کردن
  const isFollowing = requestingUser
    ? followersDocument?.followers?.some(
        (follower) => String(follower.user) === String(requestingUser._id)
      ) ?? false
    : false;

  // ۴. ارسال پاسخ نهایی
  return res.status(200).json({
    success: true,
    data: {
      user,
      posts: postsResult,
      followersCount: followersDocument?.followers?.length || 0,
      followingCount: followingDocument?.following?.length || 0,
      postCount: postsResult.length, // تعداد تقریبی
      isFollowing,
    },
  });
});

/**
 * @function retrievePosts
 * @description دریافت پست‌های یک کاربر با صفحه‌بندی
 * @route GET /api/users/:username/posts?offset=0&limit=12
 */
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
        image: 1,
        caption: 1,
        createdAt: 1,
        'user.username': 1,
        'user.avatar': 1,
        likeCount: 1,
        commentCount: 1,
      },
    },
  ]);

  if (posts.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'هیچ پستی برای این کاربر یافت نشد.',
    });
  }

  return res.status(200).json({
    success: true,
    data: posts,
    pagination: {
      offset,
      limit,
      hasMore: posts.length === limit, // اگر تعداد برابر limit باشد، احتمالاً صفحه بعدی وجود دارد
    },
  });
});

/**
 * @function bookmarkPost
 * @description اضافه یا حذف یک پست از بوکمارک‌های کاربر
 * @route POST /api/users/bookmark/:postId
 */
module.exports.bookmarkPost = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const user = res.locals.user;

  // ۱. بررسی وجود پست
  const post = await Post.findById(postId).select('_id');
  if (!post) {
    return res.status(404).json({
      success: false,
      error: 'پستی با این شناسه یافت نشد.',
    });
  }

  // ۲. تلاش برای افزودن بوکمارک (با اصلاح نام فیلد)
  const userBookmarkUpdate = await User.updateOne(
    {
      _id: user._id,
      'bookmarks.post': { $ne: postId },
    },
    { $push: { bookmarks: { post: postId } } }
  );

  // ۳. اگر تغییری ایجاد نشد، یعنی قبلاً بوکمارک شده بود، پس حذفش می‌کنیم
  if (userBookmarkUpdate.matchedCount > 0 && userBookmarkUpdate.modifiedCount === 0) {
    const userRemoveBookmarkUpdate = await User.updateOne(
      { _id: user._id },
      { $pull: { bookmarks: { post: postId } } }
    );

    if (userRemoveBookmarkUpdate.modifiedCount === 0) {
      return res.status(500).json({
        success: false,
        error: 'عملیات حذف بوکمارک با مشکل مواجه شد.',
      });
    }
    return res.status(200).json({
      success: true,
      operation: 'remove',
      message: 'پست از بوکمارک‌ها حذف شد.',
    });
  }

  // ۴. در غیر این صورت، بوکمارک اضافه شده است
  return res.status(200).json({
    success: true,
    operation: 'add',
    message: 'پست به بوکمارک‌ها اضافه شد.',
  });
});

/**
 * @function followUser
 * @description دنبال کردن یا لغو دنبال کردن یک کاربر با منطق Retry
 * @route POST /api/users/:userId/follow
 */
module.exports.followUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const user = res.locals.user;

  // ۱. بررسی وجود کاربر هدف
  const userToFollow = await User.findById(userId).select('_id');
  if (!userToFollow) {
    return res.status(404).json({
      success: false,
      error: 'کاربر مورد نظر برای دنبال کردن یافت نشد.',
    });
  }

  // ۲. اجرای عملیات دنبال کردن با تلاش مجدد (Retry Logic)
  const result = await retry(
    async (bail) => {
      // تلاش برای افزودن به لیست دنبال‌کننده‌ها و دنبال‌شونده‌ها
      const followerUpdate = await Followers.updateOne(
        { user: userId, 'followers.user': { $ne: user._id } },
        { $push: { followers: { user: user._id } } }
      );

      const followingUpdate = await Following.updateOne(
        { user: user._id, 'following.user': { $ne: userId } },
        { $push: { following: { user: userId } } }
      );

      // اگر خطایی در به‌روزرسانی رخ داد، خطا را پرتاب کن
      if (!followerUpdate.acknowledged || !followingUpdate.acknowledged) {
        throw new Error('به‌روزرسانی دنبال‌کننده‌ها با خطا مواجه شد.');
      }

      // اگر تغییری ایجاد نشد، یعنی کاربر قبلاً دنبال شده بود، پس آنفالو می‌کنیم
      if (followerUpdate.modifiedCount === 0 && followingUpdate.modifiedCount === 0) {
        const followerUnfollowUpdate = await Followers.updateOne(
          { user: userId },
          { $pull: { followers: { user: user._id } } }
        );

        const followingUnfollowUpdate = await Following.updateOne(
          { user: user._id },
          { $pull: { following: { user: userId } } }
        );

        if (!followerUnfollowUpdate.acknowledged || !followingUnfollowUpdate.acknowledged) {
          throw new Error('عملیات آنفالو با خطا مواجه شد.');
        }

        return { operation: 'unfollow' };
      }

      return { operation: 'follow' };
    },
    {
      retries: 2, // تعداد تلاش‌های مجدد
      minTimeout: 100, // حداقل زمان انتظار بین تلاش‌ها
    }
  );

  // ۳. اگر عملیات "follow" بوده، نوتیفیکیشن ارسال کن
  if (result.operation === 'follow') {
    const [sender, isFollowing] = await Promise.all([
      User.findById(user._id).select('username avatar').lean(),
      Following.findOne({
        user: userId,
        'following.user': user._id,
      }).lean(),
    ]);

    const notification = await Notification.create({
      notificationType: 'follow',
      sender: user._id,
      receiver: userId,
      date: Date.now(),
    });

    // ارسال نوتیفیکیشن از طریق سوکت
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

  // ۴. ارسال پاسخ نهایی
  return res.status(200).json({
    success: true,
    operation: result.operation,
    message:
      result.operation === 'follow'
        ? 'کاربر با موفقیت دنبال شد.'
        : 'دنبال کردن کاربر لغو شد.',
  });
});

// ============================================================
// بخش ۵: بازیابی کاربران مرتبط (Followers/Following)
// ============================================================

/**
 * @function retrieveRelatedUsers
 * @description دریافت لیست دنبال‌کننده‌ها یا دنبال‌شونده‌های یک کاربر
 * @param {object} user - کاربر درخواست‌دهنده
 * @param {string} userId - شناسه کاربر هدف
 * @param {number} offset - تعداد آیتم‌های رد شده
 * @param {boolean} followers - true برای دنبال‌کننده‌ها، false برای دنبال‌شونده‌ها
 * @returns {array} - لیست کاربران
 */
const retrieveRelatedUsers = async (user, userId, offset, followers) => {
  const { limit } = parsePagination({ limit: 10 }); // استفاده از limit پیش‌فرض ۱۰

  const pipeline = [
    {
      $match: { user: ObjectId(userId) },
    },
    {
      $lookup: {
        from: 'users',
        let: {
          userIds: followers ? '$followers.user' : '$following.user',
        },
        pipeline: [
          {
            $match: {
              $expr: { $in: ['$_id', '$$userIds'] },
            },
          },
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
        totalCount: followers
          ? { $size: '$followers' }
          : { $size: '$following' },
      },
    },
  ];

  const aggregation = followers
    ? await Followers.aggregate(pipeline)
    : await Following.aggregate(pipeline);

  if (!aggregation || aggregation.length === 0) {
    return { users: [], totalCount: 0 };
  }

  const result = aggregation[0];

  // محاسبه وضعیت دنبال‌کردن برای هر کاربر
  const followedUsers = new Set();
  result.userFollowers?.forEach((followingUser) => {
    if (
      followingUser.followers?.some(
        (follower) => String(follower.user) === String(user._id)
      )
    ) {
      followedUsers.add(String(followingUser.user));
    }
  });

  result.users?.forEach((followingUser) => {
    followingUser.isFollowing = followedUsers.has(String(followingUser._id));
  });

  return { users: result.users || [], totalCount: result.totalCount || 0 };
};

/**
 * @function retrieveFollowing
 * @description دریافت لیست دنبال‌شونده‌های یک کاربر
 * @route GET /api/users/:userId/following?offset=0
 */
module.exports.retrieveFollowing = asyncHandler(async (req, res) => {
  const { userId, offset = 0 } = req.params;
  const user = res.locals.user;

  const result = await retrieveRelatedUsers(user, userId, offset, false);

  return res.status(200).json({
    success: true,
    data: result.users,
    totalCount: result.totalCount,
  });
});

/**
 * @function retrieveFollowers
 * @description دریافت لیست دنبال‌کننده‌های یک کاربر
 * @route GET /api/users/:userId/followers?offset=0
 */
module.exports.retrieveFollowers = asyncHandler(async (req, res) => {
  const { userId, offset = 0 } = req.params;
  const user = res.locals.user;

  const result = await retrieveRelatedUsers(user, userId, offset, true);

  return res.status(200).json({
    success: true,
    data: result.users,
    totalCount: result.totalCount,
  });
});

// ============================================================
// بخش ۶: جستجوی کاربران
// ============================================================

/**
 * @function searchUsers
 * @description جستجوی کاربران بر اساس نام کاربری
 * @route GET /api/users/search?username=something&offset=0
 */
module.exports.searchUsers = asyncHandler(async (req, res) => {
  const { username, offset = 0 } = req.query;

  if (!username || username.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'لطفاً یک نام کاربری برای جستجو وارد کنید.',
    });
  }

  const users = await User.aggregate([
    {
      $match: {
        username: { $regex: username, $options: 'i' },
      },
    },
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
    {
      $project: {
        _id: 1,
        username: 1,
        avatar: 1,
        fullName: 1,
      },
    },
  ]);

  if (users.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'هیچ کاربری با این مشخصات یافت نشد.',
    });
  }

  return res.status(200).json({
    success: true,
    data: users,
  });
});

// ============================================================
// بخش ۷: تأیید ایمیل کاربر
// ============================================================

/**
 * @function confirmUser
 * @description تأیید ایمیل کاربر با استفاده از توکن ارسالی
 * @route POST /api/users/confirm
 */
module.exports.confirmUser = asyncHandler(async (req, res) => {
  const { token } = req.body;
  const user = res.locals.user;

  if (!token) {
    return res.status(400).json({
      success: false,
      error: 'توکن تأیید الزامی است.',
    });
  }

  const confirmationToken = await ConfirmationToken.findOne({
    token,
    user: user._id,
  });

  if (!confirmationToken) {
    return res.status(404).json({
      success: false,
      error: 'لینک تأیید نامعتبر یا منقضی شده است.',
    });
  }

  // حذف توکن و تأیید کاربر
  await Promise.all([
    ConfirmationToken.deleteOne({ _id: confirmationToken._id }),
    User.updateOne({ _id: user._id }, { confirmed: true }),
  ]);

  return res.status(200).json({
    success: true,
    message: 'ایمیل شما با موفقیت تأیید شد.',
  });
});

// ============================================================
// بخش ۸: مدیریت آواتار
// ============================================================

/**
 * @function changeAvatar
 * @description تغییر آواتار کاربر با آپلود در Cloudinary
 * @route POST /api/users/avatar
 */
module.exports.changeAvatar = asyncHandler(async (req, res) => {
  const user = res.locals.user;

  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'لطفاً یک تصویر برای آپلود انتخاب کنید.',
    });
  }

  // آپلود تصویر در Cloudinary
  const response = await cloudinary.uploader.upload(req.file.path, {
    width: 200,
    height: 200,
    gravity: 'face',
    crop: 'thumb',
  });

  // حذف فایل موقت
  if (req.file.path) {
    fs.unlinkSync(req.file.path);
  }

  // به‌روزرسانی آواتار کاربر
  const avatarUpdate = await User.updateOne(
    { _id: user._id },
    { avatar: response.secure_url }
  );

  if (avatarUpdate.modifiedCount === 0) {
    return res.status(500).json({
      success: false,
      error: 'آپلود تصویر با مشکل مواجه شد.',
    });
  }

  return res.status(200).json({
    success: true,
    data: { avatar: response.secure_url },
  });
});

/**
 * @function removeAvatar
 * @description حذف آواتار کاربر
 * @route DELETE /api/users/avatar
 */
module.exports.removeAvatar = asyncHandler(async (req, res) => {
  const user = res.locals.user;

  const avatarUpdate = await User.updateOne(
    { _id: user._id },
    { $unset: { avatar: '' } }
  );

  if (avatarUpdate.modifiedCount === 0) {
    return res.status(404).json({
      success: false,
      error: 'آواتاری برای حذف یافت نشد.',
    });
  }

  return res.status(204).send();
});

// ============================================================
// بخش ۹: به‌روزرسانی پروفایل
// ============================================================

/**
 * @function updateProfile
 * @description به‌روزرسانی اطلاعات پروفایل کاربر
 * @route PUT /api/users/profile
 */
module.exports.updateProfile = asyncHandler(async (req, res) => {
  const user = res.locals.user;
  const { fullName, username, website, bio, email } = req.body;

  const userDocument = await User.findById(user._id);
  const updatedFields = {};
  let confirmationToken = null;

  // اعتبارسنجی و به‌روزرسانی فیلدها
  if (fullName !== undefined) {
    const fullNameError = validateFullName(fullName);
    if (fullNameError) return res.status(400).json({ success: false, error: fullNameError });
    userDocument.fullName = fullName;
    updatedFields.fullName = fullName;
  }

  if (username !== undefined) {
    const usernameError = validateUsername(username);
    if (usernameError) return res.status(400).json({ success: false, error: usernameError });
    if (username !== user.username) {
      const existingUser = await User.findOne({ username });
      if (existingUser) return res.status(400).json({ success: false, error: 'این نام کاربری قبلاً انتخاب شده است.' });
      userDocument.username = username;
      updatedFields.username = username;
    }
  }

  if (website !== undefined) {
    const websiteError = validateWebsite(website);
    if (websiteError) return res.status(400).json({ success: false, error: websiteError });
    // افزودن پروتکل در صورت نیاز
    const formattedWebsite = website.includes('http') ? website : `https://${website}`;
    userDocument.website = formattedWebsite;
    updatedFields.website = formattedWebsite;
  }

  if (bio !== undefined) {
    const bioError = validateBio(bio);
    if (bioError) return res.status(400).json({ success: false, error: bioError });
    userDocument.bio = bio;
    updatedFields.bio = bio;
  }

  if (email !== undefined) {
    const emailError = validateEmail(email);
    if (emailError) return res.status(400).json({ success: false, error: emailError });
    if (email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) return res.status(400).json({ success: false, error: 'این ایمیل قبلاً ثبت شده است.' });

      confirmationToken = await ConfirmationToken.create({
        user: user._id,
        token: crypto.randomBytes(20).toString('hex'),
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

  // ارسال ایمیل تأیید در صورت تغییر ایمیل
  if (confirmationToken) {
    await sendConfirmationEmail(userDocument.username, userDocument.email, confirmationToken.token);
  }

  return res.status(200).json({
    success: true,
    data: updatedFields,
    message: 'پروفایل با موفقیت به‌روزرسانی شد.',
  });
});

// ============================================================
// بخش ۱۰: دریافت کاربران پیشنهادی
// ============================================================

/**
 * @function retrieveSuggestedUsers
 * @description دریافت لیست کاربران پیشنهادی برای دنبال کردن
 * @route GET /api/users/suggested?max=20
 */
module.exports.retrieveSuggestedUsers = asyncHandler(async (req, res) => {
  const { max = 20 } = req.query;
  const user = res.locals.user;

  const users = await User.aggregate([
    {
      $match: { _id: { $ne: ObjectId(user._id) } },
    },
    {
      $lookup: {
        from: 'followers',
        localField: '_id',
        foreignField: 'user',
        pipeline: [{ $project: { _id: 1, followers: 1 } }],
        as: 'followersData',
      },
    },
    {
      $lookup: {
        from: 'posts',
        let: { userId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$author', '$$userId'] } } },
          { $sort: { createdAt: -1 } },
          { $limit: 3 },
        ],
        as: 'posts',
      },
    },
    {
      $addFields: {
        isFollowing: { $in: [user._id, '$followersData.followers.user'] },
      },
    },
    { $match: { isFollowing: false } },
    { $sample: { size: Math.min(Number(max), 50) } },
    { $sort: { 'posts.length': -1 } },
    {
      $project: {
        username: 1,
        fullName: 1,
        avatar: 1,
        posts: 1,
      },
    },
  ]);

  return res.status(200).json({
    success: true,
    data: users,
  });
});

module.exports = exports;
