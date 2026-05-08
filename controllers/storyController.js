// مسیر فایل: /controllers/storyController.js
const Story = require('../models/Story');
const asyncHandler = require('../utils/asyncHandler');
const { saveUploadedFile } = require('../utils/fileUpload');
const storageService = require('../utils/storage');

module.exports.createStory = asyncHandler(async (req, res) => {
  const user = res.locals.user;
  if (!req.file) return res.status(400).json({ success: false, error: 'فایلی برای استوری انتخاب نشده است.' });

  const folder = req.file.mimetype.startsWith('video/') ? 'uploads/stories/videos' : 'uploads/stories/images';
  const mediaUrl = await saveUploadedFile(req.file, folder, 'story');
  const story = await Story.create({
    author: user._id,
    mediaUrl,
    mediaType: req.file.mimetype.startsWith('video/') ? 'video' : 'image',
    caption: req.body.caption || '',
  });
  await story.populate('author', 'username avatar');
  res.status(201).json({ success: true, data: story });
});

module.exports.getStoryFeed = asyncHandler(async (req, res) => {
  const user = res.locals.user;
  const Following = require('../models/Following');
  const followingDoc = await Following.findOne({ user: user._id }).lean();
  const followingIds = followingDoc ? followingDoc.following.map(f => f.user) : [];
  if (!followingIds.includes(user._id.toString())) followingIds.push(user._id);

  const stories = await Story.find({ author: { $in: followingIds } })
    .populate('author', 'username avatar')
    .sort({ createdAt: -1 })
    .lean();

  const grouped = {};
  stories.forEach(story => {
    const authorId = story.author._id.toString();
    if (!grouped[authorId]) {
      grouped[authorId] = { user: story.author, stories: [], hasNewStory: false };
    }
    const isViewed = story.viewers?.some(v => v.user?.toString() === user._id.toString());
    grouped[authorId].stories.push(story);
    if (!isViewed) grouped[authorId].hasNewStory = true;
  });
  res.status(200).json({ success: true, data: Object.values(grouped) });
});

module.exports.viewStory = asyncHandler(async (req, res) => {
  const { storyId } = req.params;
  const user = res.locals.user;
  const story = await Story.findById(storyId);
  if (!story) return res.status(404).json({ success: false, error: 'استوری یافت نشد.' });
  if (!story.viewers.some(v => v.user.toString() === user._id.toString())) {
    story.viewers.push({ user: user._id });
    await story.save();
  }
  res.status(200).json({ success: true });
});

module.exports.likeStory = asyncHandler(async (req, res) => {
  const { storyId } = req.params;
  const user = res.locals.user;
  const story = await Story.findById(storyId);
  if (!story) return res.status(404).json({ success: false, error: 'استوری یافت نشد.' });
  const idx = story.likes.findIndex(l => l.user.toString() === user._id.toString());
  if (idx === -1) {
    story.likes.push({ user: user._id });
    await story.save();
    return res.status(200).json({ success: true, operation: 'like' });
  } else {
    story.likes.splice(idx, 1);
    await story.save();
    return res.status(200).json({ success: true, operation: 'unlike' });
  }
});

module.exports.deleteStory = asyncHandler(async (req, res) => {
  const { storyId } = req.params;
  const user = res.locals.user;
  const story = await Story.findOne({ _id: storyId, author: user._id });
  if (!story) return res.status(404).json({ success: false, error: 'استوری یافت نشد.' });
  await storageService.deleteFile(story.mediaUrl);
  await Story.deleteOne({ _id: storyId });
  res.status(200).json({ success: true, message: 'استوری حذف شد.' });
});

module.exports.getUserStories = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const stories = await Story.find({ author: userId }).populate('author', 'username avatar').sort({ createdAt: -1 }).lean();
  res.status(200).json({ success: true, data: stories });
});
