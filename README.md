<p align="center">
  <img src="public/logo.svg" width="88" alt="SchoolSphere logo">
</p>

<h1 align="center">SchoolSphere</h1>

<p align="center">A self-hosted, multi-school learning platform for independent schools, local learning groups, and course creators.</p>

<p align="center">
  <a href="https://github.com/gwinell/School84/actions/workflows/ci.yml?query=branch%3Aaudit%2Fintegration"><img alt="CI" src="https://github.com/gwinell/School84/actions/workflows/ci.yml/badge.svg?branch=audit/integration"></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/github/license/gwinell/School84"></a>
  <img alt="Node.js 22" src="https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white">
  <img alt="pnpm 11.25" src="https://img.shields.io/badge/pnpm-11.25-F69220?logo=pnpm&logoColor=white">
</p>

SchoolSphere is the School84 fork of [KnowSphere](https://github.com/billalben/KnowSphere), adapted for multiple independent schools. Each school manages its own staff, learners, courses, and enrollments. The project is self-hosted: it does not provide a hosted service.

> **Project status:** actively developed. Before using real learner data, configure production authentication, email, storage, TLS, backups, and a trusted Python runner. See [deployment and upgrade notes](docs/LOCAL_DEVELOPMENT.md) and the [tenancy upgrade guide](docs/TENANCY_UPGRADE.md).

## What you can do

- **School owners and administrators** create a school, invite staff and learners, manage courses, assign students, and review progress.
- **Teachers** author lessons and assessments, manage assigned course rosters, set due dates, and review submissions with feedback.
- **Learners** follow assigned courses, complete quizzes and Python exercises, see feedback and progress, and resume where they left off.
- **Independent schools** share one installation while keeping course catalogs, membership, and learning access scoped to each school. The same course slug can exist in different schools.

| Role | Access |
| --- | --- |
| `OWNER` | Manages school members, roles, invitations, and courses. |
| `ADMIN` | Manages school members, invitations, and courses; owner-only actions stay with the owner. |
| `TEACHER` | Authors and manages courses assigned to them in that school. |
| `STUDENT` | Studies courses assigned to them and sees their own progress and feedback. |
| Platform administrator | Performs installation-wide administration; this is separate from school membership. |

Invitations use verified accounts and one-time links. A person's access in one school does not grant access to another school's courses or learners.

## Quick start

You need Git and Docker with Docker Compose. These steps initialize a **new, empty local database** and seed demo accounts; they are not an upgrade path for a database that already contains school data.

```bash
git clone https://github.com/gwinell/School84.git
cd School84
cp .env.example .env

docker compose --profile build-image build python-sandbox-image
docker compose up -d db
docker compose --profile init-schema run --build --rm schema-init
docker compose up --build -d app python-runner
docker compose --profile local-admin run --rm local-admin
```

Open [http://localhost:3001](http://localhost:3001). In the local Docker profile, use **Войти как преподаватель** or **Войти как ученик** for the seeded demo accounts. The demo OTP is `840084`; this shortcut is for local evaluation only. The learner account includes a sample Python course and progress.

The app and runner are intended for a trusted local host. The runner uses the Docker socket to start restricted containers; keep services bound to loopback and do not expose this demo configuration to the public internet. To stop the stack without deleting its database:

```bash
docker compose down
```

For manual Node.js setup, environment configuration, demo curriculum import, backup/restore, and safe application updates, see [Local Development and Operations](docs/LOCAL_DEVELOPMENT.md).

## Technology

- Next.js App Router, React, and TypeScript
- Tailwind CSS and Base UI/shadcn components
- PostgreSQL and Prisma
- better-auth, email OTP, and GitHub OAuth
- S3-compatible course media storage
- Isolated Python execution through a dedicated runner service

## Development and tests

Requirements for the application toolchain: Node.js 22 and pnpm 11.25. Copy `.env.example` to `.env`, set the required local values, then install dependencies and generate Prisma Client:

```bash
pnpm install --frozen-lockfile
pnpm exec prisma generate
```

Run the standard checks before opening a pull request:

```bash
pnpm test
pnpm test:runner
pnpm test:security
pnpm lint
pnpm typecheck
pnpm exec prisma validate
pnpm build
```

The PostgreSQL tenancy test must use a disposable database named `school84_tenant_test`; it creates and drops a temporary schema there:

```bash
createdb school84_tenant_test
TEST_TENANCY_DATABASE_URL='postgresql://USER:PASSWORD@localhost:5432/school84_tenant_test' pnpm test:tenant
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow and [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Existing installations

Do not run `prisma db push` against a database containing school data. Back up and verify the database, then follow [TENANCY_UPGRADE.md](docs/TENANCY_UPGRADE.md) to apply the data-preserving tenant migration. Read the [local operations guide](docs/LOCAL_DEVELOPMENT.md) for backup, update, and recovery procedures.

## Help and community

Report bugs and propose features through [GitHub Issues](https://github.com/gwinell/School84/issues). See [CONTRIBUTING.md](CONTRIBUTING.md) before sending a pull request, and use [SECURITY.md](SECURITY.md) for private vulnerability reports. This fork is maintained by [@gwinell](https://github.com/gwinell).

## License and attribution

SchoolSphere is distributed under the [MIT License](LICENSE). This repository is a fork of KnowSphere; the original license notice is preserved.
