# Build context: repository root (monorepo).
FROM node:24-slim AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Toolchain: pnpm pinned by the root package.json (Corepack).
FROM runtime AS base
ENV COREPACK_HOME=/corepack \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
COPY package.json ./
RUN corepack install && chmod -R a+rX /corepack

# Dev: the repo (including node_modules) is bind-mounted; runs as `node` (uid 1000) so files keep the host owner.
FROM base AS dev
RUN mkdir -p /data/uploads && chown -R node:node /data /corepack
USER node

FROM base AS build
# prisma.config.ts requires it even though `generate` never connects; this stage is not shipped.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
COPY . .
RUN pnpm install --frozen-lockfile --filter api... \
 && pnpm --filter api exec prisma generate \
 && pnpm --filter api build \
 && pnpm --filter api deploy --prod --legacy /out \
 && cd /out && ./node_modules/.bin/prisma generate

# Production: app + prod dependencies only (the Prisma CLI stays for `migrate deploy`).
FROM runtime AS prod
ENV NODE_ENV=production
COPY --from=build --chown=node:node /out /app
RUN mkdir -p /data/uploads && chown node:node /data/uploads
USER node
EXPOSE 3000
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/main.js"]
