// مسیر فایل: /models/User.js
// توضیح: مدل Mongoose برای کاربران. این فایل ساختار کاربر، قوانین اعتبارسنجی،
// هوک‌های پیش‌ذخیره برای هش کردن رمز عبور و ایجاد خودکار اسناد دنبال‌کنندگی را تعریف می‌کند.

// ============================================================
// بخش ۱: ایمپورت ماژول‌های مورد نیاز
// ============================================================
const mongoose = require('mongoose');
const validator = require('validator'); // کتابخانه اعتبارسنجی قدرتمند برای ایمیل و URL
const bcrypt = require('bcrypt');       // کتابخانه هش کردن رمزهای عبور با salt
const RequestError = require('../errorTypes/RequestError');

const Schema = mongoose.Schema;

// ============================================================
// بخش ۲: ثابت‌های پیکربندی (Configuration Constants)
// ============================================================
// این ثابت‌ها در بالای فایل تعریف می‌شوند تا مدیریت و تغییر آن‌ها آسان‌تر باشد.
const SALT_ROUNDS = 12; // تعداد دورهای salt بالاتر امنیت را افزایش می‌دهد اما کندتر است. ۱۲ مقدار استانداردی است.
const MAX_LOGIN_ATTEMPTS = 5; // برای قفل کردن حساب در آینده
const LOCK_TIME = 2 * 60 * 60 * 1000; // مدت زمان قفل: ۲ ساعت (فعلاً استفاده نشده اما آماده گسترش است)

