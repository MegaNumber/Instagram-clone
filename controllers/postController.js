// ==========================================
// بخش اول: وارد کردن کتابخانه‌ها و ماژول‌های مورد نیاز
// ==========================================

// حذف شده: const cloudinary = require('cloudinary').v2;
// دیگر نیازی به کلودینری نداریم، عکس‌ها را روی سرور خودمان ذخیره می‌کنیم

const linkify = require('linkifyjs');
// حذف شده: const axios = require('axios');
// دیگر نیازی به بررسی محتوای نامناسب با سرویس خارجی نداریم

// افزونه هشتگ‌یاب را به لینکیفای اضافه می‌کنیم
// این به ما کمک می‌کند هشتگ‌های داخل متن کپشن را پیدا کنیم
require('linkifyjs/plugins/hashtag')(linkify);

const Post = require('../models/Post');
const PostVote = require('../models/PostVote');
const Following = require('../models/Following');
const Followers = require('../models/Followers');
const Notification = require('../models/Notification');
const socketHandler = require('../handlers/socketHandler');
const fs = require('fs');
const ObjectId = require('mongoose').Types.ObjectId;

const {
  retrieveComments,
  // حذف شده: formatCloudinaryUrl,
  // دیگر نیازی به تغییر اندازه عکس با کلودینری نداریم
  populatePostsPipeline,
} = require('../utils/controllerUtils');
const filters = require('../utils/filters');

// ==========================================
// تابع کمکی: ساختن نسخه بندانگشتی (Thumbnail) از مسیر محلی عکس
// ==========================================
// قبلاً کلودینری این کار را با فرمت کردن آدرس انجام می‌داد.
// حالا ما یک تابع ساده می‌نویسیم که همان مسیر اصلی را برمی‌گرداند.
// اگر در آینده خواستی عکس‌های کوچک‌تر بسازی، می‌توانی از کتابخانه‌ای مثل sharp استفاده کنی
function formatLocalThumbnailUrl(imagePath) {
  // فعلاً همان مسیر اصلی را به عنوان بندانگشتی برمی‌گردانیم
  // در نسخه‌های بعدی می‌توان اینجا عکس را کوچک کرد
  return imagePath;
}

