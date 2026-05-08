// مسیر فایل: /routes/story.js
const router = require('express').Router();
const { requireAuth } = require('../controllers/authController');
const asyncHandler = require('../utils/asyncHandler');
const { uploadStoryMedia } = require('../utils/fileUpload');
const ctrl = require('../controllers/storyController');

router.post('/', requireAuth, uploadStoryMedia, asyncHandler(ctrl.createStory));
router.get('/feed', requireAuth, asyncHandler(ctrl.getStoryFeed));
router.get('/user/:userId', requireAuth, asyncHandler(ctrl.getUserStories));
router.post('/:storyId/view', requireAuth, asyncHandler(ctrl.viewStory));
router.post('/:storyId/like', requireAuth, asyncHandler(ctrl.likeStory));
router.delete('/:storyId', requireAuth, asyncHandler(ctrl.deleteStory));

module.exports = router;
