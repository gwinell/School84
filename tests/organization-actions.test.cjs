/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

function loadOrganizationActions(mocks) {
  const filename = path.join(__dirname, "../app/data/organization/actions.ts");
  const source = fs.readFileSync(filename, "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const testModule = { exports: {} };
  new Function("require", "module", "exports", js)((name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name === "@/lib/organization/access-policy") {
      const policySource = fs.readFileSync(path.join(__dirname, "../lib/organization/access-policy.ts"), "utf8");
      const policyJs = ts.transpileModule(policySource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
      const policyModule = { exports: {} };
      new Function("module", "exports", policyJs)(policyModule, policyModule.exports);
      return policyModule.exports;
    }
    if (name === "@/lib/responses") return {
      errorResponse: (message, data) => ({ status: "error", message, data }),
      successResponse: (message, data) => ({ status: "success", message, data }),
    };
    if (name === "@/app/data/organization/authorization") return {
      requireOrganizationRole: async () => ({ session: { user: { id: "owner", role: "user" } }, membership: { role: "OWNER" } }),
    };
    if (name === "./authorization") return {
      requireOrganizationRole: async () => ({ session: { user: { id: "owner", role: "user" } }, membership: { role: "OWNER" } }),
    };
    if (name === "@/lib/formatSlug") return { deriveCourseSlug: (value) => value.toLowerCase().replaceAll(" ", "-") };
    if (name === "@/lib/env") return { env: { BETTER_AUTH_URL: "https://school.example.test" } };
    if (name === "next/cache") return { revalidatePath() {} };
    if (name === "server-only") return {};
    return require(name);
  }, testModule, testModule.exports);
  return testModule.exports;
}

test("removing any school role cancels stale enrollments and expires pending school/course invites transactionally", async () => {
  for (const role of ["STUDENT", "TEACHER", "ADMIN"]) {
    const events = [];
    const prisma = {
      organizationMembership: {
        findUnique: async () => ({ role, user: { email: "Learner@Example.test" } }),
      },
      $transaction: async (callback) => callback({
        course: { findMany: async () => [{ id: "course-a" }, { id: "course-b" }] },
        enrollment: { updateMany: async (query) => { events.push(["cancel-enrollment", query]); return { count: 2 }; } },
        studentNotification: { deleteMany: async (query) => { events.push(["delete-notifications", query]); } },
        courseInvitation: { updateMany: async (query) => { events.push(["expire-invites", query]); } },
        organizationInvitation: { updateMany: async (query) => { events.push(["expire-school-invites", query]); } },
        organizationMembership: { delete: async (query) => { events.push(["remove-membership", query]); } },
        courseInstructor: { deleteMany: async (query) => { events.push(["remove-teacher-assignment", query]); } },
      }),
    };
    const actions = loadOrganizationActions({
      "@/lib/prisma": prisma,
      "@/app/data/user/require-user": { requireUser: async () => ({ user: { id: "owner", role: "user" } }) },
    });
    const result = await actions.removeOrganizationMember({ organizationId: "school-a", userId: "student-a" });
    assert.equal(result.status, "success", role);
    const eventsByName = Object.fromEntries(events);
    assert.deepEqual(events.map(([event]) => event), role === "TEACHER"
      ? ["cancel-enrollment", "delete-notifications", "expire-invites", "expire-school-invites", "remove-teacher-assignment", "remove-membership"]
      : ["cancel-enrollment", "delete-notifications", "expire-invites", "expire-school-invites", "remove-membership"]);
    assert.deepEqual(eventsByName["cancel-enrollment"].where, { userId: "student-a", courseId: { in: ["course-a", "course-b"] }, status: "Active" });
    assert.equal(eventsByName["expire-invites"].where.course.organizationId, "school-a");
    assert.deepEqual(eventsByName["expire-invites"].where.email, { equals: "Learner@Example.test", mode: "insensitive" });
    assert.equal(eventsByName["expire-invites"].where.acceptedAt, null);
    assert.equal(eventsByName["expire-school-invites"].where.organizationId, "school-a");
    assert.deepEqual(eventsByName["expire-school-invites"].where.email, { equals: "Learner@Example.test", mode: "insensitive" });
  }
});

test("unverified school invitation acceptance does not read or claim an invitation", async () => {
  let invitationReads = 0;
  let transactions = 0;
  const actions = loadOrganizationActions({
    "@/lib/prisma": {
      organizationInvitation: { findUnique: async () => { invitationReads++; return null; } },
      $transaction: async () => { transactions++; },
    },
    "@/app/data/user/require-user": { requireUser: async () => ({ user: { id: "oauth-user", role: "user", email: "school-admin@example.test", emailVerified: false } }) },
  });
  const result = await actions.acceptOrganizationInvitation("a".repeat(40));
  assert.equal(result.status, "error");
  assert.equal(invitationReads, 0);
  assert.equal(transactions, 0);
});

test("an expired school invitation cannot recreate membership after school removal", async () => {
  let transactions = 0;
  const actions = loadOrganizationActions({
    "@/lib/prisma": {
      organizationInvitation: { findUnique: async () => ({ id: "invite-a", organizationId: "school-a", email: "learner@example.test", role: "STUDENT", acceptedAt: null, expiresAt: new Date(Date.now() - 60_000) }) },
      $transaction: async () => { transactions++; },
    },
    "@/app/data/user/require-user": { requireUser: async () => ({ user: { id: "learner-a", role: "user", email: "learner@example.test", emailVerified: true } }) },
  });
  const result = await actions.acceptOrganizationInvitation("b".repeat(40));
  assert.equal(result.status, "error");
  assert.equal(transactions, 0);
});

test("school settings accept only a validated HTTPS logo and hex color, and revalidate old and new routes", async () => {
  const updates = [];
  const paths = [];
  const prisma = {
    organization: {
      findUnique: async () => ({ id: "school-a", slug: "old-school" }),
      findFirst: async () => null,
      update: async (query) => { updates.push(query); return { id: "school-a", name: "New School", slug: "new-school", logoUrl: "https://assets.example.test/logo.svg", primaryColor: "#124a73" }; },
    },
  };
  const actions = loadOrganizationActions({
    "@/lib/prisma": prisma,
    "@/app/data/user/require-user": { requireUser: async () => ({ user: { id: "admin", role: "user" } }) },
    "./authorization": { requireOrganizationRole: async (_id, roles) => { assert.deepEqual(roles, ["OWNER", "ADMIN"]); return { membership: { role: "ADMIN" } }; } },
    "next/cache": { revalidatePath: (route) => paths.push(route) },
  });
  const input = { organizationId: "school-a", name: "New School", slug: "new-school", logoUrl: "https://assets.example.test/logo.svg", primaryColor: "#124a73" };
  const result = await actions.updateOrganizationSettings(input);
  assert.equal(result.status, "success");
  assert.deepEqual(updates[0].data, { name: input.name, slug: input.slug, logoUrl: input.logoUrl, primaryColor: input.primaryColor });
  assert.equal(Object.hasOwn(updates[0].data, "memberships"), false);
  assert.ok(paths.includes("/schools/old-school"));
  assert.ok(paths.includes("/schools/new-school/courses"));
  assert.ok(paths.includes("/dashboard/schools/new-school"));

  for (const invalid of [
    { ...input, logoUrl: "http://assets.example.test/logo.svg" },
    { ...input, logoUrl: "https://user:pass@assets.example.test/logo.svg" },
    { ...input, primaryColor: "red" },
    { ...input, slug: "Bad Slug" },
  ]) {
    const rejected = await actions.updateOrganizationSettings(invalid);
    assert.equal(rejected.status, "error");
  }
  assert.equal(updates.length, 1, "invalid input must not write");
});

test("school settings reject a slug already used by another organization", async () => {
  let writes = 0;
  const actions = loadOrganizationActions({
    "@/lib/prisma": { organization: {
      findUnique: async () => ({ id: "school-a", slug: "old-school" }),
      findFirst: async (query) => { assert.deepEqual(query.where, { slug: "taken-school", id: { not: "school-a" } }); return { id: "school-b" }; },
      update: async () => { writes++; },
    } },
    "@/app/data/user/require-user": { requireUser: async () => ({ user: { id: "owner", role: "user" } }) },
  });
  const result = await actions.updateOrganizationSettings({ organizationId: "school-a", name: "New School", slug: "taken-school", logoUrl: "", primaryColor: "" });
  assert.equal(result.status, "error");
  assert.equal(writes, 0);
});

test("school settings translate a concurrent database slug collision into a form error", async () => {
  const actions = loadOrganizationActions({
    "@/lib/prisma": { organization: {
      findUnique: async () => ({ id: "school-a", slug: "old-school" }),
      findFirst: async () => null,
      update: async () => { throw Object.assign(new Error("unique constraint"), { code: "P2002" }); },
    } },
    "@/app/data/user/require-user": { requireUser: async () => ({ user: { id: "owner", role: "user" } }) },
  });
  const result = await actions.updateOrganizationSettings({ organizationId: "school-a", name: "New School", slug: "taken-school", logoUrl: null, primaryColor: null });
  assert.equal(result.status, "error");
  assert.match(result.message, /уже занят/);
});

test("school settings enforce the existing owner/admin authorization boundary", async () => {
  let databaseReads = 0;
  const actions = loadOrganizationActions({
    "@/lib/prisma": { organization: { findUnique: async () => { databaseReads++; } } },
    "@/app/data/user/require-user": { requireUser: async () => ({ user: { id: "member", role: "user" } }) },
    "./authorization": { requireOrganizationRole: async (_id, roles) => { assert.deepEqual(roles, ["OWNER", "ADMIN"]); throw new Error("REDIRECT"); } },
  });
  await assert.rejects(actions.updateOrganizationSettings({ organizationId: "school-a", name: "New School", slug: "new-school", logoUrl: "", primaryColor: "" }), /REDIRECT/);
  assert.equal(databaseReads, 0, "unauthorized callers must not inspect or modify school settings");
});
