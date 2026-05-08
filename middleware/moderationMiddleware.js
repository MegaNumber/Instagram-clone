// مسیر فایل: /middleware/moderationMiddleware.js
// توضیح: میدلور moderation که قبل از save شدن کامنت/پست اجرا می‌شود.

const { moderateText } = require('../services/moderationService');

/**
 * میدلور moderation برای متن (کپشن/کامنت)
 */
function moderateContent(field = 'message') {
    return async (req, res, next) => {
        const text = req.body[field];
        if (!text) return next();

        const result = await moderateText(text);

        if (result.flagged) {
            if (result.recommendation === 'reject') {
                return res.status(400).json({
                    success: false,
                    error: 'محتوای ارسالی不符合 استانداردهای انجمن است.',
                    reason: result.reason,
                });
            }
            if (result.recommendation === 'review') {
                // محتوا ذخیره می‌شود اما flag می‌خورد
                req.moderationFlag = result;
            }
        }
        next();
    };
}

module.exports = { moderateContent };
