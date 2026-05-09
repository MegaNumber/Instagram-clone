// مسیر فایل: /utils/controllerUtils.js
// توضیح: توابع کمکی پرکاربرد در کنترلرها (بازیابی نظرات، ارسال ایمیل،
// نوتیفیکیشن کامنت و منشن، تولید نام کاربری یکتا، پایپ‌لاین populate).
// کاملاً مستقل از سرویس‌های ابری و هماهنگ با مدل‌های جدید (timestamps).
//
// @version 2.5.1
// @since 2026

const Comment = require('../models/Comment');
const Notification = require('../models/Notification');
const User = require('../models/User');
const ObjectId = require('mongoose').Types.ObjectId;
const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');
const socketHandler = require('../handlers/socketHandler');

// ============================================================
// ثابت‌های پیکربندی
// ============================================================
const COMMENTS_PER_PAGE = 10;
const MAX_COMMENT_EXCLUDE = 100;
const SMTP_CONFIG = {
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT, 10) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USERNAME,
    pass: process.env.EMAIL_PASSWORD,
  },
};

// ============================================================
// ابزارهای عمومی
// ============================================================
const isValidObjectId = (id) => /^[0-9a-fA-F]{24}$/.test(id);

const parsePagination = (params, defaultLimit = 10) => {
  const offset = Math.max(0, parseInt(params.offset, 10) || 0);
  const limit = Math.min(100, Math.max(1, parseInt(params.limit, 10) || defaultLimit));
  return { offset, limit };
};

// ============================================================
// بازیابی نظرات یک پست (با صفحه‌بندی و exclude)
// ============================================================
module.exports.retrieveComments = async (postId, offset = 0, exclude = 0) => {
  if (!isValidObjectId(postId)) {
    throw new Error('شناسه پست نامعتبر است.');
  }

  const { offset: safeOffset } = parsePagination({ offset }, COMMENTS_PER_PAGE);
  const safeExclude = Math.min(Math.max(0, parseInt(exclude, 10) || 0), MAX_COMMENT_EXCLUDE);

  try {
    const aggregation = await Comment.aggregate([
      {
        $facet: {
          comments: [
            { $match: { post: ObjectId(postId) } },
            { $sort: { createdAt: -1 } },        // جدیدترین‌ها اول
            { $skip: safeExclude },
            { $sort: { createdAt: 1 } },          // بازگشت به ترتیب صعودی
            { $skip: safeOffset },
            { $limit: COMMENTS_PER_PAGE },
            {
              $lookup: {
                from: 'commentreplies',
                localField: '_id',
                foreignField: 'parentComment',
                as: 'commentReplies',
              },
            },
            {
              $lookup: {
                from: 'commentvotes',
                localField: '_id',
                foreignField: 'comment',
                as: 'commentVotes',
              },
            },
            { $unwind: { path: '$commentVotes', preserveNullAndEmptyArrays: true } },
            {
              $lookup: {
                from: 'users',
                localField: 'author',
                foreignField: '_id',
                as: 'author',
              },
            },
            { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
            {
              $addFields: {
                commentReplies: { $size: { $ifNull: ['$commentReplies', []] } },
                commentVotes: { $ifNull: ['$commentVotes.votes', []] },
              },
            },
            {
              $unset: ['author.password', 'author.email', 'author.private', 'author.bio', 'author.bookmarks'],
            },
          ],
          commentCount: [
            { $match: { post: ObjectId(postId) } },
            { $group: { _id: null, count: { $sum: 1 } } },
          ],
        },
      },
      { $unwind: { path: '$commentCount', preserveNullAndEmptyArrays: true } },
      { $addFields: { commentCount: { $ifNull: ['$commentCount.count', 0] } } },
    ]);

    return aggregation[0] || { comments: [], commentCount: 0 };
  } catch (err) {
    console.error('[retrieveComments] خطا:', err.message);
    throw new Error('بازیابی نظرات با خطا مواجه شد.');
  }
};

// ============================================================
// ارسال ایمیل
// ============================================================
const createTransporter = () => nodemailer.createTransport(SMTP_CONFIG);

module.exports.sendEmail = async (to, subject, html) => {
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error('آدرس ایمیل مقصد نامعتبر است.');
  if (!subject) throw new Error('موضوع ایمیل الزامی است.');
  if (!html) throw new Error('محتوای HTML ایمیل الزامی است.');

  const transporter = createTransporter();
  await transporter.verify();

  const info = await transporter.sendMail({
    from: `"Instaclone Support" <${process.env.EMAIL_FROM || 'support@instaclone.net'}>`,
    to,
    subject,
    html,
  });

  console.log(`[sendEmail] ارسال شد: ${info.messageId}`);
  return info;
};

module.exports.sendConfirmationEmail = async (username, email, confirmationToken) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log('[sendConfirmationEmail] محیط غیر production - ارسال نشد.');
    return;
  }

  try {
    const templatePath = path.join(__dirname, '..', 'templates', 'confirmationEmail.html');
    if (!fs.existsSync(templatePath)) throw new Error('فایل قالب ایمیل یافت نشد.');

    const source = fs.readFileSync(templatePath, 'utf8');
    const template = handlebars.compile(source);
    const html = template({
      username: username || 'کاربر گرامی',
      confirmationUrl: `${process.env.HOME_URL}/confirm/${confirmationToken}`,
      url: process.env.HOME_URL,
      year: new Date().getFullYear(),
    });

    await module.exports.sendEmail(email, 'تأیید حساب کاربری Instaclone', html);
  } catch (err) {
    console.error('[sendConfirmationEmail] خطا:', err.message);
  }
};

