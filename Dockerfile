# مسیر فایل: /Dockerfile
# توضیح: فایل Docker برای ساخت ایمیج سرور Express (بک‌اند Instaclone)
# از یک ایمیج سبک Node.js استفاده می‌کند و وابستگی‌ها را نصب می‌کند.

FROM node:18-alpine

# نصب ffmpeg برای پردازش ویدئو (Reels, Stories)
RUN apk add --no-cache ffmpeg

WORKDIR /usr/src/app

# کپی فایل‌های وابستگی
COPY package*.json ./

# نصب فقط وابستگی‌های production
RUN npm ci --only=production

# کپی سورس کد
COPY . .

# ایجاد پوشه‌های آپلود
RUN mkdir -p public/uploads/{avatars,posts,thumbnails,stories/images,stories/videos,videos,chat} temp

# تنظیم متغیر محیطی
ENV NODE_ENV=production

# تغییر مالکیت فایل‌ها به کاربر node (اجرا با کاربر کم‌امتیاز)
RUN chown -R node:node /usr/src/app
USER node

EXPOSE 5000

CMD ["node", "index.js"]
