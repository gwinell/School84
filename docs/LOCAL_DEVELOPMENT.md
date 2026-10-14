# Local Development and Operations

This guide covers a fresh local install, demo data, backups, safe application updates, and recovery. For the existing-database tenancy upgrade, see [TENANCY_UPGRADE.md](TENANCY_UPGRADE.md).


The recommended local setup runs the app, PostgreSQL, and the isolated Python runner in Docker. The app starts without changing the database schema. The app is available at [http://localhost:3001](http://localhost:3001); the existing port 3000 is left untouched.

```bash
docker compose --profile build-image build python-sandbox-image
docker compose up -d db
# Fresh installations only: explicitly initialize the schema after reviewing it.
docker compose --profile init-schema run --build --rm schema-init
docker compose up --build -d app python-runner
docker compose --profile local-admin run --rm local-admin
```

This sequence is for a **new, empty local database only**. `schema-init` runs Prisma `db push`; never run it against an existing school database. Existing installations should follow the [tenant database upgrade runbook](TENANCY_UPGRADE.md), which performs the one-time legacy data backfill. The app and runner should be published only on a trusted machine: the runner has access to the Docker socket, and the default Compose values are demo credentials rather than production secrets. Keep the database port and app bound to loopback unless a separately reviewed production deployment adds TLS, a firewall, real authentication providers, email delivery, and secret management.

On the local Docker login page, use **Войти как преподаватель** or **Войти как ученик** for one-click demo access. The demo accounts are `admin@school84.local` and `student@school84.local`; the learner has the Python course with sample progress and activity. This shortcut is enabled only in the local Docker profile. To disable it, set `DEMO_LOGIN_ENABLED=false`. Regular email OTP login remains available; codes are printed in app logs:

```bash
docker compose logs -f app
```

The expanded Python course is generated from the local notebook collection in `../school84-mvp/content/source/python`. To import or refresh it after running the local-admin profile:

```bash
python3 scripts/seed_python_course.py > /tmp/school84-python-course.sql
docker compose exec -T db psql -U school84 -d school84 -v ON_ERROR_STOP=1 < /tmp/school84-python-course.sql
```

The course contains 9 chapters, 16 lessons, two reading cells and two autograded code tasks per notebook lesson, plus 10 quizzes. The demo enrollment opens the entire course so its content can be reviewed immediately.

The local profile bypasses Arcjet and sends no email. To use real GitHub OAuth, Resend, or Arcjet, set their values and enable/configure them in `.env`. Course image uploads use the existing S3-compatible storage integration; point the `AWS_*` settings to a reachable bucket to enable uploads. The Python runner uses the local Docker socket to launch isolated sandboxes; keep this stack on the trusted local machine.

Stop the app while preserving the database:

```bash
docker compose down
```

### Back up, update, and roll back a local school

Backups contain student and course data. Store them outside source control, restrict file permissions, and copy them to encrypted storage. Never commit a backup or `.env` file.

```bash
mkdir -p backups
chmod 700 backups
backup="backups/school84-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup"
chmod 600 "$backup"
docker compose exec -T db pg_restore --list < "$backup" >/dev/null
```

For an application-only update, first pass the CI, authorization/security tests, and local candidate smoke checks. Take and verify the backup above. Save the currently running image ID under a rollback tag, then build and start the reviewed app image. These commands intentionally do not run schema sync, seed data, or delete the database volume:

```bash
old_image="$(docker inspect --format '{{.Image}}' school84-mvp-app-1)"
docker image tag "$old_image" school84-mvp-app:rollback
APP_IMAGE_TAG=release docker compose build app
APP_IMAGE_TAG=release docker compose up --no-build -d app
docker compose ps
node scripts/verify-local-deployment.cjs school84-mvp-app-1
```

If health or smoke checks fail, return to the retained app image, then inspect logs before retrying:

```bash
APP_IMAGE_TAG=rollback docker compose up --no-build -d app
docker compose logs --tail=200 app
```

Do not overwrite the rollback tag until the release has been accepted and a new backup has been verified. Test a backup by restoring it into an empty temporary database first:

```bash
docker compose exec -T db sh -c 'createdb -U "$POSTGRES_USER" school84_restore_check'
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d school84_restore_check --exit-on-error' < "$backup"
# After checking the restored data, remove only this temporary database.
docker compose exec -T db sh -c 'dropdb -U "$POSTGRES_USER" school84_restore_check'
```

To replace the active local database, take and verify another backup of its current state first, stop the app, and type the exact confirmation shown below. Then restore the selected archive and start the app again:

```bash
docker compose exec -T db sh -c 'pg_restore --list' < "$backup" >/dev/null
printf 'This replaces the active database. Type RESTORE school84 to continue: '
read -r confirmation
[ "$confirmation" = 'RESTORE school84' ] || { echo 'Restore cancelled'; exit 1; }
docker compose stop app
docker compose exec -T db sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB"'
docker compose exec -T db sh -c 'createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --exit-on-error' < "$backup"
docker compose up -d app
```

Do not use `docker compose down -v` as a rollback or update step. The first tenant-aware release changes the database and application together. An old non-tenant app image is only a viable rollback while the database still contains one school; after other schools have been onboarded, rolling back to code that does not scope data by organization is unsafe. Prefer a forward fix. Restoring the pre-upgrade backup loses changes made after that backup, so treat it as a deliberate disaster-recovery action. Follow the [tenant database upgrade runbook](TENANCY_UPGRADE.md) for existing installations; never use `prisma db push` to upgrade a populated school database.

## Manual Node setup

Requirements: Node.js 22.12+ (Docker uses Node.js 22), pnpm 11.25.0, and PostgreSQL.

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

Run `pnpm exec prisma db push` only for a fresh, empty local database. The Python runner is included in the Docker Compose stack. For a manual Node setup, configure `PYTHON_RUNNER_URL` and `PYTHON_RUNNER_TOKEN` to point to a separately started runner. Python code runs in disposable containers with networking disabled, a read-only root filesystem, dropped Linux capabilities, and CPU, memory, process, and time limits. Keep the runner's Docker socket accessible only to this trusted local service.

Activity time is recorded in 20-second batches while the lesson tab is visible and the learner has interacted with the page within the previous minute. Dates in the activity calendar use UTC.

## Useful commands

```bash
pnpm test
pnpm test:runner
pnpm lint
pnpm typecheck
pnpm build
node scripts/verify-local-deployment.cjs school84-mvp-app-1  # after release health is ready
```

The Node regression suite uses the built-in node:test runner; tests/test_runner_security.py contains Python unittest regressions. The two public storage build arguments are derived from the same Compose environment as runtime; rebuild the app when changing the S3 endpoint or public bucket. No storage credentials are passed as build arguments. The standalone app image runs as UID 1001 on a read-only root filesystem with bounded temporary/cache storage; development CLIs and build placeholders stay in the build/init stages. The Docker socket remains privileged host access for the local runner service, so this is a trusted local deployment, not an internet-facing sandbox service. For contributor workflow, see [CONTRIBUTING.md](../CONTRIBUTING.md).
