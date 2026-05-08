// مسیر فایل: /utils/controllerUtils.js
// توضیح: مجموعه ابزارهای کمکی برای کنترلرها. این فایل شامل توابع عمومی برای
// مدیریت نظرات، ارسال ایمیل، تبدیل URL های Cloudinary، ارسال نوتیفیکیشن‌ها
// و تولید نام کاربری یکتا است که در بخش‌های مختلف برنامه استفاده می‌شوند.

// ============================================================
// بخش ۱: ایمپورت کتابخانه‌ها و وابستگی‌های اصلی
// ============================================================
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
// بخش ۲: ثابت‌های پیکربندی
// ============================================================
const COMMENTS_PER_PAGE = 10; // تعداد نظرات در هر صفحه
const MAX_COMMENT_EXCLUDE = 100; // حداکثر تعداد نظرات حذف‌شده
const DEFAULT_AVATAR = 'default-avatar.png'; // آواتار پیش‌فرض
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
// بخش ۳: ابزارهای کمکی عمومی
// ============================================================

/**
 * @function isValidObjectId
 * @description بررسی اعتبار یک رشته به عنوان ObjectId
 * @param {string} id - رشته مورد بررسی
 * @returns {boolean} - نتیجه بررسی
 */
const isValidObjectId = (id) => {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-fA-F]{24}$/.test(id);
};

/**
 * @function parsePagination
 * @description تجزیه و اعتبارسنجی پارامترهای صفحه‌بندی
 * @param {object} params - شیء شامل offset و limit
 * @param {number} defaultLimit - تعداد پیش‌فرض در هر صفحه
 * @returns {object} - شامل offset و limit معتبر
 */
const parsePagination = (params, defaultLimit = 10) => {
  const offset = Math.max(0, parseInt(params.offset, 10) || 0);
  const limit = Math.min(100, Math.max(1, parseInt(params.limit, 10) || defaultLimit));
  return { offset, limit };
};

// ============================================================
// بخش ۴: مدیریت نظرات
// ============================================================

/**
 * بازیابی نظرات یک پست با صفحه‌بندی و امکان حذف نظرات تکراری
 * @function retrieveComments
 * @param {string} postId - شناسه پست
 * @param {number} offset - تعداد نظراتی که باید رد شوند
 * @param {number} exclude - تعداد نظراتی که باید حذف شوند (برای جلوگیری از تکراری)
 * @returns {object} - شیء شامل آرایه نظرات و تعداد کل نظرات
 */
module.exports.retrieveComments = async (postId, offset = 0, exclude = 0) => {
  // اعتبارسنجی شناسه پست
  if (!isValidObjectId(postId)) {
    throw new Error('شناسه پست نامعتبر است.');
  }

  // محدود کردن مقادیر offset و exclude
  const { offset: safeOffset } = parsePagination({ offset }, COMMENTS_PER_PAGE);
  const safeExclude = Math.min(Math.max(0, parseInt(exclude, 10) || 0), MAX_COMMENT_EXCLUDE);

  try {
    const commentsAggregation = await Comment.aggregate([
      {
        $facet: {
          comments: [
            { $match: { post: ObjectId(postId) } },
            // مرتب‌سازی جدیدترین نظرات به بالا
            { $sort: { date: -1 } },
            // حذف نظرات تکراری احتمالی
            { $skip: safeExclude },
            // مرتب‌سازی دوباره به ترتیب صعودی
            { $sort: { date: 1 } },
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
              $unset: [
                'author.password',
                'author.email',
                'author.private',
                'author.bio',
                'author.bookmarks',
              ],
            },
          ],
          commentCount: [
            { $match: { post: ObjectId(postId) } },
            { $group: { _id: null, count: { $sum: 1 } } },
          ],
        },
      },
      {
        $unwind: {
          path: '$commentCount',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          commentCount: { $ifNull: ['$commentCount.count', 0] },
        },
      },
    ]);

    return commentsAggregation[0] || { comments: [], commentCount: 0 };
  } catch (err) {
    console.error('[retrieveComments] خطا در بازیابی نظرات:', err.message);
    throw new Error('بازیابی نظرات با خطا مواجه شد.');
  }
};

// ============================================================
// بخش ۵: ارسال ایمیل
// ============================================================

/**
 * ایجاد transporter برای ارسال ایمیل
 * @function createTransporter
 * @returns {object} - نمونه transporter
 */