// ============================================================
// بخش ۳: تعریف طرحواره کاربر (User Schema Definition)
// ============================================================
const UserSchema = new Schema(
    {
        // ---------- مشخصات اصلی کاربر ----------
        email: {
            type: String,
            required: [true, 'آدرس ایمیل الزامی است.'],
            unique: true,
            lowercase: true,
            trim: true,
            validate: {
                validator: function (value) {
                    // استفاده از کتابخانه validator برای اعتبارسنجی فرمت ایمیل
                    return validator.isEmail(value);
                },
                message: 'آدرس ایمیل واردشده معتبر نیست. یک ایمیل صحیح وارد کنید.',
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
            // اعتبارسنجی با regex: فقط حروف، اعداد، زیرخط و نقطه مجاز است
            match: [
                /^[a-zA-Z0-9._]+$/,
                'نام کاربری فقط می‌تواند شامل حروف انگلیسی، اعداد، نقطه و زیرخط باشد.',
            ],
        },
        // ---------- امنیت و احراز هویت ----------
        password: {
            type: String,
            required: [true, 'رمز عبور الزامی است.'],
            minlength: [8, 'رمز عبور باید حداقل ۸ کاراکتر باشد.'],
            // select: false باعث می‌شود در عملیات find عادی، رمز عبور بازگردانده نشود.
            // برای دریافت آن باید صریحاً از .select('+password') استفاده کنید.
            select: false,
        },
        // شناسه گیتهاب برای کاربرانی که از طریق OAuth ثبت‌نام کرده‌اند
        githubId: {
            type: Number,
            sparse: true, // ایندکس sparse به کاربرانی که این فیلد را ندارند اجازه ثبت می‌دهد
            unique: true,
        },
        // ---------- پروفایل عمومی ----------
        avatar: {
            type: String,
            default: 'default-avatar.png', // یک آواتار پیش‌فرض برای کاربران جدید
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
                    // اگر فیلد خالی بود، اعتبارسنجی را رد نکن
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
        // ---------- تنظیمات حریم خصوصی و وضعیت حساب ----------
        private: {
            type: Boolean,
            default: false,
        },
        confirmed: {
            type: Boolean,
            default: false,
        },
        // آرایه‌ای از پست‌های ذخیره‌شده (Bookmarks)
        bookmarks: [
            {
                post: {
                    type: Schema.Types.ObjectId,
                    ref: 'Post',
                },
            },
        ],
        // ---------- فیلدهای امنیتی پیشرفته ----------
        // تعداد دفعات تلاش ناموفق برای ورود (برای محافظت در برابر حملات brute-force)
        // loginAttempts: {
        //     type: Number,
        //     required: true,
        //     default: 0,
        // },
        // lockUntil: {
        //     type: Date,
        //     default: null,
        // },
    },
    {
        // فعال‌سازی خودکار فیلدهای createdAt و updatedAt
        timestamps: true,
        // غیرفعال کردن versionKey (__v) برای خلوت‌تر شدن اسناد
        versionKey: false,
        // تنظیم نام مجموعه (collection) به صورت صریح
        // collection: 'users',
    }
);

// ============================================================
// بخش ۴: تعریف ایندکس‌های مرکب برای بهبود عملکرد کوئری‌ها
// ============================================================
// ایندکس مرکب برای جستجوی سریع کاربران بر اساس ایمیل و نام کاربری
UserSchema.index({ email: 1, username: 1 });

// ایندکس برای مرتب‌سازی کاربران بر اساس تاریخ عضویت
UserSchema.index({ createdAt: -1 });

// ============================================================
// بخش ۵: هوک‌های Mongoose (Middlewares)
// ============================================================

// --- هوک ۱: هش کردن رمز عبور قبل از ذخیره ---
UserSchema.pre('save', async function (next) {
    // این هوک فقط زمانی اجرا می‌شود که رمز عبور تغییر کرده باشد.
    // استفاده از تابع isModified برای جلوگیری از هش دوباره رمز در هر به‌روزرسانی.
    if (!this.isModified('password')) return next();

    try {
        // تولید salt و هش کردن رمز عبور با استفاده از async/await و تعداد دورهای مشخص
        const salt = await bcrypt.genSalt(SALT_ROUNDS);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        // در صورت بروز خطا، آن را به میدلور مدیریت خطای Express منتقل می‌کنیم
        next(error);
    }
});

// --- هوک ۲: بررسی یکتایی و ایجاد اسناد دنبال‌کنندگی ---
UserSchema.pre('save', async function (next) {
    // این هوک فقط در زمان ایجاد یک سند جدید اجرا می‌شود.
    if (this.isNew) {
        try {
            // بررسی کنیم کاربری با ایمیل یا نام کاربری مشابه وجود نداشته باشد
            const existingUser = await mongoose.model('User').findOne({
                $or: [{ email: this.email }, { username: this.username }],
            });

            // اگر کاربری وجود داشت، یک خطای سفارشی ایجاد می‌کنیم
            if (existingUser) {
                // بررسی کنیم کدام فیلد تکراری است برای پیام خطای دقیق‌تر
                let duplicateField = '';
                if (existingUser.email === this.email) duplicateField = 'ایمیل';
                else if (existingUser.username === this.username) duplicateField = 'نام کاربری';

                return next(
                    new RequestError(
                        `کاربری با این ${duplicateField} قبلاً وجود دارد. ${duplicateField} دیگری انتخاب کنید.`,
                        400
                    )
                );
            }

            // ایجاد خودکار اسناد دنبال‌کننده‌ها و دنبال‌شونده‌ها برای کاربر جدید
            // این کار باعث می‌شود بدون نیاز به بررسی‌های بعدی، هر کاربر این اسناد را داشته باشد.
            await mongoose.model('Followers').create({ user: this._id });
            await mongoose.model('Following').create({ user: this._id });

            next();
        } catch (err) {
            // اگر خطا از نوع RequestError نبود، آن را به یک خطای ۴۰۰ تبدیل می‌کنیم
            if (!err.statusCode) err.statusCode = 400;
            next(err);
        }
    } else {
        // اگر کاربر در حال به‌روزرسانی است، این هوک را رد می‌کنیم
        next();
    }
});

// ============================================================
// بخش ۶: متدهای نمونه (Instance Methods)
// ============================================================

/**
 * @function comparePassword
 * @description مقایسه رمز عبور واردشده با رمز ذخیره‌شده
 * @param {string} candidatePassword - رمز عبوری که باید بررسی شود
 * @returns {Promise<boolean>} - نتیجه مقایسه
 */
UserSchema.methods.comparePassword = async function (candidatePassword) {
    // مقایسه امن رمز عبور با استفاده از bcrypt
    return await bcrypt.compare(candidatePassword, this.password);
};

// ============================================================
// بخش ۷: فیلدهای مجازی (Virtual Fields)
// ============================================================
// فیلدهای مجازی در MongoDB ذخیره نمی‌شوند اما به صورت پویا محاسبه می‌شوند.

// مثال: محاسبه تعداد کل پست‌های کاربر
UserSchema.virtual('postCount', {
    ref: 'Post',
    localField: '_id',
    foreignField: 'author',
    count: true, // فقط تعداد اسناد را برمی‌گرداند، نه خود اسناد را
});

// ============================================================
// بخش ۸: تنظیمات تبدیل به JSON و Object
// ============================================================
// با override کردن متد toJSON، می‌توانیم کنترل کنیم چه داده‌هایی هنگام ارسال به کلاینت بازگردانده شود.
UserSchema.set('toJSON', {
    transform: function (doc, ret, options) {
        // حذف فیلد رمز عبور از خروجی JSON (حتی اگر تصادفاً select شده باشد)
        delete ret.password;
        // حذف شناسه گیتهاب برای کاربران عادی
        // delete ret.githubId;
        return ret;
    },
});

// ============================================================
// بخش ۹: ایجاد و صادرات مدل
// ============================================================
const User = mongoose.model('User', UserSchema);

module.exports = User;
