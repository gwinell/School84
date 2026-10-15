/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { test } = require("node:test");

const databaseUrl = process.env.TEST_TENANCY_DATABASE_URL;

test("tenant migration preserves legacy data and isolates schools in PostgreSQL", { skip: !databaseUrl && "TEST_TENANCY_DATABASE_URL is not configured" }, async () => {
  const parsed = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (databaseName !== "school84_tenant_test") {
    throw new Error(`Refusing tenant integration tests against database '${databaseName}'. Expected dedicated database school84_tenant_test.`);
  }

  const { Client } = require("pg");
  const client = new Client({ connectionString: databaseUrl });
  const schema = `tenant_test_${randomBytes(8).toString("hex")}`;
  const q = (identifier) => `"${identifier.replaceAll('"', '""')}"`;
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA ${q(schema)}`);
    await client.query(`SET search_path TO ${q(schema)}`);
    await client.query(`
      CREATE TABLE "user" ("id" TEXT PRIMARY KEY, "email" TEXT NOT NULL UNIQUE);
      CREATE TABLE "Course" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "slug" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE UNIQUE INDEX "Course_slug_key" ON "Course"("slug");
      CREATE TABLE "course_instructor" ("courseId" TEXT NOT NULL, "userId" TEXT NOT NULL);
      CREATE TABLE "Enrollment" ("id" TEXT PRIMARY KEY, "courseId" TEXT NOT NULL, "userId" TEXT NOT NULL);
      INSERT INTO "user" ("id", "email") VALUES
        ('owner-a', 'owner-a@example.test'), ('teacher-a', 'teacher-a@example.test'),
        ('student-a', 'student-a@example.test'), ('owner-b', 'owner-b@example.test');
      INSERT INTO "Course" ("id", "userId", "slug") VALUES ('legacy-course', 'owner-a', 'intro');
      INSERT INTO "course_instructor" ("courseId", "userId") VALUES ('legacy-course', 'teacher-a');
      INSERT INTO "Enrollment" ("id", "courseId", "userId") VALUES ('legacy-enrollment', 'legacy-course', 'student-a');
    `);

    const migration = fs.readFileSync(path.join(__dirname, "../prisma/migrations/20261015010000_school_tenancy/migration.sql"), "utf8");
    await client.query(migration);
    const personalMigration = fs.readFileSync(path.join(__dirname, "../prisma/migrations/20261015020000_personal_organization/migration.sql"), "utf8");
    await client.query(personalMigration);

    const organizationDefaults = await client.query(`SELECT "type", "ownerUserId" FROM "organization"`);
    assert.deepEqual(organizationDefaults.rows, [{ type: "SCHOOL", ownerUserId: null }], "tenant backfill classifies existing schools as SCHOOL without personal owners");
    await client.query(`INSERT INTO "organization" ("id", "name", "slug", "type", "ownerUserId") VALUES ('personal-library', 'My Library', 'personal-student-a', 'PERSONAL', 'student-a')`);
    await assert.rejects(
      client.query(`INSERT INTO "organization" ("id", "name", "slug", "type") VALUES ('personal-no-owner', 'Broken Library', 'personal-no-owner', 'PERSONAL')`),
      (error) => error.code === "23514",
      "PERSONAL workspaces require an owner",
    );
    await assert.rejects(
      client.query(`INSERT INTO "organization" ("id", "name", "slug", "type", "ownerUserId") VALUES ('school-with-owner', 'Invalid School', 'invalid-school', 'SCHOOL', 'owner-b')`),
      (error) => error.code === "23514",
      "SCHOOL organizations cannot have a personal owner",
    );
    await assert.rejects(
      client.query(`INSERT INTO "organization" ("id", "name", "slug", "type", "ownerUserId") VALUES ('duplicate-personal-owner', 'Second Library', 'second-personal-student-a', 'PERSONAL', 'student-a')`),
      (error) => error.code === "23505",
      "a user can own only one personal workspace",
    );

    await client.query(`
      INSERT INTO "Course" ("id", "userId", "slug", "organizationId") VALUES ('personal-course', 'student-a', 'personal-intro', 'personal-library');
      CREATE TABLE "certificate" ("id" TEXT PRIMARY KEY, "courseId" TEXT NULL);
      INSERT INTO "certificate" ("id", "courseId") VALUES
        ('school-certificate', 'legacy-course'),
        ('personal-certificate', 'personal-course'),
        ('orphan-null-certificate', NULL),
        ('orphan-unknown-certificate', 'deleted-course');
    `);
    const certificateMigration = fs.readFileSync(path.join(__dirname, "../prisma/migrations/20261015030000_certificate_organization_type/migration.sql"), "utf8");
    await client.query(certificateMigration);
    const certificateBackfill = await client.query(`SELECT "id", "organizationTypeSnapshot" FROM "certificate" ORDER BY "id"`);
    assert.deepEqual(certificateBackfill.rows, [
      { id: "orphan-null-certificate", organizationTypeSnapshot: null },
      { id: "orphan-unknown-certificate", organizationTypeSnapshot: null },
      { id: "personal-certificate", organizationTypeSnapshot: "PERSONAL" },
      { id: "school-certificate", organizationTypeSnapshot: "SCHOOL" },
    ], "linked certificates retain their source organization while orphaned certificates stay private/unknown");

    const backfill = await client.query(`
      SELECT o."slug" AS org_slug, c."slug" AS course_slug,
        owner."role" AS owner_role, teacher."role" AS teacher_role, student."role" AS student_role
      FROM "Course" c JOIN "organization" o ON o."id" = c."organizationId"
      JOIN "organization_membership" owner ON owner."organizationId" = o."id" AND owner."userId" = 'owner-a'
      JOIN "organization_membership" teacher ON teacher."organizationId" = o."id" AND teacher."userId" = 'teacher-a'
      JOIN "organization_membership" student ON student."organizationId" = o."id" AND student."userId" = 'student-a'
      WHERE c."id" = 'legacy-course'
    `);
    assert.deepEqual(backfill.rows[0], { org_slug: "legacy-school", course_slug: "intro", owner_role: "OWNER", teacher_role: "TEACHER", student_role: "STUDENT" });
    assert.equal((await client.query(`SELECT "id" FROM "Enrollment" WHERE "id" = 'legacy-enrollment'`)).rowCount, 1, "legacy enrollment remains untouched");

    await client.query(`
      INSERT INTO "organization" ("id", "name", "slug") VALUES ('school-b', 'School B', 'school-b');
      INSERT INTO "organization_membership" ("organizationId", "userId", "role") VALUES ('school-b', 'owner-b', 'OWNER');
      INSERT INTO "Course" ("id", "userId", "slug", "organizationId") VALUES ('course-b', 'owner-b', 'intro', 'school-b');
    `);
    const sameSlug = await client.query(`SELECT o."slug" AS org_slug, c."id" FROM "Course" c JOIN "organization" o ON o."id" = c."organizationId" WHERE c."slug" = 'intro' ORDER BY o."slug"`);
    assert.deepEqual(sameSlug.rows, [{ org_slug: "legacy-school", id: "legacy-course" }, { org_slug: "school-b", id: "course-b" }]);

    const teacherBRead = await client.query(`
      SELECT c."id" FROM "Course" c JOIN "organization" o ON o."id" = c."organizationId"
      JOIN "organization_membership" m ON m."organizationId" = o."id" AND m."userId" = 'teacher-a'
      WHERE o."slug" = 'school-b' AND c."slug" = 'intro'
    `);
    assert.equal(teacherBRead.rowCount, 0, "a teacher from school A cannot resolve school B course via matching slug");

    const canTeach = async () => client.query(`
      SELECT c."id" FROM "Course" c
      JOIN "course_instructor" ci ON ci."courseId" = c."id" AND ci."userId" = 'teacher-a'
      JOIN "organization_membership" m ON m."organizationId" = c."organizationId" AND m."userId" = ci."userId" AND m."role" = 'TEACHER'
      WHERE c."id" = 'legacy-course'
    `);
    assert.equal((await canTeach()).rowCount, 1, "assigned active school teacher can author");
    await client.query(`UPDATE "organization_membership" SET "role" = 'STUDENT' WHERE "organizationId" = (SELECT "organizationId" FROM "Course" WHERE "id" = 'legacy-course') AND "userId" = 'teacher-a'`);
    assert.equal((await canTeach()).rowCount, 0, "teacher downgrade revokes stale instructor assignment");
    await client.query(`UPDATE "organization_membership" SET "role" = 'TEACHER' WHERE "organizationId" = (SELECT "organizationId" FROM "Course" WHERE "id" = 'legacy-course') AND "userId" = 'teacher-a'`);
    await client.query(`DELETE FROM "organization_membership" WHERE "organizationId" = (SELECT "organizationId" FROM "Course" WHERE "id" = 'legacy-course') AND "userId" = 'teacher-a'`);
    assert.equal((await canTeach()).rowCount, 0, "removed teacher cannot author with a stale instructor row");

    const tokenHash = "sha256-test-token-hash";
    await client.query(`INSERT INTO "organization_invitation" ("id", "organizationId", "email", "role", "tokenHash", "expiresAt", "createdById") VALUES ('invite-b', 'school-b', 'new-student@example.test', 'STUDENT', $1, NOW() + INTERVAL '1 day', 'owner-b')`, [tokenHash]);
    const wrongIdentity = await client.query(`SELECT id FROM "organization_invitation" WHERE "tokenHash" = $1 AND lower(email) = lower($2) AND "acceptedAt" IS NULL AND "expiresAt" > NOW()`, [tokenHash, "someone-else@example.test"]);
    assert.equal(wrongIdentity.rowCount, 0);
    assert.equal((await client.query(`SELECT 1 FROM "organization_membership" WHERE "organizationId" = 'school-b' AND "userId" = 'student-a'`)).rowCount, 0, "failed claim leaves no partial membership");

    await client.query("BEGIN");
    try {
      const claimed = await client.query(`UPDATE "organization_invitation" SET "acceptedAt" = NOW() WHERE "id" = 'invite-b' AND "acceptedAt" IS NULL AND "expiresAt" > NOW() RETURNING "organizationId", "role"`);
      assert.equal(claimed.rowCount, 1);
      await client.query(`INSERT INTO "organization_membership" ("organizationId", "userId", "role") VALUES ($1, 'student-a', $2) ON CONFLICT ("organizationId", "userId") DO NOTHING`, [claimed.rows[0].organizationId, claimed.rows[0].role]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    assert.equal((await client.query(`SELECT 1 FROM "organization_membership" WHERE "organizationId" = 'school-b' AND "userId" = 'student-a' AND "role" = 'STUDENT'`)).rowCount, 1);
    const secondClaim = await client.query(`UPDATE "organization_invitation" SET "acceptedAt" = NOW() WHERE "id" = 'invite-b' AND "acceptedAt" IS NULL AND "expiresAt" > NOW()`);
    assert.equal(secondClaim.rowCount, 0, "invitation is one-time");

    await client.query(`INSERT INTO "organization_invitation" ("id", "organizationId", "email", "role", "tokenHash", "expiresAt", "createdById") VALUES ('invite-expired', 'school-b', 'late-student@example.test', 'STUDENT', 'expired-token-hash', NOW() - INTERVAL '1 day', 'owner-b')`);
    const expiredClaim = await client.query(`UPDATE "organization_invitation" SET "acceptedAt" = NOW() WHERE "id" = 'invite-expired' AND "acceptedAt" IS NULL AND "expiresAt" > NOW() RETURNING "organizationId", "role"`);
    assert.equal(expiredClaim.rowCount, 0);
    assert.equal((await client.query(`SELECT 1 FROM "organization_membership" WHERE "organizationId" = 'school-b' AND "userId" = 'late-student'`)).rowCount, 0, "expired claim leaves no partial membership");
  } finally {
    try { await client.query("ROLLBACK"); } catch { /* no active transaction */ }
    try { await client.query(`DROP SCHEMA IF EXISTS ${q(schema)} CASCADE`); }
    finally { await client.end(); }
  }
});
