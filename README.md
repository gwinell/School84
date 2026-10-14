# School 84

School 84 is being adapted from KnowSphere into a focused course-learning platform. This phase keeps the existing Next.js, TypeScript, Prisma, PostgreSQL, and shadcn/ui foundations while disabling the public course store and commercial features.

## Current MVP foundation

- Email OTP and GitHub sign-in, with learner and administrator roles.
- Role-protected learner and administrator areas.
- Course, chapter, lesson, quiz, and category management for administrators.
- Existing learner progress tracking for lessons.
- Course access is not self-service. Public purchases are disabled; administrators assign courses and choose whether material opens all at once or sequentially.
- Course lessons support ordered text, Python task, and quiz cells. Python submissions and their results are stored separately from lesson completion.
- The learner dashboard shows accepted tasks, submitted solutions, active days, and reading/solving time for the previous 365 days.
- The lesson player no longer shows discussions. Reviews, wishlists, certificates, and project pages are hidden.
- Payments and Stripe webhooks are disabled.

The public landing route sends signed-out users to sign-in and signed-in users to the appropriate dashboard. The existing visual system remains in place while School 84 course workflows are added.

## Technology

- Next.js 16 App Router, React 19, TypeScript
- Tailwind CSS 4 and shadcn/ui
- PostgreSQL and Prisma 7
- better-auth for authentication and roles
- Arcjet for request protection
- Tigris-compatible S3 storage for course media

## Local setup with Docker

The recommended local setup runs the app, PostgreSQL, and the isolated Python runner in Docker. The database schema is synchronized when the app starts. The app is available at [http://localhost:3001](http://localhost:3001); the existing port 3000 is left untouched.

```bash
docker-compose --profile build-image build python-sandbox-image
docker-compose up --build -d
docker-compose --profile local-admin run --rm local-admin
```

On the local Docker login page, use **Войти как преподаватель** or **Войти как ученик** for one-click demo access. The demo accounts are `admin@school84.local` and `student@school84.local`; the learner has the Python course with sample progress and activity. This shortcut is enabled only in the local Docker profile. To disable it, set `DEMO_LOGIN_ENABLED=false`. Regular email OTP login remains available; codes are printed in app logs:

```bash
docker-compose logs -f app
```

The expanded Python course is generated from the local notebook collection in `../school84-mvp/content/source/python`. To import or refresh it after running the local-admin profile:

```bash
python3 scripts/seed_python_course.py > /tmp/school84-python-course.sql
docker-compose exec -T db psql -U school84 -d school84 -v ON_ERROR_STOP=1 < /tmp/school84-python-course.sql
```

The course contains 9 chapters, 16 lessons, two reading cells and two autograded code tasks per notebook lesson, plus 10 quizzes. The demo enrollment opens the entire course so its content can be reviewed immediately.

The local profile bypasses Arcjet and sends no email. To use real GitHub OAuth, Resend, or Arcjet, set their values and enable/configure them in `.env`. Course image uploads use the existing S3-compatible storage integration; point the `AWS_*` settings to a reachable bucket to enable uploads. The Python runner uses the local Docker socket to launch isolated sandboxes; keep this stack on the trusted local machine.

Stop the app while preserving the database:

```bash
docker-compose down
```

Remove the local database only when you want a clean reset:

```bash
docker-compose down -v
```

## Manual Node setup

Requirements: Node.js 20+, pnpm, and PostgreSQL.

```bash
pnpm install
cp .env.example .env
```

Set the required values in `.env`, then create the Prisma client and sync the schema:

```bash
pnpm exec prisma generate
pnpm exec prisma db push
pnpm dev
```

The app is available at [http://localhost:3000](http://localhost:3000).

The Python runner is included in the Docker Compose stack. For a manual Node setup, configure `PYTHON_RUNNER_URL` and `PYTHON_RUNNER_TOKEN` to point to a separately started runner. Python code runs in disposable containers with networking disabled, a read-only root filesystem, dropped Linux capabilities, and CPU, memory, process, and time limits. Keep the runner's Docker socket accessible only to this trusted local service.

Activity time is recorded in 20-second batches while the lesson tab is visible and the learner has interacted with the page within the previous minute. Dates in the activity calendar use UTC.

## Useful commands

```bash
pnpm lint
pnpm typecheck
pnpm build
```

There is currently no automated test suite. See [AGENTS.md](./AGENTS.md) for repository-specific implementation rules and environment details.
