// مسیر فایل: /controllers/commentController.js
// توضیح: کنترلر مدیریت نظرات و پاسخ‌ها. این فایل منطق ایجاد، حذف، رأی‌دهی و
// بازیابی نظرات و پاسخ‌های آن‌ها را مدیریت می‌کند. همچنین شامل ارسال
// نوتیفیکیشن‌های مربوط به کامنت و منشن‌ها است. از الگوی asyncHandler
// برای حذف try-catch تکراری استفاده می‌کند.

// ============================================================
// بخش ۱: ایمپورت ماژول‌های مورد نیاز
// ============================================================
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const sharp = require('sharp'); // برای تولید بندانگشتی نوتیفیکیشن
const path = require('path');
const fs = require('fs').promises;

const Comment = require('../models/Comment');
const CommentVote = require('../models/CommentVote');
const CommentReply = require('../models/CommentReply');
const CommentReplyVote = require('../models/CommentReplyVote');
const Post = require('../models/Post');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const socketHandler = require('../handlers/socketHandler');

const {
  retrieveComments,
  sendCommentNotification,
  sendMentionNotification,
} = require('../utils/controllerUtils');

// ============================================================
// بخش ۲: ثابت‌های پیکربندی
// ============================================================
const THUMB_SIZE = { width: 50, height: 50 }; // ابعاد بندانگشتی نوتیفیکیشن

// ============================================================
// بخش ۳: توابع کمکی
// ============================================================

/**
 * @function generateNotificationThumbnail
 * @description تولید نسخه‌ی بندانگشتی کوچک برای نوتیفیکیشن (۵۰×۵۰)
 * @param {string} imagePath - مسیر فایل اصلی روی سرور (مثلاً public/uploads/xxx.jpg)
 * @returns {Promise<string>} مسیر فایل بندانگشتی
 */
const generateNotificationThumbnail = async (imagePath) => {
  const fullPath = path.join(__dirname, '..', imagePath);
  const thumbPath = fullPath.replace(/(\.\w+)$/, '_notif_thumb$1');
  try {
    await sharp(fullPath)
      .resize(THUMB_SIZE.width, THUMB_SIZE.height, { fit: 'cover' })
      .jpeg({ quality: 70 })
      .toFile(thumbPath);
    // بازگرداندن مسیر نسبی از ریشه public
    return thumbPath.replace(path.join(__dirname, '..', 'public'), '');
  } catch (err) {
    console.error('[generateNotificationThumbnail] خطا:', err.message);
    // در صورت خطا، مسیر اصلی را برمی‌گردانیم
    return imagePath;
  }
};

// ============================================================
// بخش ۴: کنترلر - ایجاد نظر (Create Comment)
// ============================================================
module.exports.createComment = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const { message } = req.body;
  const user = res.locals.user;

  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, error: 'متن نظر نمی‌تواند خالی باشد.' });
  }
  if (!postId) {
    return res.status(400).json({ success: false, error: 'شناسه پست الزامی است.' });
  }

  const post = await Post.findById(postId).select('_id author image thumbnail filter');
  if (!post) {
    return res.status(404).json({ success: false, error: 'پستی با این شناسه یافت نشد.' });
  }

  // ایجاد نظر
  const comment = await Comment.create({
    message: message.trim(),
    author: user._id,
    post: postId,
  });

  res.status(201).json({
    success: true,
    data: {
      ...comment.toObject(),
      author: { _id: user._id, username: user.username, avatar: user.avatar },
      commentVotes: [],
      commentReplies: 0,
    },
  });

  // ارسال نوتیفیکیشن‌ها در پس‌زمینه (بدون await)
  // ۱. نوتیفیکیشن کامنت به نویسنده پست
  // تولید بندانگشتی مناسب برای نوتیفیکیشن
  const notifThumb = await generateNotificationThumbnail(post.thumbnail || post.image);

  sendCommentNotification(
    req,
    user,
    post.author,
    notifThumb,
    post.filter,
    message,
    post._id
  );

  // ۲. نوتیفیکیشن منشن به کاربران تگ‌شده
  // ابتدا اطلاعات کامل پست به همراه نویسنده را بگیر
  const postWithAuthor = await Post.findById(post._id).populate('author', 'username avatar');
  if (postWithAuthor) {
    sendMentionNotification(req, message, notifThumb, postWithAuthor, user);
  }
});

// ============================================================
// بخش ۵: کنترلر - حذف نظر (Delete Comment)
// ============================================================
module.exports.deleteComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  const user = res.locals.user;

  const comment = await Comment.findOne({ _id: commentId, author: user._id });
  if (!comment) {
    return res.status(404).json({
      success: false,
      error: 'نظری با این شناسه و متعلق به شما یافت نشد.',
    });
  }

  // حذف نظر (هوک‌های pre وظیفه حذف رأی‌ها و پاسخ‌ها را دارند)
  const deleteResult = await Comment.deleteOne({ _id: commentId });
  if (!deleteResult.deletedCount) {
    return res.status(500).json({ success: false, error: 'حذف نظر با مشکل مواجه شد.' });
  }

  res.status(200).json({ success: true, message: 'نظر با موفقیت حذف شد.' });
});

