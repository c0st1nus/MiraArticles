FROM oven/bun:1 AS base
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

COPY . .

ENV NODE_ENV=production
ENV PORT=3000

# Default: API + optional scheduler via SCHEDULER_ENABLED
CMD ["bun", "run", "src/index.ts"]