// ==========================================
// تابع: ساخت پست جدید (Create Post)
// ==========================================
module.exports.createPost = async (req, res, next) => {
  // دریافت کاربر جاری که از میدل‌ور احراز هویت عبور کرده است
  const user = res.locals.user;
  
  // دریافت کپشن (متن پست) و نام فیلتر از بدنه درخواست
  const { caption, filter: filterName } = req.body;
  let post = undefined;
  
  // پیدا کردن شیء فیلتر از لیست فیلترهای موجود
  // فیلترها افکت‌های بصری مثل سیاه و سفید یا قهوه‌ای هستند که روی عکس اعمال می‌شوند
  const filterObject = filters.find((filter) => filter.name === filterName);
  
  // استخراج هشتگ‌ها از متن کپشن با استفاده از کتابخانه لینکیفای
  const hashtags = [];
  linkify.find(caption).forEach((result) => {
    // اگر نوع نتیجه از نوع هشتگ باشد
    if (result.type === 'hashtag') {
      // علامت # را از ابتدای هشتگ حذف می‌کنیم و فقط متن خالص را ذخیره می‌کنیم
      // مثال: #سلام -> سلام
      hashtags.push(result.value.substring(1));
    }
  });

  // ==========================================
  // تغییر اصلی: بررسی وجود فایل و استفاده از مسیر محلی
  // ==========================================
  
  // بررسی می‌کنیم که آیا کاربر اصلاً عکسی آپلود کرده است یا نه
  // req.file توسط میدل‌ور مالتر (که در فایل مسیرها تنظیم کردیم) ایجاد می‌شود
  if (!req.file) {
    return res
      .status(400)
      .send({ error: 'لطفاً یک تصویر برای پست انتخاب کنید.' });
  }

  // ==========================================
  // حذف کامل بخش آپلود به کلودینری
  // ==========================================
  // قبلاً اینجا تنظیمات کلودینری انجام می‌شد و عکس در فضای ابری آپلود می‌گردید
  // cloudinary.config({ ... });
  // const response = await cloudinary.uploader.upload(req.file.path);
  
  // حالا مسیر فایل ذخیره‌شده روی سرور خودمان را می‌سازیم
  // req.file.filename نام فایلی است که مالتر با فرمول یکتای ما ساخته است
  // مثال نام فایل: post-1700000000000-123456789.jpg
  const imageUrl = '/uploads/' + req.file.filename;

  // ==========================================
  // حذف بررسی محتوای نامناسب با ModerateContent
  // ==========================================
  // قبلاً اینجا با axios به سرویس ModerateContent درخواست می‌دادیم
  // و بررسی می‌کردیم که عکس محتوای نامناسب نداشته باشد
  // برای سادگی یادگیری، این بخش را موقتاً حذف می‌کنیم
  
  try {
    // ==========================================
    // ساخت بندانگشتی (نسخه کوچک عکس) از مسیر محلی
    // ==========================================
    // قبلاً: const thumbnailUrl = formatCloudinaryUrl(response.secure_url, ...);
    // حالا از تابع ساده خودمان استفاده می‌کنیم
    const thumbnailUrl = formatLocalThumbnailUrl(imageUrl);
    
    // ==========================================
    // حذف دستور پاک کردن فایل موقت
    // ==========================================
    // قبلاً: fs.unlinkSync(req.file.path);
    // این دستور فایل موقت را بعد از آپلود به کلودینری پاک می‌کرد
    // حالا چون فایل را برای همیشه روی سرور نگه می‌داریم، نباید پاکش کنیم!
    // این خط کاملاً حذف شده است
    
    // ==========================================
    // ساخت نمونه جدید از مدل Post (پست)
    // ==========================================
    post = new Post({
      image: imageUrl,              // مسیر عکس اصلی روی سرور خودمان
      thumbnail: thumbnailUrl,       // مسیر نسخه بندانگشتی (فعلاً همان مسیر اصلی)
      filter: filterObject ? filterObject.filter : '', // ذخیره نام فیلتر در صورت وجود
      caption,                       // متن کپشن نوشته شده توسط کاربر
      author: user._id,             // شناسه کاربری که پست را ساخته است
      hashtags,                     // آرایه‌ای از هشتگ‌های استخراج شده
    });
    
    // ==========================================
    // ساخت رکورد رأی (لایک) برای پست جدید
    // ==========================================
    // هر پست جدید یک سند PostVote مخصوص به خود دارد
    // که آرایه‌ای از رأی‌ها (لایک‌ها) را نگه می‌دارد
    const postVote = new PostVote({
      post: post._id,               // ارجاع به شناسه پست
    });
    
    // ذخیره هم‌زمان پست و رأی‌های آن در دیتابیس
    await post.save();
    await postVote.save();
    
    // ارسال پاسخ موفقیت به کاربر
    // اطلاعات پست جدید را همراه با جزئیات کاربر و آرایه‌های خالی برای نظرات و رأی‌ها برمی‌گردانیم
    res.status(201).send({
      ...post.toObject(),           // تبدیل سند مونگوس به یک شیء ساده جاوااسکریپت
      postVotes: [],                // پست جدید هنوز رأیی ندارد
      comments: [],                 // پست جدید هنوز نظری ندارد
      author: { 
        avatar: user.avatar, 
        username: user.username 
      },
    });
  } catch (err) {
    // اگر در فرآیند ذخیره‌سازی خطایی رخ داد، آن را به میدل‌ور مدیریت خطا می‌فرستیم
    next(err);
  }

  // ==========================================
  // بخش ارسال نوتیفیکیشن به دنبال‌کنندگان (بدون تغییر)
  // ==========================================
  try {
    // پیدا کردن لیست دنبال‌کنندگان کاربر
    const followersDocument = await Followers.find({ user: user._id });
    // followersDocument یک آرایه است، اولین عنصر را برمی‌داریم
    const followers = followersDocument[0].followers;
    
    // ساختن یک شیء از پست برای ارسال از طریق سوکت
    const postObject = {
      ...post.toObject(),
      author: { 
        username: user.username, 
        avatar: user.avatar 
      },
      commentData: { 
        commentCount: 0, 
        comments: [] 
      },
      postVotes: [],
    };

    // ارسال پست جدید به تمام دنبال‌کنندگان از طریق وب‌سوکت
    // این کار باعث می‌شود پست به صورت زنده در فید دنبال‌کنندگان نمایش داده شود
    followers.forEach((follower) => {
      socketHandler.sendPost(
        req,
        postObject,                 // اطلاعات کامل پست
        follower.user               // شناسه کاربر دنبال‌کننده
      );
    });
  } catch (err) {
    // خطا در ارسال نوتیفیکیشن نباید فرآیند ساخت پست را مختل کند
    // فقط آن را در کنسول ثبت می‌کنیم
    console.log('خطا در ارسال نوتیفیکیشن پست جدید:', err);
  }
};

