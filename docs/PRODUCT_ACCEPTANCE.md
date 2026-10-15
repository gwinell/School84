# Product Baseline and Acceptance Criteria

This document records the product baseline and the acceptance gates for the two intended SchoolSphere use cases. It is the shared contract for implementation, testing, security review, and release.

## Baseline

- Repository: `gwinell/School84`
- Baseline branch: `main`
- Baseline commit: `6c6ee43fef15d8fe2e91ac5bdac7d75d589b1100` (`Add portable course packages and JS runner`)
- Audit date: 2026-10-15

Capabilities already present at the baseline:

- One installation can host multiple organizations with school-scoped courses and memberships.
- Organizations have owner, administrator, teacher, and student roles; staff can invite members and teachers can work with courses they are assigned to.
- Teachers can export a course and import a `.s84course`/ZIP file or a direct public GitHub URL to such a package. The package format supports lesson text, quizzes, media, Python/JavaScript code tasks, and optional learner progress.
- A local Docker setup and demo accounts are documented.

Known gaps at the baseline:

- School name, logo, and color are not fully configurable through the school management UI; public site chrome still carries the shared SchoolSphere brand.
- Import accepts a prepared course package, not an arbitrary GitHub repository or folder. The repository does not yet provide a complete, validated agent workflow for converting source material into a package.
- Course import is a staff workflow into an organization. It creates a draft; an administrator or owner must publish it and arrange learner access. A learner cannot import into a personal library and start immediately.
- A real Docker/browser smoke run was not verified in the audit environment because Docker was unavailable.

## Use case A: a local school runs its own branded school

Given a fresh installation, a school owner can:

1. Create a school and configure its display name, public slug, logo, and primary color without editing source code.
2. Invite an administrator, teachers, and learners with the correct roles.
3. Create or assign courses to teachers, publish a course, and enroll learners.
4. See the school's branding and catalog on its public and authenticated pages.
5. Operate alongside a second school in the same installation without exposing or modifying that school's users, courses, enrollments, or progress.

The scenario passes only when the flow works through the UI and tenant isolation is covered by automated tests. A school must not need to fork or edit application code to change its ordinary branding.

## Use case B: an independent learner studies locally from a repository-based course

Given a fresh local installation and a source GitHub repository, an independent learner can:

1. Ask an agent to convert supported repository materials into a SchoolSphere course package using a documented prompt, examples, and package validator.
2. Import the validated package from a local file or a public direct GitHub URL, without a school administrator performing the import.
3. See the course in a personal library, start it without a separate publish/enrollment workaround, and complete reading, quiz, and Python/JavaScript exercises.
4. Resume later with progress retained locally.
5. Continue studying after import without depending on the source repository being available. Course media and the execution runner must work in the documented local setup.

The scenario passes only when it is demonstrated end to end on a clean local install, including a course with media, a quiz, and at least one executable code task. The conversion workflow must report unsupported source material instead of silently dropping it.

## Shared release gates

- Automated checks pass for backend, frontend, package import/export, authorization, tenant isolation, and runner security.
- PostgreSQL-backed tenant tests run in CI and are not silently skipped.
- A clean-install integration test covers each use case through completion of its principal user journey.
- An independent pentest has no unresolved critical or high-severity findings. The pentester reports findings; implementation agents own fixes and retests.
- The local deployment and upgrade instructions match a verified run. Any production deployment guidance identifies required authentication, TLS, storage, backups, and runner isolation.
- Public course packages do not unintentionally disclose quiz answer keys or learner personal data. Progress export remains explicit and its privacy implications are documented.

## Recorded verification at the baseline

The audit of `6c6ee43` recorded 147 passing Node.js tests, one skipped PostgreSQL tenancy test because `TEST_TENANCY_DATABASE_URL` was not set, 12 passing runner tests, and successful lint, typecheck, and Prisma validation. GitHub Actions CI for the commit succeeded. Docker-based startup and browser smoke testing were not confirmed in that environment.

These results describe the baseline only. Each release candidate must satisfy the shared release gates above.
