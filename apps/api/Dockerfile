# syntax=docker/dockerfile:1.7

FROM node:25-bookworm-slim AS runtime-base

# Prisma detects the system TLS implementation through the OpenSSL binary.
# Keep the same runtime library available in both build and production stages.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

FROM runtime-base AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@9.14.2 --activate

WORKDIR /workspace

FROM base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json

RUN --mount=type=cache,id=senior-club-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile \
      --filter senior-club \
      --filter @senior-club/api...

FROM dependencies AS build

COPY prisma.config.ts ./prisma.config.ts
COPY prisma ./prisma
COPY apps/api ./apps/api

# Prisma CLI needs a syntactically valid URL while generating the client, but
# generation does not connect to this address. Runtime DATABASE_URL is injected
# by Railway and is never baked into the image.
RUN DATABASE_URL='postgresql://generate:generate@127.0.0.1:5432/senior_club?schema=public' \
    pnpm exec prisma generate
RUN pnpm --dir apps/api build
RUN pnpm --dir apps/api --filter @senior-club/api --prod deploy /workspace/deploy

FROM runtime-base AS runtime

ENV NODE_ENV=production
ENV PORT=4000

WORKDIR /app

COPY --from=build --chown=node:node /workspace/deploy/package.json ./package.json
COPY --from=build --chown=node:node /workspace/deploy/node_modules ./node_modules
# `pnpm deploy` follows the package ignore rules, so the generated Nest bundle
# must be copied explicitly after the production dependency tree.
COPY --from=build --chown=node:node /workspace/apps/api/dist ./dist

# Amazon's public RDS root bundle, so DATABASE_URL can use sslmode=verify-full
# instead of trusting whatever certificate the database presents.
ADD --chown=node:node https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /app/rds-ca.pem

USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=4s --start-period=20s --retries=3 \
  CMD ["node", "-e", "const port=process.env.PORT||'4000';fetch('http://127.0.0.1:'+port+'/healthz',{signal:AbortSignal.timeout(3000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["node", "dist/main.js"]
