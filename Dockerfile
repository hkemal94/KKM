# KKM'nin GitHub'dan kendiliğinden yayına çıkması için (12 Kasım, Kemal:
# "Kalıcı: GitHub'dan otomatik yayın"). Google Cloud her birleştirmede bu
# tarifle uygulamayı kurar ve Cloud Run'daki KKM'yi yeniler. Anahtarlar
# (GEMINI_API_KEY) buraya yazılmaz; Cloud Run'daki ayarlarda kalır.

# 1. Kurulum: bağımlılıklar ve derleme (git sürüm damgası için tam imaj)
FROM node:22 AS kurulum
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# 2. Çalışan uygulama: yalnız derlenmiş dosyalar
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=kurulum /app/package.json ./
COPY --from=kurulum /app/node_modules ./node_modules
COPY --from=kurulum /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/server.cjs"]
