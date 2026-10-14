/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

function load(file, mocks) {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const testModule = { exports: {} };
  new Function("require", "module", "exports", js)((name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name === "server-only") return {};
    if (name === "next/cache") return { revalidatePath() {} };
    if (name === "next/navigation") return { notFound() { throw Error("NOT_FOUND"); }, redirect(url) { throw Error(`REDIRECT:${url}`); } };
    if (name === "@/lib/responses") return { errorResponse: (message, data) => ({ status: "error", message, data }), successResponse: (message, data) => ({ status: "success", message, data }) };
    if (name === "@/app/data/teacher/require-course-teacher") return { requireCourseTeacher: async (courseId) => ({ session: { user: { id: "owner-a", role: "user" } }, course: { id: courseId, organizationId: "school-a", title: "Course" } }) };
    if (name === "@/app/data/teacher/require-teacher") return { requireTeacher: async () => ({ user: { id: "owner-a", role: "user" } }) };
    if (name === "@/app/data/organization/authorization") return { requireOrganizationRole: async () => ({ session: { user: { id: "owner-a", role: "user" } }, membership: { role: "OWNER" } }) };
    if (name === "@/app/data/user/require-user") return { requireUser: async () => ({ user: { id: "learner-b", role: "user", email: "b@example.test", emailVerified: true } }) };
    if (name === "@/lib/organization/access-policy") return { roleAfterTeacherAssignment: (role) => role === "OWNER" || role === "ADMIN" ? role : "TEACHER" };
    if (name === "@/app/data/teacher/get-managed-course-ids") return { getManagedCourseIds: async () => ["course-a"] };
    if (name === "@/lib/arcjet") return { __esModule: true, default: { withRule: () => ({ protect: async () => ({ isDenied: () => false }) }) }, fixedWindow: (rule) => rule };
    if (name === "@arcjet/next") return { request: async () => ({}) };
    if (name === "@/lib/env") return { env: { BETTER_AUTH_URL: "https://school.example.test", ARCJET_ENABLED: "false" } };
    if (name === "@/lib/resend") return { resend: { emails: { send: async () => ({}) } } };
    return require(name);
  }, testModule, testModule.exports);
  return testModule.exports;
}

test("direct course assignment refuses a learner from another school without writes", async () => {
  let enrollmentWrites = 0;
  let notificationWrites = 0;
  const subject = load("app/admin/courses/[courseId]/assignments/actions.ts", {
    "@/lib/prisma": {
      course: { findUnique: async () => ({ organizationId: "school-a" }) },
      user: { findUnique: async () => ({ id: "learner-b", role: "user" }) },
      organizationMembership: { findUnique: async () => null },
      $transaction: async () => { enrollmentWrites++; },
      studentNotification: { upsert: async () => { notificationWrites++; } },
    },
  });
  const result = await subject.assignCourseToStudent({ courseId: "course-a", userId: "learner-b", accessMode: "ALL_AT_ONCE" });
  assert.equal(result.status, "error");
  assert.equal(enrollmentWrites, 0);
  assert.equal(notificationWrites, 0);
});

test("assignment candidates are limited to STUDENT members of the current school", async () => {
  let candidateQuery;
  const subject = load("app/data/admin/admin-get-course-assignments.ts", {
    "@/app/data/teacher/require-course-teacher": { requireCourseTeacher: async () => ({ course: { organizationId: "school-a" } }) },
    "@/lib/prisma": {
      course: { findUnique: async () => ({ id: "course-a", title: "Course A", instructors: [], enrollment: [] }) },
      user: { findMany: async (query) => { candidateQuery = query; return []; } },
    },
  });
  await subject.adminGetCourseAssignments("course-a");
  assert.deepEqual(candidateQuery.where.organizationMemberships, { some: { organizationId: "school-a", role: "STUDENT" } });
});

test("cancelling a course enrollment expires any pending invitation for that course and email", async () => {
  let inviteUpdate;
  let enrollmentUpdate;
  const subject = load("app/admin/courses/[courseId]/assignments/actions.ts", {
    "@/lib/prisma": {
      user: { findUnique: async () => ({ email: "learner@example.test" }) },
      $transaction: async (callback) => callback({
        enrollment: { updateMany: async (query) => { enrollmentUpdate = query; return { count: 1 }; } },
        studentNotification: { deleteMany: async () => {} },
        courseInvitation: { updateMany: async (query) => { inviteUpdate = query; } },
      }),
    },
  });
  const result = await subject.cancelEnrollment({ courseId: "course-a", userId: "learner-a" });
  assert.equal(result.status, "success");
  assert.equal(enrollmentUpdate.where.userId, "learner-a");
  assert.equal(inviteUpdate.where.courseId, "course-a");
  assert.deepEqual(inviteUpdate.where.email, { equals: "learner@example.test", mode: "insensitive" });
  assert.equal(inviteUpdate.where.acceptedAt, null);
});

test("an expired course invitation cannot restore a cancelled enrollment", async () => {
  let writes = 0;
  const subject = load("app/admin/courses/[courseId]/assignments/actions.ts", {
    "@/app/data/user/require-user": { requireUser: async () => ({ user: { id: "learner-a", role: "user", email: "learner@example.test", emailVerified: true } }) },
    "@/lib/prisma": {
      courseInvitation: { findUnique: async () => ({ id: "invite-a", courseId: "course-a", email: "learner@example.test", acceptedAt: null, expiresAt: new Date(Date.now() - 60_000) }) },
      $transaction: async () => { writes++; },
    },
  });
  const result = await subject.acceptCourseInvitation("a".repeat(40));
  assert.equal(result.status, "error");
  assert.equal(writes, 0);
});
