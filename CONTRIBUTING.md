# Contributing to SchoolSphere

Thanks for helping improve SchoolSphere. Bug reports, accessibility feedback, documentation, and code contributions are welcome.

## Before you start

- Search existing issues and pull requests before opening a duplicate.
- For larger changes, open an issue first so the scope and design can be discussed.
- Do not include student information, database backups, `.env` files, access tokens, or other secrets in issues or pull requests.

## Development setup

Use Node.js 22, pnpm 11.25, and PostgreSQL. Follow the fresh-install steps in the [local development guide](docs/LOCAL_DEVELOPMENT.md), or use Docker Compose. Copy `.env.example` to `.env`, then generate the Prisma client:

```bash
pnpm install --frozen-lockfile
pnpm exec prisma generate
```

Use an empty local database for `prisma db push`. For an existing database, do not run schema sync; follow the [tenant upgrade guide](docs/TENANCY_UPGRADE.md).

## Make a change

1. Create a focused branch from the current default branch.
2. Keep authorization and data access school-scoped. A teacher's membership in one school must never grant access to another school's courses or learners.
3. Add or update regression coverage for changed behavior, especially role boundaries and cross-school access.
4. Run the relevant checks before opening a pull request:

   ```bash
   pnpm test
   pnpm test:runner
   pnpm test:security
   pnpm lint
   pnpm typecheck
   pnpm exec prisma validate
   pnpm build
   ```

5. If the change affects the migration or tenant isolation, run `pnpm test:tenant` against a disposable PostgreSQL database named `school84_tenant_test`.
6. Open a pull request with the user-visible behavior, migration impact, and test results.

The CI workflow runs the regression suites, tenant PostgreSQL test, lint, typecheck, and production container build. Never use production learner data for local development or tests.
