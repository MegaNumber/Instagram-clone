// مسیر فایل: /utils/filters.js
// توضیح: ماژول تعریف فیلترهای تصویر. این فایل شامل آرایه‌ای از فیلترهای
// سبک اینستاگرام است که هرکدام یک نام و یک رشته CSS filter برای اعمال
// روی تصویر دارند. می‌توان از این ماژول برای نمایش لیست فیلترها در فرانت‌اند
// و ذخیره‌سازی فیلتر انتخاب‌شده در دیتابیس استفاده کرد.

// ============================================================
// بخش ۱: تعریف فیلترهای موجود
// ============================================================
// هر فیلتر یک شیء با دو کلید است:
//   name:   نام قابل نمایش فیلتر (به انگلیسی، مطابق با نام‌های معروف اینستاگرام)
//   filter: رشته CSS filter که مستقیماً روی تصویر اعمال می‌شود
const filters = [
  {
    name: 'Normal',
    filter: 'none',
  },
  {
    name: 'Clarendon',
    filter: 'saturate(2)',
  },
  {
    name: 'Gingham',
    filter: 'contrast(0.7) saturate(1.5)',
  },
  {
    name: 'Moon',
    filter: 'grayscale(1)',
  },
  {
    name: 'Lark',
    filter: 'saturate(1.6) hue-rotate(15deg)',
  },
  {
    name: 'Reyes',
    filter: 'contrast(0.7)',
  },
  {
    name: 'Juno',
    filter: 'hue-rotate(-20deg)',
  },
  {
    name: 'Slumber',
    filter: 'saturate(0.8) brightness(1.1)',
  },
  {
    name: 'Crema',
    filter: 'contrast(0.9) brightness(1.1)',
  },
  {
    name: 'Ludwig',
    filter: 'contrast(1.1) brightness(0.9)',
  },
  {
    name: 'Aden',
    filter: 'hue-rotate(-15deg) saturate(0.8)',
  },
  {
    name: 'Perpetua',
    filter: 'contrast(0.9) saturate(0.8) brightness(1.0)',
  },
];

// ============================================================
// بخش ۲: توابع کمکی برای مدیریت فیلترها
// ============================================================

/**
 * @function getFilterByName
 * @description یافتن یک فیلتر بر اساس نام آن (غیرحساس به بزرگی و کوچکی حروف)
 * @param {string} name - نام فیلتر مورد جستجو
 * @returns {object|undefined} شیء فیلتر در صورت یافتن، در غیر این صورت undefined
 */
const getFilterByName = (name) => {
  if (!name) return undefined;
  return filters.find(
    (f) => f.name.toLowerCase() === name.toLowerCase()
  );
};

/**
 * @function isValidFilter
 * @description بررسی معتبر بودن نام فیلتر
 * @param {string} name - نام فیلتر
 * @returns {boolean} true اگر فیلتر معتبر باشد
 */
const isValidFilter = (name) => {
  return !!getFilterByName(name);
};

// ============================================================
// بخش ۳: صادرات ماژول
// ============================================================
module.exports = filters;
module.exports.getFilterByName = getFilterByName;
module.exports.isValidFilter = isValidFilter;