// ==========================================
// تابع: حذف پست (Delete Post)
// ==========================================
module.exports.deletePost = async (req, res, next) => {
  // دریافت شناسه پست از پارامترهای مسیر
  const { postId } = req.params;
  const user = res.locals.user;

  try {
    // اول بررسی می‌کنیم که پست وجود دارد و متعلق به همین کاربر است
    const post = await Post.findOne({ _id: postId, author: user._id });
    if (!post) {
      return res.status(404).send({
        error: 'پستی با این شناسه برای این کاربر پیدا نشد.',
      });
    }
    
    // ==========================================
    // نکته مهم: پاک کردن فایل عکس از روی سرور
    // ==========================================
    // وقتی پست حذف می‌شود، باید فایل عکس آن را هم از پوشه uploads پاک کنیم
    // مسیر فایل را از آدرس ذخیره‌شده استخراج می‌کنیم
    // مثال: /uploads/post-123.jpg -> public/uploads/post-123.jpg
    try {
      const filePath = 'public' + post.image; // ساخت مسیر کامل فایل
      // بررسی می‌کنیم که فایل وجود داشته باشد
      if (fs.existsSync(filePath)) {
        // فایل را از روی دیسک پاک می‌کنیم
        fs.unlinkSync(filePath);
        console.log(`فایل ${filePath} با موفقیت پاک شد.`);
      }
    } catch (fileErr) {
      // اگر فایل پاک نشد، فقط در کنسول ثبت می‌کنیم و ادامه می‌دهیم
      console.log('خطا در پاک کردن فایل عکس:', fileErr.message);
    }
    
    // حذف پست از دیتابیس
    // متد deleteOne با استفاده از هوک‌های پیش‌فرض مونگوس،
    // تمام موارد مرتبط مثل نظرات را هم پاک می‌کند
    const postDelete = await Post.deleteOne({
      _id: postId,
    });
    
    if (!postDelete.deletedCount) {
      return res.status(500).send({ error: 'حذف پست با مشکل مواجه شد.' });
    }
    
    // ارسال پاسخ موفقیت (کد 204 یعنی محتوایی برای بازگشت نیست)
    res.status(204).send();
  } catch (err) {
    next(err);
  }

  // ==========================================
  // اطلاع‌رسانی حذف پست به دنبال‌کنندگان (بدون تغییر)
  // ==========================================
  try {
    const followersDocument = await Followers.find({ user: user._id });
    const followers = followersDocument[0].followers;
    
    // ارسال رویداد حذف به خود کاربر
    socketHandler.deletePost(req, postId, user._id);
    
    // ارسال رویداد حذف به تمام دنبال‌کنندگان
    followers.forEach((follower) =>
      socketHandler.deletePost(req, postId, follower.user)
    );
  } catch (err) {
    console.log('خطا در ارسال نوتیفیکیشن حذف پست:', err);
  }
};

