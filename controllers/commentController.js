// مسیر فایل: /controllers/commentController.js
// توضیح: کنترلر مدیریت نظرات و پاسخ‌ها. این فایل منطق ایجاد، حذف، رأی‌دهی و
// بازیابی نظرات و پاسخ‌های آن‌ها را مدیریت می‌کند. همچنین شامل ارسال
// نوتیفیکیشن‌های مربوط به کامنت، منشن‌ها و رأی‌های نظرات/پاسخ‌ها است.
// از الگوی asyncHandler و تراکنش‌های MongoDB برای اتمی‌سازی رأی‌ها استفاده می‌کند.
//
// [v2.1.0] تغییرات:
// - رأی‌دهی به کامنت و پاسخ‌ها اکنون با تراکنش و نوتیفیکیشن انجام می‌شود
// - افزودن Notification و runTransaction برای atomic vote + notification
// - استفاده از mongoose session در تراکنش برای انسجام داده‌ها

// ============================================================
// بخش ۱: ایمپورت ماژول‌های مورد نیاز
// ============================================================
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;

const Comment = require('../models/Comment');
const CommentVote = require('../models/CommentVote');
const CommentReply = require('../models/CommentReply');
const CommentReplyVote = require('../models/CommentReplyVote');
const Post = require('../models/Post');
const User = require('../models/User');
const Notification = require('../models/Notification');     // [v2.1.0]
const asyncHandler = require('../utils/asyncHandler');
const socketHandler = require('../handlers/socketHandler');
const runTransaction = require('../utils/transactionHelper'); // [v2.1.0]

const {
  retrieveComments,
  sendCommentNotification,
  sendMentionNotification,
} = require('../utils/controllerUtils');

// ============================================================
// بخش ۲: ثابت‌های پیکربندی
// ============================================================
const THUMB_SIZE = { width: 50, height: 50 };

// ============================================================
// بخش ۳: توابع کمکی
// ============================================================

/**
 * تولید نسخه بندانگشتی کوچک برای نوتیفیکیشن
 */
const generateNotificationThumbnail = async (imagePath) => {
  const fullPath = path.join(__dirname, '..', imagePath);
  const thumbPath = fullPath.replace(/(\.\w+)$/, '_notif_thumb$1');
  try {
    await sharp(fullPath)
      .resize(THUMB_SIZE.width, THUMB_SIZE.height, { fit: 'cover' })
      .jpeg({ quality: 70 })
      .toFile(thumbPath);
    return thumbPath.replace(path.join(__dirname, '..', 'public'), '');
  } catch (err) {
    console.error('[generateNotificationThumbnail] خطا:', err.message);
    return imagePath;
  }
};

// ============================================================
// بخش ۴: ایجاد نظر (بدون تغییر عمده)
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

  const notifThumb = await generateNotificationThumbnail(post.thumbnail || post.image);

  sendCommentNotification(req, user, post.author, notifThumb, post.filter, message, post._id);

  const postWithAuthor = await Post.findById(post._id).populate('author', 'username avatar');
  if (postWithAuthor) {
    sendMentionNotification(req, message, notifThumb, postWithAuthor, user);
  }
});

// ============================================================
// بخش ۵: حذف نظر (بدون تغییر)
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

  const deleteResult = await Comment.deleteOne({ _id: commentId });
  if (!deleteResult.deletedCount) {
    return res.status(500).json({ success: false, error: 'حذف نظر با مشکل مواجه شد.' });
  }

  res.status(200).json({ success: true, message: 'نظر با موفقیت حذف شد.' });
});

// ============================================================
// بخش ۶: رأی به نظر (تراکنشی + نوتیفیکیشن)
// ============================================================
module.exports.voteComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  const user = res.locals.user;

  // ۱. واکشی اطلاعات نظر (نویسنده و پست) خارج از تراکنش
  const comment = await Comment.findById(commentId).select('author post').lean();
  if (!comment) {
    return res.status(404).json({ success: false, error: 'نظری با این شناسه یافت نشد.' });
  }

  // ۲. تراکنش: به‌روزرسانی رأی + ایجاد نوتیفیکیشن
  const result = await runTransaction(async (session) => {
    // یافتن یا ایجاد سند رأی برای این کامنت
    let voteDoc = await CommentVote.findOne({ comment: commentId }).session(session);
    if (!voteDoc) {
      voteDoc = new CommentVote({ comment: commentId, votes: [] });
    }

    const existingVote = voteDoc.votes.find(
      (v) => v.author.toString() === user._id.toString()
    );

    let operation;
    if (existingVote) {
      // unlike
      voteDoc.votes.pull({ author: user._id });
      operation = 'removed';
    } else {
      // like
      voteDoc.votes.push({ author: user._id });
      operation = 'added';
    }

    await voteDoc.save({ session });

    // ایجاد نوتیفیکیشن در صورت like و اگر رأی دهنده ≠ نویسنده نظر
    let notification = null;
    if (operation === 'added' && String(comment.author) !== String(user._id)) {
      // برای نوتیفیکیشن نیاز به تصویر پست داریم (بندانگشتی)
      const post = await Post.findById(comment.post).select('thumbnail image filter').session(session);
      const thumb = post?.thumbnail || post?.image || '';
      notification = await Notification.create(
        [{
          notificationType: 'commentLike',
          sender: user._id,
          receiver: comment.author,
          notificationData: {
            commentId,
            postId: comment.post,
            image: thumb,
            filter: post?.filter || '',
          },
        }],
        { session }
      );
      notification = notification[0];
    }

    return { operation, notification };
  });

  // ۳. ارسال نوتیفیکیشن از طریق سوکت (خارج از تراکنش)
  if (result.operation === 'added' && result.notification) {
    socketHandler.sendNotification(req, {
      ...result.notification.toObject(),
      sender: {
        _id: user._id,
        username: user.username,
        avatar: user.avatar,
      },
    });
  }

  res.status(200).json({
    success: true,
    operation: result.operation === 'added' ? 'like' : 'unlike',
  });
});

