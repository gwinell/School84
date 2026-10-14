# AGENTS.md

Notes for OpenCode sessions working in this repo.

## Tooling

- Package manager is **pnpm** (`pnpm-lock.yaml`, `pnpm-workspace.yaml`). Do not use npm/yarn.
- Scripts (`package.json`): `dev`, `build`, `start`, `lint`, `typecheck` (`tsc --noEmit`). There is **no** `test` or `format` script — invoke other binaries directly (e.g. `pnpm exec prisma generate`).
- `postinstall` runs `prisma generate` automatically, so `lib/generated/prisma/` is populated after a fresh `pnpm install`. Re-run it manually after any `prisma/schema.prisma` change.
- After edits, verify with `pnpm lint` then `pnpm typecheck`. No test suite exists; do not invent a runner without asking.
- Path alias: `@/*` -> repo root (`tsconfig.json`).
- `pnpm-workspace.yaml` allows only `@prisma/engines` and `prisma` to run install scripts; `sharp` and `unrs-resolver` are blocked.
- `README.md` is unedited `create-next-app` boilerplate that still mentions npm/yarn/bun. Ignore it; follow this file instead.

## Prisma (v7, new client generator)

- Schema: `prisma/schema.prisma`. Generator is `prisma-client` (not `prisma-client-js`) with `output = "../lib/generated/prisma"`.
- `lib/generated/prisma/` is **gitignored** — it is not in the repo. After clone and after any schema change run `pnpm exec prisma generate` or imports from `@/lib/prisma` will fail.
- Import path inside `lib/prisma.ts` is `from "./generated/prisma/client"` (note the nested `client`), not the v6 default. Constructed with `@prisma/adapter-pg` + `DATABASE_URL`; cached on `global` in dev.
- No `prisma/migrations/` folder. Sync schema to the DB with `pnpm exec prisma db push`; do not commit migration folders unless asked.
- `prisma.config.ts` imports `dotenv/config` so Prisma CLI reads `.env`. `datasource db` block only has `provider`; the URL comes from `prisma.config.ts`.
- Datasource is PostgreSQL (Neon in `.env`); `DATABASE_URL` must be a valid `postgresql://` URL with `?sslmode=require`.

## Environment / env validation

