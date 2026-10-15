BEGIN;

CREATE TYPE "OrganizationType" AS ENUM ('SCHOOL', 'PERSONAL');

ALTER TABLE "organization"
  ADD COLUMN "type" "OrganizationType" NOT NULL DEFAULT 'SCHOOL',
  ADD COLUMN "ownerUserId" TEXT;

CREATE UNIQUE INDEX "organization_ownerUserId_key" ON "organization"("ownerUserId");

ALTER TABLE "organization"
  ADD CONSTRAINT "organization_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "organization_personal_owner_check"
  CHECK (("type" = 'PERSONAL' AND "ownerUserId" IS NOT NULL) OR ("type" = 'SCHOOL' AND "ownerUserId" IS NULL));

COMMIT;
