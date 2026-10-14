/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

function loadAccessPolicy() {
  const source = fs.readFileSync(path.join(__dirname, "../lib/organization/access-policy.ts"), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const testModule = { exports: {} };
  new Function("module", "exports", js)(testModule, testModule.exports);
  return testModule.exports;
}

function loadCourseLinks() {
  const source = fs.readFileSync(path.join(__dirname, "../lib/organization/course-links.ts"), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const testModule = { exports: {} };
  new Function("module", "exports", js)(testModule, testModule.exports);
  return testModule.exports;
}

test("tenant staff permissions require membership in the course's resolved organization", () => {
  const { canManageCourse } = loadAccessPolicy();
  const tenantAOwner = { userRole: "user", membershipRole: "OWNER", isCourseInstructor: false };
  const tenantATeacher = { userRole: "user", membershipRole: "TEACHER", isCourseInstructor: true };

  assert.equal(canManageCourse(tenantAOwner), true);
  assert.equal(canManageCourse(tenantATeacher), true);
  // Resolving a course in school B returns no school-A membership, even if
  // the same actor is a teacher in school A or has the same course slug.
  assert.equal(canManageCourse({ ...tenantAOwner, membershipRole: null }), false);
  assert.equal(canManageCourse({ ...tenantATeacher, membershipRole: null }), false);
  assert.equal(canManageCourse({ userRole: "user", membershipRole: "TEACHER", isCourseInstructor: false }), false);
});

test("only a platform administrator bypasses tenant membership checks", () => {
  const { canManageCourse, roleAfterTeacherAssignment, canClaimOrganizationInvitation } = loadAccessPolicy();
  assert.equal(canManageCourse({ userRole: "admin", membershipRole: null, isCourseInstructor: false }), true);
  assert.equal(canManageCourse({ userRole: "teacher", membershipRole: null, isCourseInstructor: true }), false);
  assert.equal(canManageCourse({ userRole: "user", membershipRole: "STUDENT", isCourseInstructor: true }), false);
  assert.equal(roleAfterTeacherAssignment("OWNER"), "OWNER");
  assert.equal(roleAfterTeacherAssignment("ADMIN"), "ADMIN");
  assert.equal(roleAfterTeacherAssignment("STUDENT"), "TEACHER");
  assert.equal(roleAfterTeacherAssignment(null), "TEACHER");
  const validInvite = { emailVerified: true, accountEmail: "student@example.test", invitationEmail: " Student@example.test ", acceptedAt: null, expiresAt: new Date("2030-01-01T00:00:00Z"), now: new Date("2029-01-01T00:00:00Z") };
  assert.equal(canClaimOrganizationInvitation(validInvite), true);
  assert.equal(canClaimOrganizationInvitation({ ...validInvite, emailVerified: false }), false);
  assert.equal(canClaimOrganizationInvitation({ ...validInvite, accountEmail: "other@example.test" }), false);
  assert.equal(canClaimOrganizationInvitation({ ...validInvite, acceptedAt: new Date("2028-01-01T00:00:00Z") }), false);
  assert.equal(canClaimOrganizationInvitation({ ...validInvite, expiresAt: new Date("2028-01-01T00:00:00Z") }), false);
});

test("canonical course links include school identity, including lesson deep links", () => {
  const { publicCourseHref, dashboardCourseHref } = loadCourseLinks();
  assert.equal(publicCourseHref("school-a", "intro"), "/schools/school-a/courses/intro");
  assert.equal(publicCourseHref("school-b", "intro"), "/schools/school-b/courses/intro");
  assert.equal(dashboardCourseHref("school-a", "intro", "lesson/1"), "/dashboard/schools/school-a/courses/intro/lesson%2F1");
});

test("course slugs are unique within a school and legacy data maps into a single school", () => {
  const schema = fs.readFileSync(path.join(__dirname, "../prisma/schema.prisma"), "utf8");
  const migration = fs.readFileSync(path.join(__dirname, "../prisma/migrations/20261015010000_school_tenancy/migration.sql"), "utf8");
  assert.match(schema, /@@unique\(\[organizationId, slug\]\)/);
  assert.doesNotMatch(schema.match(/model Course \{([\s\S]*?)\n\}/)?.[1] ?? "", /slug\s+String\s+@unique/);
  assert.match(migration, /UPDATE "Course" SET "organizationId"/);
  assert.match(migration, /SELECT DISTINCT c\."organizationId", e\."userId", 'STUDENT'/);
  assert.doesNotMatch(migration, /TRUNCATE|DROP TABLE|DELETE FROM "Enrollment"/i);
});
