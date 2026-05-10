// مسیر فایل: /models/RefreshToken.js
// توضیح: مدل Mongoose برای ذخیره refresh token‌های کاربران.
// هر توکن یک رشته تصادفی یکتا است و به یک کاربر نسبت داده می‌شود.
// این توکن‌ها برای دریافت access token جدید بدون نیاز به ورود مجدد استفاده می‌شوند.
//
// [v1.0.0] ایجاد مدل برای پشتیبانی از Refresh Token

const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// ایندکس خودکار TTL برای حذف اسناد منقضی‌شده
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
