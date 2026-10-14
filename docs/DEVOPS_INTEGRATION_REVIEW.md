# DevOps integration review

This review records the DevOps branch checks for the school-tenancy integration. It is evidence from isolated validation, not a production release approval.

## CI contract

- GitHub Actions provisions a job-scoped `postgres:16-alpine` service with `school84`, matching the job `DATABASE_URL`.
- CI creates a second database named `school84_tenant_test`; only the `pnpm test:tenant` step receives `TEST_TENANCY_DATABASE_URL` for that database. The tenant suite refuses any other database name and creates/drops only its random schema.
- `createdb` is available on the current GitHub `ubuntu-24.04` runner image. The database password is a test-only value; the service has no persistent volume.
- `test:tenant` is supplied by the tenant-backend branch. Combine that branch with this DevOps branch before running the full workflow.

## Isolated PostgreSQL 16 checks

The following checks passed against disposable PostgreSQL 16 containers on loopback, with no mounted or named volumes. Each container was stopped after the check.

- Tenant migration regression: `pnpm test:tenant` passed 1/1.
- Legacy upgrade procedure: created synthetic legacy tables/data, applied `migration.sql` using `psql -v ON_ERROR_STOP=1`, marked it with `prisma migrate resolve --applied 20261015010000_school_tenancy`, then ran `prisma migrate deploy`; Prisma reported no pending migrations.
- CI database setup: initialized `school84`, created `school84_tenant_test`, and reran the tenant suite successfully.

The SQL migration was not run against a school, candidate, or production database. No Docker image build, rollout, prune, or volume operation was performed for this review.

## Combined-branch gate

The README links to [`TENANCY_UPGRADE.md`](./TENANCY_UPGRADE.md), supplied by the backend branch. Recheck that this file is present after integration, then rerun the complete CI workflow on the combined tree. This report does not replace the application, security, or product pentest gates.
