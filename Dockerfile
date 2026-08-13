# mega-bot — Roblox/Discord bot (discord.js v14 + node:sqlite)
FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV MEGA_BOT_DATA_DIR=/data

CMD ["node", "src/index.js"]
