FROM node:22-alpine AS build
RUN apk upgrade --no-cache && apk add --no-cache libc6-compat openssl && corepack enable && corepack prepare pnpm@11.25.0 --activate
WORKDIR /app
# Non-secret placeholders are scoped to build/init, never the app runtime image.
ENV DATABASE_URL=postgresql://school84:school84@localhost:5432/school84 \
    BETTER_AUTH_SECRET=local-build-secret-only \
    BETTER_AUTH_URL=http://localhost:3001 \
    GITHUB_CLIENT_ID=local-build \
    GITHUB_CLIENT_SECRET=local-build \
    RESEND_API_KEY=re_local_build \
    EMAIL_FROM="School84 <noreply@localhost>" \
    ARCJET_KEY=local-build \
    AWS_ACCESS_KEY_ID=local-build \
    AWS_SECRET_ACCESS_KEY=local-build \
    AWS_ENDPOINT_URL_S3=http://localhost:9000 \
    AWS_REGION=us-east-1 \
    PYTHON_RUNNER_TOKEN=local-build-token-with-at-least-24-chars \
    NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES=school84-local \
    NEXT_TELEMETRY_DISABLED=1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
RUN pnpm install --frozen-lockfile
# Public config must match runtime; storage credentials are never build arguments.
ARG BUILD_STORAGE_ENDPOINT=http://localhost:9000
ARG BUILD_PUBLIC_IMAGES_BUCKET=school84-local
ENV AWS_ENDPOINT_URL_S3=${BUILD_STORAGE_ENDPOINT} NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES=${BUILD_PUBLIC_IMAGES_BUCKET}
COPY . .
RUN pnpm exec prisma generate && pnpm build

# Explicit operator-only initial schema setup; app startup never mutates schema.
FROM build AS schema-init
CMD ["pnpm", "exec", "prisma", "db", "push"]

FROM node:22-alpine AS app
RUN apk upgrade --no-cache && apk add --no-cache libc6-compat openssl \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn* \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    && addgroup -S -g 1001 nextjs && adduser -S -u 1001 -G nextjs nextjs
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nextjs /app/public ./public
USER 1001:1001
EXPOSE 3000
CMD ["node", "server.js"]
