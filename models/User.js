// مسیر فایل: /models/User.js
// توضیح: مدل Mongoose برای کاربران. این فایل ساختار کامل کاربر، اعتبارسنجی‌ها،
// هوک‌های پیش‌ذخیره (هش رمز عبور، ایجاد اسناد دنبال‌کنندگی)، ایندکس‌های
// ترکیبی برای بهبود عملکرد، و متدهای کمکی برای مدیریت امنیت (مانند قفل
// حساب پس از تلاش‌های ناموفق ورود) را در بر می‌گیرد.
//
// تغییرات نسبت به نسخهٔ قبلی (v2.3.0):
// - جایگزینی bcrypt با bcryptjs (هماهنگ با authController)
// - افزودن فیلدهای loginAttempts و lockUntil برای جلوگیری از Brute‑Force
// - حذف خطایابی زائد در هوک دوم و استفاده از unique index
// - افزودن متدهای ایستا: findByCredentials, updateLoginAttempts
// - بهبود نظرات آموزشی

// ============================================================
// بخش ۱: ایمپورت ماژول‌های مورد نیاز
// ============================================================
const mongoose = require('mongoose');
const validator = require('validator'); // اعتبارسنجی ایمیل و URL
const bcrypt = require('bcryptjs');      // هش رمز عبور – Async خالص (جایگزین bcrypt)
const RequestError = require('../errorTypes/RequestError');

const Schema = mongoose.Schema;

// ============================================================
// بخش ۲: ثابت‌های پیکربندی
// ============================================================
const SALT_ROUNDS = 12;                // تعداد دورهای salt برای bcrypt
const MAX_LOGIN_ATTEMPTS = 5;         // حداکثر تلاش ناموفق قبل از قفل شدن
const LOCK_TIME = 2 * 60 * 60 * 1000; // مدت قفل شدن حساب (۲ ساعت)

// ============================================================
// بخش ۳: تعریف طرحواره کاربر
// ============================================================
const UserSchema = new Schema(
    {
        // ---------- مشخصات اصلی ----------
        email: {
            type: String,
            required: [true, 'آدرس ایمیل الزامی است.'],
            unique: true,
            lowercase: true,
            trim: true,
            validate: {
                validator: function (value) {
                    return validator.isEmail(value);
                },
                message: 'آدرس ایمیل واردشده معتبر نیست.',
            },
        },
        fullName: {
            type: String,
            required: [true, 'نام کامل الزامی است.'],
            trim: true,
            minlength: [2, 'نام کامل باید حداقل ۲ کاراکتر باشد.'],
            maxlength: [100, 'نام کامل نمی‌تواند بیشتر از ۱۰۰ کاراکتر باشد.'],
        },
        username: {
            type: String,
            required: [true, 'نام کاربری الزامی است.'],
            unique: true,
            lowercase: true,
            trim: true,
            minlength: [3, 'نام کاربری باید حداقل ۳ کاراکتر باشد.'],
            maxlength: [30, 'نام کاربری نمی‌تواند بیشتر از ۳۰ کاراکتر باشد.'],
            match: [
                /^[a-zA-Z0-9._]+$/,
                'نام کاربری فقط می‌تواند شامل حروف انگلیسی، اعداد، نقطه و زیرخط باشد.',
            ],
        },
        // ---------- امنیت ----------
        password: {
            type: String,
            required: [true, 'رمز عبور الزامی است.'],
            minlength: [8, 'رمز عبور باید حداقل ۸ کاراکتر باشد.'],
            select: false, // هرگز در کوئری‌های معمولی بازگردانده نشود
        },
        githubId: {
            type: Number,
            sparse: true,
            unique: true,
        },
        // ---------- پروفایل عمومی ----------
        avatar: {
            type: String,
            default: 'default-avatar.png',
        },
        bio: {
            type: String,
            maxlength: [150, 'بیوگرافی نمی‌تواند بیشتر از ۱۵۰ کاراکتر باشد.'],
            default: '',
        },
        website: {
            type: String,
            maxlength: [100, 'آدرس وب‌سایت نمی‌تواند بیشتر از ۱۰۰ کاراکتر باشد.'],
            validate: {
                validator: function (value) {
                    if (!value || value.length === 0) return true;
                    return validator.isURL(value, {
                        protocols: ['http', 'https'],
                        require_protocol: false,
                    });
                },
                message: 'لطفاً یک URL معتبر وارد کنید.',
            },
            default: '',
        },
        // ---------- وضعیت حساب ----------
        private: {
            type: Boolean,
            default: false,
        },
        confirmed: {
            type: Boolean,
            default: false,
        },
        bookmarks: [
            {
                post: {
                    type: Schema.Types.ObjectId,
                    ref: 'Post',
                },
            },
        ],
        // ---------- امنیت پیشرفته (Brute‑Force Protection) ----------
        loginAttempts: {
            type: Number,
            required: true,
            default: 0,
        },
        lockUntil: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,   // ایجاد خودکار createdAt و updatedAt
        versionKey: false,  // حذف فیلد __v
    }
);

