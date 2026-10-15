BEGIN;

ALTER TABLE "certificate"
  ADD COLUMN "organizationTypeSnapshot" "OrganizationType";

-- Preserve the source organization for existing certificates while the course
-- relation is still available. Orphaned rows remain NULL and are hidden publicly.
UPDATE "certificate" AS c
SET "organizationTypeSnapshot" = organization."type"
FROM "Course" AS course
JOIN "organization" AS organization ON organization."id" = course."organizationId"
WHERE c."courseId" = course."id";

COMMIT;