- All env vars are validated at build/runtime by `@t3-oss/env-nextjs` in `lib/env.ts` (zod). Missing/invalid vars fail fast — edit `lib/env.ts` when adding a var, do not read `process.env` directly in app code. (Update both `server` and the `experimental__runtimeEnv` map for client vars.)
- Required server vars (also listed in `.env.example`): `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `ARCJET_KEY`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, and `PYTHON_RUNNER_TOKEN`. `PYTHON_RUNNER_URL` defaults to localhost. Only the `NEXT_PUBLIC_*` (`NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES`) is exposed to the client.
- `.env` is gitignored but required locally. `.env.example` exists and is the canonical template — copy it to `.env` and fill in real values.

## Auth & middleware gotcha

- Auth is `better-auth` (`lib/auth.ts`): Prisma adapter, GitHub social provider, `emailOTP` plugin sending via Resend (`from: env.EMAIL_FROM`), plus the `admin` plugin (sets `User.role` — see below). Handler at `app/api/auth/[...all]/route.ts` — uses the new `toNextJsHandler(auth.handler)` pattern and wraps POST with Arcjet: `detectBot` plus a sliding-window rate limit on every POST, with tighter limits for OTP send (`/email-otp/send-verification-otp`) and OTP verify (`/sign-in/email-otp`), and `protectSignup` on `/api/auth/sign-up`. Client helpers in `lib/auth-client.ts`.
- **OTP-only auth — there are no passwords.** Only GitHub OAuth and email OTP (`emailAndPassword` is deliberately not enabled), so there is no password or password-reset flow to build.
- Two server-side gates exist — call the right one from the right surface:
  - `app/data/admin/require-admin.ts` (`requireAdmin()`): no session -> `redirect("/login")`; session but `role !== "admin"` -> `redirect("/not-admin")`.
  - `app/data/user/require-user.ts` (`requireUser()`): no session -> `redirect("/login")`; any signed-in user passes. Use this for learner-facing pages that should not be admin-gated.
- **Middleware lives in `proxy.ts` (export `proxy`), not `middleware.ts`.** In Next.js 16 `middleware.ts` was renamed to `proxy.ts`, so this file **does** run. It gates `/admin/:path*` by session (redirect to `/login?redirect=…`) and role (redirect to `/not-admin`). `requireAdmin()` inside `app/admin/layout.tsx`, server components, route handlers, and server actions remains the authoritative gate — the proxy is a convenience layer, not a substitute.

## Routing & layout

- App Router. Route groups: `app/(auth)/` (login, verify-request), `app/(public)/` (landing: home, `/courses`, `/courses/[slug]`, `/contact`, `/terms`, `/privacy`, `/license`, `/payment/{success,cancel}`, `/certificates/[code]`). Plain folders: `app/admin/` (dashboard, courses, projects, contact-messages) and `app/not-admin/`.
- Admin layout (`app/admin/layout.tsx`) wraps everything under `/admin` with the shadcn sidebar/header in `app/admin/_components/`.
- API routes: `app/api/auth/[...all]` (better-auth), `app/api/s3/upload` and `app/api/s3/delete` (presigned Tigris uploads), `app/api/admin/activity/export/route.ts` (CSV export of admin activity log). The public course store and payment routes are disabled; course access will be managed by administrators.
- Default to **server components**; only add `"use client"` when you need state, effects, or browser-only APIs. Pair client-only subtrees with a server parent that passes plain props (see the FAQ pattern: `FAQ.tsx` server + `FaqList.tsx` client).

## Data fetchers & auth helpers

- Server-side data fetching follows a per-domain folder convention. All files `import "server-only"` at the top:
  - `app/data/admin/*.ts` — every file calls `await requireAdmin()` first. Use `revalidatePath` on the admin layout after mutations.
  - `app/data/user/*.ts` — calls `await requireUser()`; for any signed-in learner (no role check).
  - `app/data/course/*.ts` — `get-all-courses` and `get-course-by-slug` filter to `status: PUBLISHED` and sort by `createdAt desc`.
  - `app/data/certificate/*.ts` — public certificate lookup by verification code.
- Optional-session helper for public pages that render differently signed-in vs signed-out: `app/(public)/_lib/get-optional-session.ts` (`auth.api.getSession({ headers })`, returns `null` when signed out). Server actions in `app/(public)/*/actions.ts` reuse this same helper to attach `userId` when available.
- Admin action auditing: `lib/activity/log-activity.ts` writes `Activity` rows (Prisma model in `prisma/schema.prisma`). Use it from admin server actions after mutating courses/chapters/lessons/quizzes/reviews/contact messages — the `ActivityAction` enum lists every supported event.

## URL state (nuqs)

- `nuqs` is used for client-side URL state (search params in the course catalog, etc.). The root layout already wraps the body with `<NuqsAdapter>` from `nuqs/adapters/next/app` — do not wrap again. `parseAsStringLiteral(...)` parsers auto-fall back on invalid URL values, no extra plumbing needed.

## UI / shadcn

- shadcn/ui configured in `components.json`: style `base-vega`, base color `neutral`, `rsc: true`, icon library lucide. Aliases: `@/components`, `@/components/ui`, `@/lib`, `@/hooks`.
- Tailwind v4 via `@tailwindcss/postcss` (`postcss.config.mjs`); theme tokens live in `app/globals.css`. `tw-animate-css` and `@tailwindcss/typography` are installed.
- Add components via `pnpm exec shadcn add <name>`; output lands in `components/ui/`.
- Rich text uses TipTap (`components/rich-text-editor`), drag-and-drop uses `@dnd-kit/react` + `@dnd-kit/helpers`, charts via `recharts`, forms via `react-hook-form` + `zod` (`@hookform/resolvers`), toasts via `sonner`.

## Image / S3 (Tigris)

- `next.config.ts` allows `images.remotePatterns` for `${NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES}.<host>`, where `<host>` is derived from `AWS_ENDPOINT_URL_S3` (currently `t3.storage.dev`). Presigned URLs are generated from that same endpoint, so the two stay in sync.
- Files are uploaded via presigned URLs from `/api/s3/upload`, stored on Tigris (S3-compatible) via `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (`lib/S3Client.ts`).
- Stale `PendingUpload` rows/objects are swept by `sweepOrphanUploads` (`lib/s3/discard-upload.ts`). Today it is **manual-only**, triggered by the admin cleanup button (`cleanupOrphanUploadsAction`); it is not scheduled. If you add scheduling, expose it via a cron route instead of changing the manual path.

## Versions that bite

- Next.js **16.1.1**, React **19.2.3**, Prisma **^7.9.1** (new client generator API), better-auth **^1.7.1**, Tailwind **v4**, shadcn **^3.8.5**. Do not assume v3/v15 idioms; copy the patterns already in the repo as reference.

## Conventions (avoid regressions)

- Never read `process.env` in app code — go through `lib/env.ts` (add the var there and to `.env.example`; update `experimental__runtimeEnv` for `NEXT_PUBLIC_*`).
- Money is integer cents end-to-end (`Course.priceCents`, `Enrollment.amount`); convert to/from dollars only at the display/input edge.
- Every admin page/mutation starts with `await requireAdmin()`. The `proxy.ts` gate is a convenience redirect, not the authorisation boundary.
- Rate-limit auth and public-write endpoints by IP (Arcjet `fixedWindow`) so anonymous callers can't share one bucket.
- Grade and authorise on the server; never ship secrets or quiz `isCorrect` flags to the client.
