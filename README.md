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
- **Teachers** author lessons and assessments, manage assigned course rosters, set due dates, review submissions, and import/export portable course packages.
- **Learners** follow assigned courses, complete quizzes and Python or JavaScript exercises, see feedback and progress, and resume where they left off.
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

For personal learning, install Docker Desktop, download and unzip this repository, then double-click **Start SchoolSphere** (`.command` on macOS, `.bat` on Windows; Linux users can run `scripts/local-school.sh`). The first launch prepares the app, creates local settings, initializes a fresh database, opens the site, and signs you in with the demo learner shortcut. No Git or terminal setup is needed on Windows; macOS may ask you to confirm opening the launcher the first time. To stop without removing courses or progress, double-click **Stop SchoolSphere**. See the [plain-language personal install guide](docs/LOCAL_PERSONAL_INSTALL_RU.md).

The local app and code runner are for this trusted computer only. Services bind to loopback; do not expose this demo configuration to the public internet. The demo login is deliberately local-only. For a school installation, manual setup, backup/restore, or updates, see [Local Development and Operations](docs/LOCAL_DEVELOPMENT.md).

Course authors can import or export `.s84course` bundles from the teacher area. The package manifest, media layout, Python/JavaScript checkers, and optional progress file are documented in the [Course Package Format](docs/COURSE_PACKAGE_FORMAT.md). Learners can also import a prepared package into a personal learning space. Converting a source GitHub repository into a course is an external agent-assisted preparation step; the app imports the resulting package and does not convert repositories itself. See the [agent conversion workflow](docs/COURSE_PACKAGE_AGENT_WORKFLOW.md) and run `pnpm course-package:validate path/to/course.s84course` before importing.

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
