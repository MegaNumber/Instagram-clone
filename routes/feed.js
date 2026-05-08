// مسیر فایل: /routes/feed.js
// توضیح: مسیرهای فید هوشمند با رتبه‌بندی الگوریتمی.

const router = require('express').Router();
const { requireAuth } = require('../controllers/authController');
const asyncHandler = require('../utils/asyncHandler');
const {
  getSmartFeed,
  getSmartExplore,
  getSuggestedUsersSmart,
} = require('../controllers/feedController');

router.get('/', requireAuth, asyncHandler(getSmartFeed));
router.get('/explore', requireAuth, asyncHandler(getSmartExplore));
router.get('/suggestions', requireAuth, asyncHandler(getSuggestedUsersSmart));

module.exports = router;
