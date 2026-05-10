// مسیر فایل: /routes/comment.js
// توضیح: تعریف مسیرهای مربوط به نظرات و پاسخ‌ها. این فایل تمام endpointهای
// ایجاد، حذف، رأی‌دهی و بازیابی نظرات و پاسخ‌های آن‌ها را به کنترلرهای
// مربوطه نگاشت می‌کند و میدلورهای احراز هویت را اعمال می‌کند.
//
// [v2.0.0] اصلاحیه:
// - افزودن validateObjectId برای تمام مسیرهای دارای پارامترهای شناسه
//   (postId, commentId, parentCommentId, commentReplyId)

// ============================================================
// بخش ۱: ایمپورت وابستگی‌های اصلی
// ============================================================
const express = require('express');
const commentRouter = express.Router();
const mongoose = require('mongoose');                     // mongoose@7.x

// ============================================================
// بخش ۲: ایمپورت میدلورها و کنترلرها
// ============================================================
const { requireAuth } = require('../controllers/authController');
const asyncHandler = require('../utils/asyncHandler');

const {
  createComment,
  deleteComment,
  voteComment,
  createCommentReply,
  deleteCommentReply,
  voteCommentReply,
  retrieveCommentReplies,
  retrieveComments,
} = require('../controllers/commentController');

// ============================================================
// بخش ۳: میدلور اعتبارسنجی شناسه‌های مونگو
// ============================================================
/**
 * @middleware validateObjectId
 * @description بررسی معتبر بودن شناسهٔ MongoDB. در صورت نامعتبر بودن،
 * پاسخ ۴۰۰ با پیام خطای فارسی برگردانده می‌شود.
 * @param {string} paramName - نام پارامتر (مثلاً postId, commentId)
 */
const validateObjectId = (paramName) => (req, res, next) => {
  const id = req.params[paramName];
  if (id && !mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      error: `شناسه ${paramName} نامعتبر است.`,
    });
  }
  next();
};

// ============================================================
// بخش ۴: تعریف مسیرهای نظرات
// ============================================================

// ایجاد نظر جدید روی یک پست
// POST /api/comments/:postId
commentRouter.post(
  '/:postId',
  requireAuth,
  validateObjectId('postId'),           // [v2.0.0] افزوده شد
  asyncHandler(createComment)
);

// حذف نظر (فقط توسط نویسنده)
// DELETE /api/comments/:commentId
commentRouter.delete(
  '/:commentId',
  requireAuth,
  validateObjectId('commentId'),        // [v2.0.0] افزوده شد
  asyncHandler(deleteComment)
);

// رأی‌دهی به یک نظر (لایک/دیسلایک)
// POST /api/comments/:commentId/vote
commentRouter.post(
  '/:commentId/vote',
  requireAuth,
  validateObjectId('commentId'),        // [v2.0.0] افزوده شد
  asyncHandler(voteComment)
);

// ایجاد پاسخ برای یک نظر
// POST /api/comments/:parentCommentId/reply
commentRouter.post(
  '/:parentCommentId/reply',
  requireAuth,
  validateObjectId('parentCommentId'),  // [v2.0.0] افزوده شد
  asyncHandler(createCommentReply)
);

// حذف پاسخ نظر (فقط توسط نویسنده)
// DELETE /api/comments/reply/:commentReplyId
commentRouter.delete(
  '/reply/:commentReplyId',
  requireAuth,
  validateObjectId('commentReplyId'),   // [v2.0.0] افزوده شد
  asyncHandler(deleteCommentReply)
);

// رأی‌دهی به یک پاسخ نظر
// POST /api/comments/reply/:commentReplyId/vote
commentRouter.post(
  '/reply/:commentReplyId/vote',
  requireAuth,
  validateObjectId('commentReplyId'),   // [v2.0.0] افزوده شد
  asyncHandler(voteCommentReply)
);

// دریافت پاسخ‌های یک نظر
// GET /api/comments/:parentCommentId/replies?offset=0
commentRouter.get(
  '/:parentCommentId/replies',
  validateObjectId('parentCommentId'),  // [v2.0.0] افزوده شد (بدون نیاز به احراز)
  asyncHandler(retrieveCommentReplies)
);

// دریافت نظرات یک پست
// GET /api/comments/:postId?offset=0&exclude=0
commentRouter.get(
  '/:postId',
  validateObjectId('postId'),           // [v2.0.0] افزوده شد (بدون نیاز به احراز)
  asyncHandler(retrieveComments)
);

// ============================================================
// بخش ۵: صادرات Router
// ============================================================
module.exports = commentRouter;
