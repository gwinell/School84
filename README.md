<p align="center">
  <img src="public/logo.svg" width="88" alt="SchoolSphere logo">
</p>

<h1 align="center">SchoolSphere</h1>

<p align="center"><strong>One learning platform for a local school or your own self-guided study.</strong></p>

<p align="center">
  Build and teach courses with your school, or run SchoolSphere on your own computer and learn from portable course bundles.
</p>

<p align="center">
  <a href="https://github.com/gwinell/School84/actions/workflows/ci.yml?query=branch%3Amain"><img alt="CI status" src="https://github.com/gwinell/School84/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/github/license/gwinell/School84"></a>
  <img alt="Node.js 22" src="https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white">
  <img alt="pnpm 11.25" src="https://img.shields.io/badge/pnpm-11.25-F69220?logo=pnpm&logoColor=white">
</p>

<p align="center">
  <a href="#for-a-school">For a school</a> ·
  <a href="#for-an-independent-learner">For an independent learner</a> ·
  <a href="#screenshots">Screenshots</a> ·
  <a href="#get-started">Get started</a>
</p>

SchoolSphere is a self-hosted learning platform, adapted from the [KnowSphere project](https://github.com/billalben/KnowSphere). You host and operate it; this repository does not provide a hosted service.

## Choose how to use SchoolSphere

### For a school

Host a branded online school for a local learning group. Invite teachers and learners, organize courses, assign course access, and follow learner submissions and progress. Multiple schools can share one installation while their members, courses, and enrollments remain scoped to their own school.

Start with [Local Development and Operations](docs/LOCAL_DEVELOPMENT.md) for setup, deployment, backups, and updates. Before using real learner data, configure production authentication, email, storage, TLS, backups, and a trusted code runner. Review the [tenancy upgrade guide](docs/TENANCY_UPGRADE.md) before updating an existing installation.

### For an independent learner

Run SchoolSphere on your own computer, import a prepared `.s84course` bundle, and study at your own pace. No Git or terminal setup is required for the guided Windows and macOS launchers. You need Docker Desktop installed once.

1. Download and unzip this repository.
2. Open **Start SchoolSphere** for your operating system and wait for the first setup to finish.
3. Open the local site and sign in with the demo learner shortcut.
4. Import a course bundle from the learner area and continue whenever you like.

Follow the [plain-language personal install guide](docs/LOCAL_PERSONAL_INSTALL_RU.md) for setup steps, troubleshooting, and stopping the app without deleting your courses or progress. The personal setup is intended for this computer only and must not be exposed to the public internet.

Course bundles can be created in the teacher area or prepared from another GitHub repository with an external coding agent. SchoolSphere imports the resulting package; it does not convert source repositories itself. See the [course package format](docs/COURSE_PACKAGE_FORMAT.md), [agent conversion workflow](docs/COURSE_PACKAGE_AGENT_WORKFLOW.md), and [example bundle](docs/examples/minimal-course.s84course).

## What each role can do

| Role | Main capabilities |
| --- | --- |
| **Owner** | Manage school members, roles, invitations, and courses. |
| **Administrator** | Manage school members, invitations, and courses; owner-only actions remain with the owner. |
| **Teacher** | Create and manage assigned courses, lessons, assessments, rosters, deadlines, and reviews. Import and export portable course packages. |
| **Learner** | Study assigned courses, complete quizzes and coding exercises, review feedback and progress, and resume learning. Personal installs also support importing a prepared course. |
| **Platform administrator** | Perform installation-wide administration, separate from membership in an individual school. |

Invitations use verified accounts and one-time links. Access in one school does not grant access to another school's courses or learners.

## Screenshots

The screenshots below show the learner journey and the tools used to create and bring courses into SchoolSphere.

<table>
  <tr>
    <td align="center" width="50%">
      <a href="docs/screenshots/learner-dashboard.png"><img src="docs/screenshots/learner-dashboard.png" alt="SchoolSphere learner dashboard showing enrolled courses and learning progress" width="100%"></a><br>
      <strong>Learner dashboard</strong><br>See courses and pick up your learning.
    </td>
    <td align="center" width="50%">
      <a href="docs/screenshots/course-player.png"><img src="docs/screenshots/course-player.png" alt="SchoolSphere course player displaying a lesson and learner activity" width="100%"></a><br>
      <strong>Course player</strong><br>Work through lessons, quizzes, and coding exercises.
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <a href="docs/screenshots/course-management.png"><img src="docs/screenshots/course-management.png" alt="SchoolSphere course management screen showing course and learner tools" width="100%"></a><br>
      <strong>Course management</strong><br>Manage learners, invitations, access, and course activity.
    </td>
    <td align="center" width="50%">
      <a href="docs/screenshots/course-import.png"><img src="docs/screenshots/course-import.png" alt="SchoolSphere course import screen for a portable course bundle" width="100%"></a><br>
      <strong>Course import</strong><br>Bring a prepared course bundle into a learning space.
    </td>
  </tr>
</table>

## Get started

### Personal computer

Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) once, then use the [personal install guide](docs/LOCAL_PERSONAL_INSTALL_RU.md). The included launchers prepare the app and local database, then open SchoolSphere in your browser.

### School deployment or development

For the application toolchain, use Node.js 22 and pnpm 11.25. The full setup and operations instructions are in [Local Development and Operations](docs/LOCAL_DEVELOPMENT.md).

To prepare a development environment:

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

The PostgreSQL tenancy test uses a disposable database named `school84_tenant_test` and creates and drops a temporary schema there:

```bash
createdb school84_tenant_test
TEST_TENANCY_DATABASE_URL='postgresql://USER:PASSWORD@localhost:5432/school84_tenant_test' pnpm test:tenant
```

Do not run `prisma db push` against a database containing school data. Back up and verify existing data, then follow the [tenancy upgrade guide](docs/TENANCY_UPGRADE.md).

## Technology

- Next.js App Router, React, and TypeScript
- Tailwind CSS and Base UI/shadcn components
- PostgreSQL and Prisma
- better-auth, email OTP, and GitHub OAuth
- S3-compatible course media storage
- Isolated Python execution through a dedicated runner service

## Contributing and support

Report bugs and propose features through [GitHub Issues](https://github.com/gwinell/School84/issues). Read [CONTRIBUTING.md](CONTRIBUTING.md) before sending a pull request. For private vulnerability reports, see [SECURITY.md](SECURITY.md).

## License and attribution

SchoolSphere is distributed under the [MIT License](LICENSE). This repository is a fork of KnowSphere; the original license notice is preserved.
