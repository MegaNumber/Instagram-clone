const express = require('express');
const authRouter = require('./auth');
const userRouter = require('./user');
const postRouter = require('./post');
const commentRouter = require('./comment');
const notificationRouter = require('./notification');
const apiRouter = express.Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/user', userRouter);
apiRouter.use('/post', postRouter);
apiRouter.use('/comment', commentRouter);
apiRouter.use('/notification', notificationRouter);
// ⬇️ سه خط جدید اضافه کنید
router.use('/stories', require('./story'));
router.use('/messages', require('./message'));
router.use('/reels', require('./reel'));

module.exports = apiRouter;