// ============================================================
// بخش ۶: کنترلر - رأی به نظر (Vote Comment)
// ============================================================
module.exports.voteComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  const user = res.locals.user;

  // افزودن رأی
  const addResult = await CommentVote.updateOne(
    { comment: commentId, 'votes.author': { $ne: user._id } },
    { $push: { votes: { author: user._id } } }
  );

  if (addResult.modifiedCount > 0) {
    return res.status(200).json({ success: true, operation: 'like' });
  }

  // اگر رأی قبلاً وجود داشته، حذف می‌کنیم
  const removeResult = await CommentVote.updateOne(
    { comment: commentId },
    { $pull: { votes: { author: user._id } } }
  );

  if (removeResult.modifiedCount === 0) {
    return res.status(500).json({ success: false, error: 'عملیات رأی‌دهی با خطا مواجه شد.' });
  }

  return res.status(200).json({ success: true, operation: 'unlike' });
});

// ============================================================
// بخش ۷: ایجاد پاسخ به نظر (Create Comment Reply)
// ============================================================
module.exports.createCommentReply = asyncHandler(async (req, res) => {
  const { parentCommentId } = req.params;
  const { message } = req.body;
  const user = res.locals.user;

  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, error: 'متن پاسخ نمی‌تواند خالی باشد.' });
  }
  if (!parentCommentId) {
    return res.status(400).json({ success: false, error: 'شناسه نظر والد الزامی است.' });
  }

  const parentComment = await Comment.findById(parentCommentId).select('post');
  if (!parentComment) {
    return res.status(404).json({ success: false, error: 'نظر والد یافت نشد.' });
  }

  // ایجاد پاسخ
  const commentReply = await CommentReply.create({
    parentComment: parentCommentId,
    message: message.trim(),
    author: user._id,
  });

  res.status(201).json({
    success: true,
    data: {
      ...commentReply.toObject(),
      author: { _id: user._id, username: user.username, avatar: user.avatar },
      commentReplyVotes: [],
    },
  });

  // دریافت اطلاعات پست برای نوتیفیکیشن
  const post = await Post.findById(parentComment.post)
    .populate('author', 'username avatar')
    .select('image thumbnail filter author');

  if (post) {
    const notifThumb = await generateNotificationThumbnail(post.thumbnail || post.image);

    // نوتیفیکیشن به نویسنده پست
    sendCommentNotification(
      req,
      user,
      post.author._id,
      notifThumb,
      post.filter,
      message,
      post._id
    );

    // نوتیفیکیشن منشن
    sendMentionNotification(req, message, notifThumb, post, user);
  }
});

// ============================================================
// بخش ۸: حذف پاسخ نظر (Delete Comment Reply)
// ============================================================
module.exports.deleteCommentReply = asyncHandler(async (req, res) => {
  const { commentReplyId } = req.params;
  const user = res.locals.user;

  const reply = await CommentReply.findOne({ _id: commentReplyId, author: user._id });
  if (!reply) {
    return res.status(404).json({
      success: false,
      error: 'پاسخی با این شناسه و متعلق به شما یافت نشد.',
    });
  }

  await CommentReply.deleteOne({ _id: commentReplyId });

  res.status(200).json({ success: true, message: 'پاسخ با موفقیت حذف شد.' });
});

// ============================================================
// بخش ۹: رأی به پاسخ نظر (Vote Comment Reply)
// ============================================================
module.exports.voteCommentReply = asyncHandler(async (req, res) => {
  const { commentReplyId } = req.params;
  const user = res.locals.user;

  const addResult = await CommentReplyVote.updateOne(
    { comment: commentReplyId, 'votes.author': { $ne: user._id } },
    { $push: { votes: { author: user._id } } }
  );

  if (addResult.modifiedCount > 0) {
    return res.status(200).json({ success: true, operation: 'like' });
  }

  const removeResult = await CommentReplyVote.updateOne(
    { comment: commentReplyId },
    { $pull: { votes: { author: user._id } } }
  );

  if (removeResult.modifiedCount === 0) {
    return res.status(500).json({ success: false, error: 'عملیات رأی‌دهی با خطا مواجه شد.' });
  }

  return res.status(200).json({ success: true, operation: 'unlike' });
});

// ============================================================
// بخش ۱۰: دریافت پاسخ‌های یک نظر (Retrieve Comment Replies)
// ============================================================
module.exports.retrieveCommentReplies = asyncHandler(async (req, res) => {
  const { parentCommentId, offset = 0 } = req.params;

  const parentComment = await Comment.findById(parentCommentId).select('_id');
  if (!parentComment) {
    return res.status(404).json({ success: false, error: 'نظر والد یافت نشد.' });
  }

  const replies = await CommentReply.aggregate([
    { $match: { parentComment: ObjectId(parentCommentId) } },
    { $sort: { createdAt: -1 } },
    { $skip: Number(offset) },
    { $limit: 3 },
    {
      $lookup: {
        from: 'commentreplyvotes',
        localField: '_id',
        foreignField: 'comment',
        as: 'commentReplyVotes',
      },
    },
    { $unwind: { path: '$commentReplyVotes', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'users',
        localField: 'author',
        foreignField: '_id',
        pipeline: [
          { $project: { username: 1, avatar: 1 } },
        ],
        as: 'author',
      },
    },
    { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        commentReplyVotes: { $ifNull: ['$commentReplyVotes.votes', []] },
      },
    },
  ]);

  if (replies.length === 0) {
    return res.status(404).json({
      success: false,
      error: 'پاسخی برای این نظر یافت نشد.',
    });
  }

  return res.status(200).json({ success: true, data: replies });
});

// ============================================================
// بخش ۱۱: دریافت نظرات یک پست (Retrieve Comments) – صرفاً واسط
// ============================================================
module.exports.retrieveComments = asyncHandler(async (req, res) => {
  const { postId, offset, exclude } = req.params;
  const comments = await retrieveComments(postId, offset, exclude);
  return res.status(200).json({ success: true, data: comments });
});

module.exports = exports;
