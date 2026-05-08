// مسیر فایل: /routes/comment.js
// توضیح: تعریف مسیرهای مربوط به نظرات و پاسخ‌ها. این فایل تمام endpointهای
// ایجاد، حذف، رأی‌دهی و بازیابی نظرات و پاسخ‌های آن‌ها را به کنترلرهای
// مربوطه نگاشت می‌کند و میدلورهای احراز هویت را اعمال می‌کند.

// ============================================================
// بخش ۱: ایمپورت وابستگی‌های اصلی
// ============================================================
const express = require('express');
const commentRouter = express.Router();

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
// بخش ۳: تعریف مسیرهای نظرات
// ============================================================

// ایجاد نظر جدید روی یک پست
// POST /api/comments/:postId
commentRouter.post(
  '/:postId',
  requireAuth,
  asyncHandler(createComment)
);

// حذف نظر (فقط توسط نویسنده)
// DELETE /api/comments/:commentId
commentRouter.delete(
  '/:commentId',
  requireAuth,
  asyncHandler(deleteComment)
);

// رأی‌دهی به یک نظر (لایک/دیسلایک)
// POST /api/comments/:commentId/vote
commentRouter.post(
  '/:commentId/vote',
  requireAuth,
  asyncHandler(voteComment)
);

// ایجاد پاسخ برای یک نظر
// POST /api/comments/:parentCommentId/reply
commentRouter.post(
  '/:parentCommentId/reply',
  requireAuth,
  asyncHandler(createCommentReply)
);

// حذف پاسخ نظر (فقط توسط نویسنده)
// DELETE /api/comments/reply/:commentReplyId
commentRouter.delete(
  '/reply/:commentReplyId',
  requireAuth,
  asyncHandler(deleteCommentReply)
);

// رأی‌دهی به یک پاسخ نظر
// POST /api/comments/reply/:commentReplyId/vote
commentRouter.post(
  '/reply/:commentReplyId/vote',
  requireAuth,
  asyncHandler(voteCommentReply)
);

// دریافت پاسخ‌های یک نظر
// GET /api/comments/:parentCommentId/replies?offset=0
commentRouter.get(
  '/:parentCommentId/replies',
  asyncHandler(retrieveCommentReplies)
);

// دریافت نظرات یک پست
// GET /api/comments/:postId?offset=0&exclude=0
commentRouter.get(
  '/:postId',
  asyncHandler(retrieveComments)
);

// ============================================================
// بخش ۴: صادرات Router
// ============================================================
module.exports = commentRouter;
