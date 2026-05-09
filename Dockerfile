FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./

# استفاده از npm install به جای npm ci برای حل مشکل lock file قدیمی
RUN npm install --omit=dev

COPY . .

RUN mkdir -p public/uploads/{avatars,posts,thumbnails,stories/images,stories/videos,videos,chat} temp

ENV NODE_ENV=production

RUN chown -R node:node /usr/src/app
USER node

EXPOSE 5000

CMD ["node", "index.js"]