const createTransporter = () => {
  return nodemailer.createTransport(SMTP_CONFIG);
};

/**
 * ارسال ایمیل به آدرس مشخص
 * @function sendEmail
 * @param {string} to - آدرس ایمیل مقصد
 * @param {string} subject - موضوع ایمیل
 * @param {string} html - محتوای HTML ایمیل
 */
module.exports.sendEmail = async (to, subject, html) => {
  // اعتبارسنجی ایمیل مقصد
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    throw new Error('آدرس ایمیل مقصد نامعتبر است.');
  }

  if (!subject) {
    throw new Error('موضوع ایمیل الزامی است.');
  }

  if (!html) {
    throw new Error('محتوای HTML ایمیل الزامی است.');
  }

  const transporter = createTransporter();

  try {
    // بررسی اتصال به SMTP قبل از ارسال
    await transporter.verify();

    const info = await transporter.sendMail({
      from: `"Instaclone Support" <${process.env.EMAIL_FROM || 'support@instaclone.net'}>`,
      to,
      subject,
      html,
    });

    console.log('[sendEmail] ایمیل با موفقیت ارسال شد:', {
      messageId: info.messageId,
      to,
      subject,
    });

    return info;
  } catch (err) {
    console.error('[sendEmail] خطا در ارسال ایمیل:', err.message);
    throw new Error('ارسال ایمیل با خطا مواجه شد.');
  }
};

/**
 * ارسال ایمیل تأیید حساب کاربری
 * @function sendConfirmationEmail
 * @param {string} username - نام کاربری گیرنده
 * @param {string} email - ایمیل گیرنده
 * @param {string} confirmationToken - توکن تأیید
 */
module.exports.sendConfirmationEmail = async (username, email, confirmationToken) => {
  // فقط در محیط production ایمیل ارسال می‌شود
  if (process.env.NODE_ENV !== 'production') {
    console.log('[sendConfirmationEmail] محیط غیر production - ایمیل ارسال نشد.');
    return;
  }

  try {
    // مسیر فایل قالب ایمیل
    const templatePath = path.join(__dirname, '..', 'templates', 'confirmationEmail.html');

    // بررسی وجود فایل قالب
    if (!fs.existsSync(templatePath)) {
      throw new Error(`فایل قالب ایمیل در مسیر ${templatePath} یافت نشد.`);
    }

    // خواندن و کامپایل قالب Handlebars
    const source = fs.readFileSync(templatePath, 'utf8');
    const template = handlebars.compile(source);
    const html = template({
      username: username || 'کاربر گرامی',
      confirmationUrl: `${process.env.HOME_URL}/confirm/${confirmationToken}`,
      url: process.env.HOME_URL,
      year: new Date().getFullYear(),
    });

    // ارسال ایمیل
    await module.exports.sendEmail(email, 'تأیید حساب کاربری Instaclone', html);

    console.log(`[sendConfirmationEmail] ایمیل تأیید به ${email} ارسال شد.`);
  } catch (err) {
    console.error('[sendConfirmationEmail] خطا در ارسال ایمیل تأیید:', err.message);
    // خطا را مجدد پرتاب نمی‌کنیم تا فرایند اصلی مختل نشود
    // اما می‌توانیم آن را در سیستم لاگ‌گیری ثبت کنیم
  }
};

// ============================================================
// بخش ۶: تبدیل URL های Cloudinary
// ============================================================

/**
 * فرمت کردن URL ابری Cloudinary با اندازه مشخص
 * @function formatCloudinaryUrl
 * @param {string} url - URL اصلی Cloudinary
 * @param {object} size - شیء شامل width، height و موقعیت (x, y)
 * @param {boolean} thumb - آیا تصویر به صورت thumbnail برش داده شود؟
 * @returns {string} - URL فرمت‌شده
 */
module.exports.formatCloudinaryUrl = (url, size = {}, thumb = false) => {
  if (!url || typeof url !== 'string') {
    console.warn('[formatCloudinaryUrl] URL نامعتبر است.');
    return url || '';
  }

  if (!url.includes('upload/')) {
    console.warn('[formatCloudinaryUrl] URL شامل بخش upload/ نیست.');
    return url;
  }

  const { width = 400, height = 400, x, y } = size;

  // ساخت transformation string
  const transformations = [];

  // افزودن مختصات برش در صورت وجود
  if (x !== undefined && y !== undefined) {
    transformations.push(`x_${x},y_${y}`);
  }

  // افزودن ابعاد
  transformations.push(`w_${width},h_${height}`);

  // افزودن پرچم thumbnail
  if (thumb) {
    transformations.push('c_thumb');
  }

  // افزودن بهینه‌سازی خودکار
  transformations.push('f_auto,q_auto');

  const transformationStr = transformations.join('/');

  // جایگزینی بخش upload/ با upload/transformations/
  const formattedUrl = url.replace('/upload/', `/upload/${transformationStr}/`);

  return formattedUrl;
};