// ============================================================
// نوتیفیکیشن‌ها
// ============================================================
module.exports.sendCommentNotification = async (req, sender, receiver, image, filter, message, postId) => {
  if (!req || !sender || !receiver || !postId) return;
  if (String(sender._id) === String(receiver)) return; // به خودش اطلاع نده

  try {
    const notification = await Notification.create({
      sender: sender._id,
      receiver,
      notificationType: 'comment',
      notificationData: {
        postId,
        image: image || '',
        message: message || '',
        filter: filter || '',
      },
    });

    socketHandler.sendNotification(req, {
      ...notification.toObject(),
      sender: {
        _id: sender._id,
        username: sender.username,
        avatar: sender.avatar,
      },
    });
    console.log(`[sendCommentNotification] به ${receiver} ارسال شد.`);
  } catch (err) {
    console.error('[sendCommentNotification] خطا:', err.message);
  }
};

module.exports.sendMentionNotification = async (req, message, image, post, user) => {
  if (!req || !message || !post || !user) return;

  const mentionRegex = /@([a-zA-Z0-9._]+)/g;
  const mentions = [...new Set(message.match(mentionRegex) || [])];

  for (const mention of mentions) {
    const username = mention.substring(1).toLowerCase();

    // از ارسال نوتیفیکیشن به خود شخص یا نویسندهٔ پست جلوگیری کن
    if (
      username === user.username.toLowerCase() ||
      (post.author?.username && username === post.author.username.toLowerCase())
    ) continue;

    try {
      const receiver = await User.findOne({ username }).select('_id username avatar');
      if (!receiver) continue;

      // جلوگیری از ارسال تکراری در کمتر از ۱ دقیقه
      const alreadySent = await Notification.exists({
        sender: user._id,
        receiver: receiver._id,
        notificationType: 'mention',
        'notificationData.postId': post._id,
        createdAt: { $gte: new Date(Date.now() - 60 * 1000) },
      });
      if (alreadySent) continue;

      const notification = await Notification.create({
        sender: user._id,
        receiver: receiver._id,
        notificationType: 'mention',
        notificationData: {
          postId: post._id,
          image: image || '',
          message: message || '',
          filter: post.filter || '',
        },
      });

      socketHandler.sendNotification(req, {
        ...notification.toObject(),
        sender: {
          _id: user._id,
          username: user.username,
          avatar: user.avatar,
        },
      });
      console.log(`[sendMentionNotification] به ${username} ارسال شد.`);
    } catch (err) {
      console.error(`[sendMentionNotification] خطا برای ${username}:`, err.message);
    }
  }
};

// ============================================================
// تولید نام کاربری یکتا
// ============================================================
module.exports.generateUniqueUsername = async (baseUsername) => {
  if (!baseUsername || typeof baseUsername !== 'string') throw new Error('نام کاربری پایه نامعتبر است.');

  const cleanBase = baseUsername.toLowerCase().replace(/[^a-z0-9._]/g, '').substring(0, 30);
  if (cleanBase.length === 0) throw new Error('پس از پاکسازی خالی شد.');

  for (let i = 0; i < 100; i++) {
    const username = `${cleanBase}${Math.floor(Math.random() * 10000)}`;
    if (!(await User.exists({ username }))) {
      return username;
    }
  }
  throw new Error('پیدا کردن نام یکتا بعد از ۱۰۰ تلاش ناموفق بود.');
};

// ============================================================
// پایپ‌لاین استاندارد برای پست‌ها (populate)
// ============================================================
module.exports.populatePostsPipeline = [
  {
    $lookup: {
      from: 'users',
      localField: 'author',
      foreignField: '_id',
      pipeline: [{ $project: { _id: 1, username: 1, avatar: 1, fullName: 1 } }],
      as: 'author',
    },
  },
  { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
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
      from: 'commentreplies',
      localField: 'comments._id',
      foreignField: 'parentComment',
      pipeline: [{ $project: { _id: 1 } }],
      as: 'commentReplies',
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
      comments: { $size: { $ifNull: ['$comments', []] } },
      commentReplies: { $size: { $ifNull: ['$commentReplies', []] } },
      postVotes: { $size: { $ifNull: [{ $arrayElemAt: ['$postVotes.votes', 0] }, []] } },
    },
  },
  {
    $addFields: { totalComments: { $add: ['$comments', '$commentReplies'] } },
  },
  {
    $unset: ['commentReplies', 'postVotes'],
  },
];
