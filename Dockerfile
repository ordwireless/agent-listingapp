FROM node:22-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Exact dependency versions from package-lock.json, so a redeploy of the same commit builds the same app.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Production mode: a missing APP_PASSWORD locks the app instead of leaving it open.
ENV NODE_ENV=production
ENV DATA_DIR=/data
RUN mkdir -p /data

EXPOSE 3000
CMD ["node", "server.js"]