// ============================================================
// بخش ۷: ارسال نوتیفیکیشن‌ها
// ============================================================

/**
 * ارسال نوتیفیکیشن برای کامنت جدید
 * @function sendCommentNotification
 * @param {object} req - شیء درخواست Express
 * @param {object} sender - کاربر ارسال‌کننده کامنت
 * @param {string} receiver - شناسه کاربر دریافت‌کننده نوتیفیکیشن
 * @param {string} image - تصویر پست
 * @param {string} filter - فیلتر اعمال‌شده روی تصویر
 * @param {string} message - متن کامنت
 * @param {string} postId - شناسه پست
 */
module.exports.sendCommentNotification = async (
  req,
  sender,
  receiver,
  image,
  filter,
  message,
  postId
) => {
  // اعتبارسنجی ورودی‌ها
  if (!req || !sender || !receiver || !postId) {
    console.warn('[sendCommentNotification] پارامترهای الزامی ناقص هستند.');
    return;
  }

  // جلوگیری از ارسال نوتیفیکیشن به خود کاربر
  if (String(sender._id) === String(receiver)) {
    return;
  }

  try {
    const notification = await Notification.create({
      sender: sender._id,
      receiver,
      notificationType: 'comment',
      date: new Date(),
      notificationData: {
        postId,
        image: image || '',
        message: message || '',
        filter: filter || '',
      },
    });

    // ارسال نوتیفیکیشن از طریق سوکت
    socketHandler.sendNotification(req, {
      ...notification.toObject(),
      sender: {
        _id: sender._id,
        username: sender.username,
        avatar: sender.avatar,
      },
    });

    console.log(`[sendCommentNotification] نوتیفیکیشن کامنت به کاربر ${receiver} ارسال شد.`);
  } catch (err) {
    console.error('[sendCommentNotification] خطا در ارسال نوتیفیکیشن:', err.message);
    throw new Error('ارسال نوتیفیکیشن کامنت با خطا مواجه شد.');
  }
};

/**
 * ارسال نوتیفیکیشن برای منشن شدن در کامنت
 * @function sendMentionNotification
 * @param {object} req - شیء درخواست Express
 * @param {string} message - متن کامنت حاوی mention
 * @param {string} image - تصویر پست
 * @param {object} post - شیء پست
 * @param {object} user - کاربر ارسال‌کننده کامنت
 */
module.exports.sendMentionNotification = async (req, message, image, post, user) => {
  if (!req || !message || !post || !user) {
    console.warn('[sendMentionNotification] پارامترهای الزامی ناقص هستند.');
    return;
  }

  // استخراج mention ها با استفاده از regex (جایگزین linkifyjs)
  const mentionRegex = /@([a-zA-Z0-9._]+)/g;
  const mentions = message.match(mentionRegex) || [];

  // حذف mention های تکراری
  const uniqueMentions = [...new Set(mentions)];

  for (const mention of uniqueMentions) {
    const username = mention.substring(1).toLowerCase();

    // جلوگیری از ارسال نوتیفیکیشن به خود کاربر یا نویسنده پست
    if (
      username === user.username.toLowerCase() ||
      (post.author && username === post.author.username?.toLowerCase())
    ) {
      continue;
    }

    try {
      // یافتن کاربر منشن‌شده
      const receiver = await User.findOne({ username }).select('_id username avatar');

      if (!receiver) {
        continue; // کاربر یافت نشد، ادامه می‌دهیم
      }

      // بررسی عدم ارسال نوتیفیکیشن تکراری
      const existingNotification = await Notification.findOne({
        sender: user._id,
        receiver: receiver._id,
        notificationType: 'mention',
        'notificationData.postId': post._id,
        date: { $gte: new Date(Date.now() - 60 * 1000) }, // در یک دقیقه اخیر
      });

      if (existingNotification) {
        continue;
      }

      const notification = await Notification.create({
        sender: user._id,
        receiver: receiver._id,
        notificationType: 'mention',
        date: new Date(),
        notificationData: {
          postId: post._id,
          image: image || '',
          message: message || '',
          filter: post.filter || '',
        },
      });

      // ارسال نوتیفیکیشن از طریق سوکت
      socketHandler.sendNotification(req, {
        ...notification.toObject(),
        sender: {
          _id: user._id,
          username: user.username,
          avatar: user.avatar,
        },
      });

      console.log(`[sendMentionNotification] نوتیفیکیشن منشن به کاربر ${username} ارسال شد.`);
    } catch (err) {
      console.error(`[sendMentionNotification] خطا در ارسال نوتیفیکیشن به ${username}:`, err.message);
      // ادامه می‌دهیم تا سایر mention ها پردازش شوند
    }
  }
};