// ============================================================
// بخش ۷: ایجاد پاسخ به نظر (بدون تغییر)
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

  const post = await Post.findById(parentComment.post)
    .populate('author', 'username avatar')
    .select('image thumbnail filter author');

  if (post) {
    const notifThumb = await generateNotificationThumbnail(post.thumbnail || post.image);
    sendCommentNotification(req, user, post.author._id, notifThumb, post.filter, message, post._id);
    sendMentionNotification(req, message, notifThumb, post, user);
  }
});

// ============================================================
// بخش ۸: حذف پاسخ نظر (بدون تغییر)
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
// بخش ۹: رأی به پاسخ نظر (تراکنشی + نوتیفیکیشن)
// ============================================================
module.exports.voteCommentReply = asyncHandler(async (req, res) => {
  const { commentReplyId } = req.params;
  const user = res.locals.user;

  // واکشی اطلاعات پاسخ (نویسنده، کامنت والد) خارج از تراکنش
  const reply = await CommentReply.findById(commentReplyId)
    .select('author parentComment')
    .lean();
  if (!reply) {
    return res.status(404).json({ success: false, error: 'پاسخی با این شناسه یافت نشد.' });
  }

  // برای دریافت postId باید از parentComment به comment اصلی برویم
  const parentComment = await Comment.findById(reply.parentComment).select('post').lean();
  if (!parentComment) {
    return res.status(404).json({ success: false, error: 'نظر والد یافت نشد.' });
  }

  const result = await runTransaction(async (session) => {
    let voteDoc = await CommentReplyVote.findOne({ comment: commentReplyId }).session(session);
    if (!voteDoc) {
      voteDoc = new CommentReplyVote({ comment: commentReplyId, votes: [] });
    }

    const existingVote = voteDoc.votes.find(
      (v) => v.author.toString() === user._id.toString()
    );

    let operation;
    if (existingVote) {
      voteDoc.votes.pull({ author: user._id });
      operation = 'removed';
    } else {
      voteDoc.votes.push({ author: user._id });
      operation = 'added';
    }

    await voteDoc.save({ session });

    let notification = null;
    if (operation === 'added' && String(reply.author) !== String(user._id)) {
      const post = await Post.findById(parentComment.post).select('thumbnail image filter').session(session);
      const thumb = post?.thumbnail || post?.image || '';
      notification = await Notification.create(
        [{
          notificationType: 'replyLike',
          sender: user._id,
          receiver: reply.author,
          notificationData: {
            commentReplyId,
            commentId: reply.parentComment,
            postId: parentComment.post,
            image: thumb,
            filter: post?.filter || '',
          },
        }],
        { session }
      );
      notification = notification[0];
    }

    return { operation, notification };
  });

  if (result.operation === 'added' && result.notification) {
    socketHandler.sendNotification(req, {
      ...result.notification.toObject(),
      sender: {
        _id: user._id,
        username: user.username,
        avatar: user.avatar,
      },
    });
  }

  res.status(200).json({
    success: true,
    operation: result.operation === 'added' ? 'like' : 'unlike',
  });
});

// ============================================================
// بخش ۱۰: دریافت پاسخ‌های یک نظر (بدون تغییر)
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
        pipeline: [{ $project: { username: 1, avatar: 1 } }],
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
// بخش ۱۱: دریافت نظرات یک پست (بدون تغییر)
// ============================================================
module.exports.retrieveComments = asyncHandler(async (req, res) => {
  const { postId, offset, exclude } = req.params;
  const comments = await retrieveComments(postId, offset, exclude);
  return res.status(200).json({ success: true, data: comments });
});

module.exports = exports;
