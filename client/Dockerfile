FROM node:20-alpine AS builder

WORKDIR /app

# NEXT_PUBLIC_SERVER_URL はビルド時に静的に埋め込まれる。
# Cloud Run などのデプロイ環境では --build-arg で必ず渡すこと。
# 例: docker build --build-arg NEXT_PUBLIC_SERVER_URL=https://your-server.run.app .
ARG NEXT_PUBLIC_SERVER_URL
ENV NEXT_PUBLIC_SERVER_URL=${NEXT_PUBLIC_SERVER_URL}

# Keep the runtime COPY stable even when the repo has no public assets yet.
RUN mkdir -p public

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# ---

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
# ランタイムでも参照できるように引き継ぐ（Next.js の情報表示用）
ARG NEXT_PUBLIC_SERVER_URL
ENV NEXT_PUBLIC_SERVER_URL=${NEXT_PUBLIC_SERVER_URL}

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.js ./

EXPOSE 3000

CMD ["npm", "start"]
