// مسیر فایل: /routes/reel.js
const router = require('express').Router();
const { requireAuth } = require('../controllers/authController');
const asyncHandler = require('../utils/asyncHandler');
const { uploadReelVideo } = require('../utils/fileUpload');
const ctrl = require('../controllers/reelController');

router.post('/', requireAuth, uploadReelVideo, asyncHandler(ctrl.createReel));
router.get('/feed', requireAuth, asyncHandler(ctrl.getReelFeed));
router.get('/:reelId', requireAuth, asyncHandler(ctrl.getReel));
router.post('/:reelId/like', requireAuth, asyncHandler(ctrl.likeReel));
router.delete('/:reelId', requireAuth, asyncHandler(ctrl.deleteReel));

module.exports = router;