// ==========================================
// تابع: دریافت یک پست خاص (Retrieve Post)
// این تابع بدون تغییر باقی می‌ماند
// ==========================================
module.exports.retrievePost = async (req, res, next) => {
  const { postId } = req.params;
  try {
    // استفاده از پایپ‌لاین تجمیع (Aggregation Pipeline) مونگوس
    // برای دریافت پست به همراه رأی‌ها و اطلاعات نویسنده
    const post = await Post.aggregate([
      // مرحله ۱: فقط پستی با شناسه مورد نظر را پیدا کن
      { $match: { _id: ObjectId(postId) } },
      // مرحله ۲: اطلاعات رأی‌های این پست را از مجموعه postvotes دریافت کن
      {
        $lookup: {
          from: 'postvotes',          // نام مجموعه در دیتابیس
          localField: '_id',           // فیلد موجود در سند پست
          foreignField: 'post',        // فیلد معادل در سند رأی
          as: 'postVotes',            // نام فیلد جدید برای ذخیره نتایج
        },
      },
      // مرحله ۳: اطلاعات نویسنده پست را از مجموعه users دریافت کن
      {
        $lookup: {
          from: 'users',
          localField: 'author',
          foreignField: '_id',
          as: 'author',
        },
      },
      // مرحله ۴: آرایه author را به یک شیء تبدیل کن (چون فقط یک نویسنده داریم)
      { $unwind: '$author' },
      // مرحله ۵: آرایه postVotes را هم به یک شیء تبدیل کن
      { $unwind: '$postVotes' },
      // مرحله ۶: فیلدهای حساس کاربر را از خروجی حذف کن
      {
        $unset: [
          'author.password',
          'author.email',
          'author.private',
          'author.bio',
          'author.githubId',
        ],
      },
      // مرحله ۷: فقط آرایه votes از سند postVotes را نگه دار
      {
        $addFields: { postVotes: '$postVotes.votes' },
      },
    ]);
    
    if (post.length === 0) {
      return res
        .status(404)
        .send({ error: 'پستی با این شناسه پیدا نشد.' });
    }
    
    // دریافت نظرات مرتبط با این پست
    const comments = await retrieveComments(postId, 0);

    // ارسال اطلاعات کامل پست به همراه نظرات
    return res.send({ ...post[0], commentData: comments });
  } catch (err) {
    next(err);
  }
};

// ==========================================
// تابع: رأی دادن به پست (Vote Post - لایک/دیسلایک)
// این تابع بدون تغییر باقی می‌ماند
// ==========================================
module.exports.votePost = async (req, res, next) => {
  const { postId } = req.params;
  const user = res.locals.user;

  try {
    // تلاش برای اضافه کردن رأی کاربر به آرایه votes
    // شرط $ne: user._id یعنی اگر قبلاً رأی نداده باشد
    const postLikeUpdate = await PostVote.updateOne(
      { post: postId, 'votes.author': { $ne: user._id } },
      {
        $push: { votes: { author: user._id } },
      }
    );
    
    if (!postLikeUpdate.nModified) {
      if (!postLikeUpdate.ok) {
        return res.status(500).send({ error: 'خطا در ثبت رأی.' });
      }
      
      // اگر هیچ سندی تغییر نکرد، یعنی کاربر قبلاً رأی داده بوده
      // پس باید رأی او را حذف کنیم (دیسلایک)
      const postDislikeUpdate = await PostVote.updateOne(
        { post: postId },
        { $pull: { votes: { author: user._id } } }
      );

      if (!postDislikeUpdate.nModified) {
        return res.status(500).send({ error: 'خطا در حذف رأی.' });
      }
    } else {
      // ==========================================
      // بخش ارسال نوتیفیکیشن لایک (با تغییر جزئی)
      // ==========================================
      const post = await Post.findById(postId);
      
      // فقط اگر لایک‌کننده خود نویسنده پست نباشد، نوتیفیکیشن بفرست
      if (String(post.author) !== String(user._id)) {
        // ==========================================
        // تغییر: استفاده از مسیر محلی برای بندانگشتی نوتیفیکیشن
        // ==========================================
        // قبلاً: const image = formatCloudinaryUrl(post.image, {...}, true);
        // حالا از تابع ساده خودمان استفاده می‌کنیم
        const image = formatLocalThumbnailUrl(post.image);
        
        const notification = new Notification({
          sender: user._id,            // فرستنده نوتیفیکیشن (کسی که لایک کرده)
          receiver: post.author,       // گیرنده نوتیفیکیشن (نویسنده پست)
          notificationType: 'like',    // نوع نوتیفیکیشن
          date: Date.now(),           // زمان ایجاد
          notificationData: {
            postId,
            image,                     // مسیر بندانگشتی عکس
            filter: post.filter,       // فیلتر اعمال شده روی عکس
          },
        });

        await notification.save();
        
        // ارسال نوتیفیکیشن به صورت زنده از طریق وب‌سوکت
        socketHandler.sendNotification(req, {
          ...notification.toObject(),
          sender: {
            _id: user._id,
            username: user.username,
            avatar: user.avatar,
          },
        });
      }
    }
    return res.send({ success: true });
  } catch (err) {
    next(err);
  }
};