// ============================================================
// بخش ۸: تولید نام کاربری یکتا
// ============================================================

/**
 * تولید یک نام کاربری یکتا بر اساس نام پایه
 * @function generateUniqueUsername
 * @param {string} baseUsername - نام کاربری پایه
 * @returns {Promise<string>} - نام کاربری یکتا
 */
module.exports.generateUniqueUsername = async (baseUsername) => {
  if (!baseUsername || typeof baseUsername !== 'string') {
    throw new Error('نام کاربری پایه نامعتبر است.');
  }

  // پاکسازی نام کاربری پایه
  const cleanBase = baseUsername.toLowerCase().replace(/[^a-z0-9._]/g, '').substring(0, 30);

  if (cleanBase.length === 0) {
    throw new Error('نام کاربری پایه پس از پاکسازی خالی است.');
  }

  const MAX_ATTEMPTS = 100; // حداکثر تلاش برای یافتن نام یکتا
  let attempts = 0;

  while (attempts < MAX_ATTEMPTS) {
    const randomNum = Math.floor(Math.random() * 10000);
    const username = `${cleanBase}${randomNum}`;

    try {
      const existingUser = await User.findOne({ username }).select('_id');
      if (!existingUser) {
        return username;
      }
    } catch (err) {
      console.error('[generateUniqueUsername] خطا در بررسی یکتایی:', err.message);
      throw new Error('تولید نام کاربری یکتا با خطا مواجه شد.');
    }

    attempts++;
  }

  throw new Error('تولید نام کاربری یکتا پس از ۱۰۰ تلاش ممکن نشد.');
};

// ============================================================
// بخش ۹: Pipeline برای Populate پست‌ها
// ============================================================

/**
 * پایپ‌لاین استاندارد برای populate اطلاعات پست‌ها
 * @constant populatePostsPipeline
 * @type {Array<object>}
 * @description این پایپ‌لاین شامل lookup های لازم برای دریافت اطلاعات
 * نویسنده، نظرات، پاسخ‌ها و آرای پست‌ها است.
 */
module.exports.populatePostsPipeline = [
  {
    $lookup: {
      from: 'users',
      localField: 'author',
      foreignField: '_id',
      pipeline: [
        {
          $project: {
            _id: 1,
            username: 1,
            avatar: 1,
            fullName: 1,
          },
        },
      ],
      as: 'author',
    },
  },
  { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
  {
    $lookup: {
      from: 'comments',
      localField: '_id',
      foreignField: 'post',
      pipeline: [
        { $project: { _id: 1 } },
      ],
      as: 'comments',
    },
  },
  {
    $lookup: {
      from: 'commentreplies',
      localField: 'comments._id',
      foreignField: 'parentComment',
      pipeline: [
        { $project: { _id: 1 } },
      ],
      as: 'commentReplies',
    },
  },
  {
    $lookup: {
      from: 'postvotes',
      localField: '_id',
      foreignField: 'post',
      pipeline: [
        { $project: { _id: 1, votes: 1 } },
      ],
      as: 'postVotes',
    },
  },
  {
    $addFields: {
      comments: { $size: { $ifNull: ['$comments', []] } },
      commentReplies: { $size: { $ifNull: ['$commentReplies', []] } },
      postVotes: {
        $size: {
          $ifNull: [
            { $arrayElemAt: ['$postVotes.votes', 0] },
            [],
          ],
        },
      },
    },
  },
  {
    $addFields: {
      totalComments: { $add: ['$comments', '$commentReplies'] },
    },
  },
  {
    $unset: [
      'commentReplies',
      'postVotes',
    ],
  },
];

module.exports = exports;
