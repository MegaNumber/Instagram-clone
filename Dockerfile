# مسیر فایل: /Dockerfile
# توضیح: فایل ساخت ایمیج Docker برای سرویس بک‌اند.
# [v2.0.0] اضافه کردن ENV PORT=5000 برای هماهنگی با docker-compose.yml و تعریف صریح پورت

FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./

# استفاده از npm install به جای npm ci برای حل مشکل lock file قدیمی
RUN npm install --omit=dev

COPY . .

RUN mkdir -p public/uploads/{avatars,posts,thumbnails,stories/images,stories/videos,videos,chat} temp

# تنظیم متغیر محیطی پورت (با docker-compose نیز قابل بازنویسی است)
ENV PORT=5000

ENV NODE_ENV=production

RUN chown -R node:node /usr/src/app
USER node

EXPOSE 5000

CMD ["node", "index.js"]
