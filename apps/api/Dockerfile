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
# `pnpm --version` also fetches pnpm's native binary now, instead of on every container start.
RUN corepack install && pnpm --version && chmod -R a+rX /corepack

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
 && pnpm --filter api deploy --prod --legacy /out

# Production: compiled app (Prisma client included) + runtime dependencies only. Migrations run in CI, not here.
# ponytail: the Prisma CLI (~200 MB) still lands in node_modules as an optional peer of @prisma/client resolved in
# the lockfile; unused at runtime. Strip it (pnpmfile hook or bundling) if Lambda cold starts prove too slow.
# The same image runs anywhere; on Lambda, the Web Adapter extension turns invocations into HTTP requests to it.
FROM runtime AS prod
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:1.1.0 /lambda-adapter /opt/extensions/lambda-adapter
ENV NODE_ENV=production \
    PORT=3000 \
    AWS_LWA_READINESS_CHECK_PROTOCOL=tcp
COPY --from=build --chown=node:node /out /app
RUN mkdir -p /data/uploads && chown node:node /data/uploads
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
