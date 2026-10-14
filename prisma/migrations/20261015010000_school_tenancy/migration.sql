-- Tenant foundation. Existing installations are treated as one school and all
-- existing courses/users are attached to that school without changing course
-- content, enrollments, grades, or learner progress.
BEGIN;

DO $$ BEGIN
  CREATE TYPE "OrganizationRole" AS ENUM ('OWNER', 'ADMIN', 'TEACHER', 'STUDENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "organization" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "logoUrl" TEXT,
  "primaryColor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "organization_slug_key" ON "organization"("slug");

CREATE TABLE IF NOT EXISTS "organization_membership" (
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "OrganizationRole" NOT NULL DEFAULT 'STUDENT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_membership_pkey" PRIMARY KEY ("organizationId", "userId"),
  CONSTRAINT "organization_membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "organization_membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "organization_membership_userId_role_idx" ON "organization_membership"("userId", "role");

CREATE TABLE IF NOT EXISTS "organization_invitation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "OrganizationRole" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT NOT NULL,
  CONSTRAINT "organization_invitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "organization_invitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "organization_invitation_tokenHash_key" ON "organization_invitation"("tokenHash");
CREATE INDEX IF NOT EXISTS "organization_invitation_organizationId_email_idx" ON "organization_invitation"("organizationId", "email");
CREATE INDEX IF NOT EXISTS "organization_invitation_expiresAt_idx" ON "organization_invitation"("expiresAt");

INSERT INTO "organization" ("id", "name", "slug", "updatedAt")
VALUES ('legacy_school', 'Legacy School', 'legacy-school', CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
UPDATE "Course" SET "organizationId" = (SELECT "id" FROM "organization" WHERE "slug" = 'legacy-school')
WHERE "organizationId" IS NULL;
ALTER TABLE "Course" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Course" DROP CONSTRAINT IF EXISTS "Course_slug_key";
DROP INDEX IF EXISTS "Course_slug_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Course_organizationId_slug_key" ON "Course"("organizationId", "slug");
CREATE INDEX IF NOT EXISTS "Course_organizationId_createdAt_idx" ON "Course"("organizationId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "Course" ADD CONSTRAINT "Course_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Existing course owners become school owners; explicit instructors retain
-- course-level rights and receive teacher membership in the same school.
INSERT INTO "organization_membership" ("organizationId", "userId", "role")
SELECT DISTINCT c."organizationId", c."userId", 'OWNER'::"OrganizationRole"
FROM "Course" c
ON CONFLICT ("organizationId", "userId") DO NOTHING;

INSERT INTO "organization_membership" ("organizationId", "userId", "role")
SELECT DISTINCT c."organizationId", ci."userId", 'TEACHER'::"OrganizationRole"
FROM "course_instructor" ci JOIN "Course" c ON c."id" = ci."courseId"
ON CONFLICT ("organizationId", "userId") DO NOTHING;

INSERT INTO "organization_membership" ("organizationId", "userId", "role")
SELECT DISTINCT c."organizationId", e."userId", 'STUDENT'::"OrganizationRole"
FROM "Enrollment" e JOIN "Course" c ON c."id" = e."courseId"
ON CONFLICT ("organizationId", "userId") DO NOTHING;

COMMIT;
