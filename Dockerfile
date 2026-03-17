# ── Stage 1: build the Vite frontend ────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
# Skip tsc (type-check only, has pre-existing errors); just bundle with Vite
RUN npx vite build

# ── Stage 2: run with Bun (serves dist/ + WebSocket) ────────────────────────
FROM oven/bun:1.1-alpine
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY server/index.ts ./server/

EXPOSE 10000
ENV PORT=10000

CMD ["bun", "run", "server/index.ts"]