// ============================================================
// بخش ۴: ایندکس‌های ترکیبی
// ============================================================
UserSchema.index({ email: 1, username: 1 });
UserSchema.index({ createdAt: -1 });

// ============================================================
// بخش ۵: هوک‌های Mongoose
// ============================================================

// هوک ۱: هش کردن رمز عبور
UserSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    try {
        this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
        next();
    } catch (error) {
        next(error);
    }
});

// هوک ۲: ایجاد اسناد Followers/Following برای کاربر جدید و باز کردن قفل در صورت منقضی شدن
UserSchema.pre('save', async function (next) {
    if (this.isNew) {
        try {
            // ایجاد خودکار اسناد دنبال‌کننده‌ها
            await mongoose.model('Followers').create({ user: this._id });
            await mongoose.model('Following').create({ user: this._id });
        } catch (err) {
            if (!err.statusCode) err.statusCode = 400;
            return next(err);
        }
        return next();
    }

    // اگر حساب قفل شده ولی زمان قفل گذشته، ریست کن
    if (this.lockUntil && this.lockUntil < Date.now()) {
        this.loginAttempts = 0;
        this.lockUntil = null;
    }
    next();
});

// ============================================================
// بخش ۶: متدهای نمونه
// ============================================================

/**
 * مقایسه رمز عبور وارد شده با رمز ذخیره شده
 */
UserSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

/**
 * بررسی اینکه آیا حساب در حال حاضر قفل است
 */
UserSchema.methods.isLocked = function () {
    return !!(this.lockUntil && this.lockUntil > Date.now());
};

// ============================================================
// بخش ۷: متدهای ایستا
// ============================================================

/**
 * یافتن کاربر با ایمیل یا نام کاربری برای ورود
 * @param {string} usernameOrEmail
 * @returns {Promise<User|null>}
 */
UserSchema.statics.findByCredentials = async function (usernameOrEmail) {
    return this.findOne({
        $or: [
            { email: usernameOrEmail.toLowerCase() },
            { username: usernameOrEmail.toLowerCase() },
        ],
    }).select('+password');
};

/**
 * بروزرسانی تعداد تلاش‌های ناموفق و در صورت نیاز قفل حساب
 * @param {ObjectId} userId
 */
UserSchema.statics.updateLoginAttempts = async function (userId, success) {
    const updates = success
        ? { loginAttempts: 0, lockUntil: null }
        : { $inc: { loginAttempts: 1 } };

    const user = await this.findByIdAndUpdate(userId, updates, { new: true });
    // اگر تعداد تلاش‌ها از حد گذشت و هنوز قفل نشده، قفل کن
    if (!success && user.loginAttempts >= MAX_LOGIN_ATTEMPTS && !user.lockUntil) {
        user.lockUntil = Date.now() + LOCK_TIME;
        await user.save();
    }
    return user;
};

// ============================================================
// بخش ۸: فیلدهای مجازی
// ============================================================
UserSchema.virtual('postCount', {
    ref: 'Post',
    localField: '_id',
    foreignField: 'author',
    count: true,
});

// ============================================================
// بخش ۹: تبدیل خروجی JSON
// ============================================================
UserSchema.set('toJSON', {
    transform: function (doc, ret) {
        delete ret.password;
        delete ret.loginAttempts;  // اطلاعات حساس نباید لو برود
        delete ret.lockUntil;
        return ret;
    },
});

// ============================================================
// بخش ۱۰: صادرات مدل
// ============================================================
const User = mongoose.model('User', UserSchema);
module.exports = User;