// ==========================================
// تابع: دریافت فید پست‌ها (Retrieve Post Feed)
// این تابع بدون تغییر باقی می‌ماند
// ==========================================
module.exports.retrievePostFeed = async (req, res, next) => {
  const user = res.locals.user;
  const { offset } = req.params;

  try {
    const followingDocument = await Following.findOne({ user: user._id });
    if (!followingDocument) {
      return res.status(404).send({ error: 'هیچ پستی برای نمایش پیدا نشد.' });
    }
    const following = followingDocument.following.map(
      (following) => following.user
    );

    const unwantedUserFields = [
      'author.password',
      'author.private',
      'author.confirmed',
      'author.bookmarks',
      'author.email',
      'author.website',
      'author.bio',
      'author.githubId',
    ];

    const posts = await Post.aggregate([
      {
        $match: {
          $or: [{ author: { $in: following } }, { author: ObjectId(user._id) }],
        },
      },
      { $sort: { date: -1 } },
      { $skip: Number(offset) },
      { $limit: 5 },
      {
        $lookup: {
          from: 'users',
          localField: 'author',
          foreignField: '_id',
          as: 'author',
        },
      },
      {
        $lookup: {
          from: 'postvotes',
          localField: '_id',
          foreignField: 'post',
          as: 'postVotes',
        },
      },
      {
        $lookup: {
          from: 'comments',
          let: { postId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ['$post', '$$postId'],
                },
              },
            },
            { $sort: { date: -1 } },
            { $limit: 3 },
            {
              $lookup: {
                from: 'users',
                localField: 'author',
                foreignField: '_id',
                as: 'author',
              },
            },
            {
              $lookup: {
                from: 'commentvotes',
                localField: '_id',
                foreignField: 'comment',
                as: 'commentVotes',
              },
            },
            {
              $unwind: '$author',
            },
            {
              $unwind: {
                path: '$commentVotes',
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $unset: unwantedUserFields,
            },
            {
              $addFields: {
                commentVotes: '$commentVotes.votes',
              },
            },
          ],
          as: 'comments',
        },
      },
      {
        $lookup: {
          from: 'comments',
          let: { postId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ['$post', '$$postId'],
                },
              },
            },
            {
              $group: { _id: null, count: { $sum: 1 } },
            },
            {
              $project: {
                _id: false,
              },
            },
          ],
          as: 'commentCount',
        },
      },
      {
        $unwind: {
          path: '$commentCount',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $unwind: '$postVotes',
      },
      {
        $unwind: '$author',
      },
      {
        $addFields: {
          postVotes: '$postVotes.votes',
          commentData: {
            comments: '$comments',
            commentCount: '$commentCount.count',
          },
        },
      },
      {
        $unset: [...unwantedUserFields, 'comments', 'commentCount'],
      },
    ]);
    return res.send(posts);
  } catch (err) {
    next(err);
  }
};

// ==========================================
// تابع: دریافت پست‌های پیشنهادی (Retrieve Suggested Posts)
// این تابع بدون تغییر باقی می‌ماند
// ==========================================
module.exports.retrieveSuggestedPosts = async (req, res, next) => {
  const { offset = 0 } = req.params;

  try {
    const posts = await Post.aggregate([
      {
        $sort: { date: -1 },
      },
      {
        $skip: Number(offset),
      },
      {
        $limit: 20,
      },
      {
        $sample: { size: 20 },
      },
      ...populatePostsPipeline,
    ]);
    return res.send(posts);
  } catch (err) {
    next(err);
  }
};

// ==========================================
// تابع: دریافت پست‌های یک هشتگ خاص (Retrieve Hashtag Posts)
// این تابع بدون تغییر باقی می‌ماند
// ==========================================
module.exports.retrieveHashtagPosts = async (req, res, next) => {
  const { hashtag, offset } = req.params;

  try {
    const posts = await Post.aggregate([
      {
        $facet: {
          posts: [
            {
              $match: { hashtags: hashtag },
            },
            {
              $skip: Number(offset),
            },
            {
              $limit: 20,
            },
            ...populatePostsPipeline,
          ],
          postCount: [
            {
              $match: { hashtags: hashtag },
            },
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
              },
            },
          ],
        },
      },
      {
        $unwind: '$postCount',
      },
      {
        $addFields: {
          postCount: '$postCount.count',
        },
      },
    ]);

    return res.send(posts[0]);
  } catch (err) {
    next(err);
  }
};
