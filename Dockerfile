FROM node:22-alpine AS app

RUN apk add --no-cache libc6-compat openssl && corepack enable
WORKDIR /app

ENV DATABASE_URL=postgresql://school84:school84@localhost:5432/school84
ENV BETTER_AUTH_SECRET=local-build-secret-only
ENV BETTER_AUTH_URL=http://localhost:3001
ENV GITHUB_CLIENT_ID=local-build
ENV GITHUB_CLIENT_SECRET=local-build
ENV RESEND_API_KEY=re_local_build
ENV EMAIL_FROM="School84 <noreply@localhost>"
ENV ARCJET_KEY=local-build
ENV AWS_ACCESS_KEY_ID=local-build
ENV AWS_SECRET_ACCESS_KEY=local-build
ENV AWS_ENDPOINT_URL_S3=http://localhost:9000
ENV AWS_REGION=us-east-1
ENV PYTHON_RUNNER_TOKEN=local-build-token-with-at-least-24-chars
ENV NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES=school84-local

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
RUN corepack prepare pnpm@10.8.0 --activate && pnpm install --frozen-lockfile

COPY . .
RUN pnpm exec prisma generate && pnpm build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "pnpm exec prisma db push && pnpm start --hostname 0.0.0.0"]
