// مسیر فایل: /routes/report.js
const router = require('express').Router();
const { requireAuth } = require('../controllers/authController');
const asyncHandler = require('../utils/asyncHandler');
const ctrl = require('../controllers/reportController');

router.post('/', requireAuth, asyncHandler(ctrl.createReport));
router.get('/mine', requireAuth, asyncHandler(ctrl.getMyReports));
router.get('/', requireAuth, asyncHandler(ctrl.getAllReports));
router.put('/:reportId', requireAuth, asyncHandler(ctrl.updateReportStatus));

module.exports = router;
