// مسیر فایل: /routes/index.js
const router = require('express').Router();

router.use('/auth', require('./auth'));
router.use('/users', require('./user'));
router.use('/posts', require('./post'));
router.use('/comments', require('./comment'));
router.use('/notifications', require('./notification'));
// مسیرهای جدید (از طریق index.js اصلی اضافه شده‌اند، اینجا نیاز نیست ولی برای سازگاری می‌آوریم)
router.use('/stories', require('./story'));
router.use('/messages', require('./message'));
router.use('/reels', require('./reel'));

module.exports = router;
