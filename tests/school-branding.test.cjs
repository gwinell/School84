/* eslint-disable @typescript-eslint/no-require-imports -- load server actions and client components in isolation. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

function loadAction({ actorRole = "OWNER", actorSchool = "school-a", prisma, revalidated = [] } = {}) {
  const source = fs.readFileSync(path.join(__dirname, "../app/data/organization/actions.ts"), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const exports = {};
  const actionPrisma = {
    ...prisma,
    organization: {
      findUnique: async ({ where }) => ({ id: where.id, slug: "old-lyceum" }),
      findFirst: async () => null,
      update: async ({ where, data }) => ({ id: where.id, ...data }),
      ...prisma?.organization,
    },
  };
  const requireMock = (name) => {
    if (name === "server-only") return {};
    if (name === "@/lib/prisma") return actionPrisma;
    if (name === "@/app/data/user/require-user") return { requireUser: async () => ({ user: { id: "actor", role: "user" } }) };
    if (name === "./authorization" || name === "@/app/data/organization/authorization") {
      return { requireOrganizationRole: async (organizationId, roles) => {
        if (organizationId !== actorSchool || !roles.includes(actorRole)) {
          throw new Error("REDIRECT:/not-admin");
        }
        return { session: { user: { id: "actor", role: "user" } }, membership: { role: actorRole } };
      } };
    }
    if (name === "next/cache") return { revalidatePath: (value) => revalidated.push(value) };
    if (name === "@/lib/env") return { env: { BETTER_AUTH_URL: "https://school.example.test" } };
    if (name === "@/lib/formatSlug") return { deriveCourseSlug: (value) => value.toLowerCase().replaceAll(" ", "-") };
    if (name === "@/lib/organization/access-policy") return { canClaimOrganizationInvitation: () => false };
    if (name === "@/lib/responses") return {
      errorResponse: (message, data) => ({ status: "error", message, data }),
      successResponse: (message, data) => ({ status: "success", message, data }),
    };
    return require(name);
  };
  vm.runInNewContext(code, { exports, require: requireMock, console, Date, Promise, URL }, { filename: "organization/actions.ts" });
  return { exports, revalidated };
}

const validBrand = {
  organizationId: "school-a", name: "Лицей 5", slug: "lyceum-5",
  logoUrl: "https://cdn.example.test/lyceum.svg", primaryColor: "#1A6B8A",
};

function loadSchoolManagement({ saveBranding, toastMessages = [] }) {
  const state = [];
  const pending = [];
  let cursor = 0;
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
      return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
    },
    useTransition: () => [false, (callback) => {
      const transition = Promise.resolve().then(callback);
      pending.push(transition);
      return transition;
    }],
  };
  const actions = {
    createOrganization: async () => ({ status: "success" }),
    createOrganizationInvitation: async () => ({ status: "success", data: { inviteUrl: "https://school.example.test/invite/token" } }),
    removeOrganizationMember: async () => ({ status: "success" }),
    updateOrganizationMemberRole: async () => ({ status: "success" }),
    updateOrganizationBranding: saveBranding,
  };
  const modules = {
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "next/link": { default: "Link" },
    "lucide-react": new Proxy({}, { get: (_, property) => `${String(property)}Icon` }),
    "@/app/data/organization/actions": actions,
    "@/components/brand": { Brand: "Brand" },
    "@/components/ui/button": { Button: "Button" },
    "@/components/ui/input": { Input: "Input" },
    sonner: { toast: {
      error: (message) => toastMessages.push(["error", message]),
      success: (message) => toastMessages.push(["success", message]),
    } },
  };
  const source = fs.readFileSync(path.join(__dirname, "../app/dashboard/schools/_components/SchoolManagement.tsx"), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, console, Date, Set, Map, Object, URL,
    require: (name) => modules[name] ?? new Proxy({}, { get: (_, property) => String(property) }),
    window: { location: { reload() {} } },
  }, { filename: "SchoolManagement.tsx" });
  return {
    render: (props) => { cursor = 0; return exports.SchoolManagement(props); },
    flush: async () => { while (pending.length) await Promise.all(pending.splice(0)); },
  };
}

function treeNodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(treeNodes);
  return [tree, ...treeNodes(tree.props?.children)];
}
const treeText = (tree) => typeof tree === "string" || typeof tree === "number" ? String(tree)
  : Array.isArray(tree) ? tree.map(treeText).join(" ")
    : tree && typeof tree === "object" ? treeText(tree.props?.children) : "";

function loadTenantLayout({ organizations, reads }) {
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const prisma = { organization: {
    findUnique: async ({ where }) => { reads.push(where.slug); return organizations[where.slug] ?? null; },
    findFirst: async ({ where }) => { reads.push(where.slug); return organizations[where.slug] ?? null; },
  } };
  const modules = {
    "server-only": {},
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "@/lib/prisma": { __esModule: true, default: prisma },
    "@/components/brand": { Brand: "Brand" },
    "next/navigation": { notFound: () => { throw new Error("NOT_FOUND"); } },
  };
  const file = "app/(public)/schools/[organizationSlug]/layout.tsx";
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, console, Promise,
    require: (name) => modules[name] ?? require(name),
  }, { filename: file });
  return exports;
}

test("school owner can update the full brand config for exactly the selected school", async () => {
  const updates = [];
  const h = loadAction({ prisma: { organization: { update: async (input) => {
    updates.push(input);
    return { id: "school-a", ...validBrand };
  } } } });
  assert.equal(typeof h.exports.updateOrganizationBranding, "function", "branding update action is available");
  const result = await h.exports.updateOrganizationBranding(validBrand);
  assert.equal(result.status, "success");
  assert.equal(updates.length, 1);
  assert.equal(updates[0].where.id, "school-a");
  assert.deepEqual(JSON.parse(JSON.stringify(updates[0].data)), {
    name: validBrand.name, slug: validBrand.slug,
    logoUrl: validBrand.logoUrl, primaryColor: validBrand.primaryColor,
  });
  assert.ok(h.revalidated.some((route) => route.includes("school")), "school pages are revalidated after an update");
});

test("school admin can update branding, while a teacher cannot", async () => {
  let writes = 0;
  const prisma = { organization: { update: async () => { writes++; return {}; } } };
  const admin = loadAction({ actorRole: "ADMIN", prisma });
  const result = await admin.exports.updateOrganizationBranding(validBrand);
  assert.equal(result.status, "success");
  const teacher = loadAction({ actorRole: "TEACHER", prisma });
  await assert.rejects(teacher.exports.updateOrganizationBranding(validBrand), /REDIRECT:\/not-admin/);
  assert.equal(writes, 1, "unauthorized teacher performs no database write");
});

test("branding validation rejects executable or malformed logo URLs, CSS colors, and school slugs", async (t) => {
  const badValues = [
    ["javascript logo URL", { logoUrl: "javascript:alert(1)" }],
    ["data URL logo", { logoUrl: "data:image/svg+xml,<svg onload=alert(1)>" }],
    ["non-HTTPS remote logo", { logoUrl: "http://attacker.example/logo.svg" }],
    ["CSS injection color", { primaryColor: "red; background-image:url(https://attacker.test/x)" }],
    ["short color", { primaryColor: "#123" }],
    ["path traversal slug", { slug: "../other-school" }],
    ["URL-like slug", { slug: "school-a?redirect=https://evil.test" }],
    ["uppercase/noncanonical slug", { slug: "School A" }],
  ];
  for (const [label, override] of badValues) {
    await t.test(label, async () => {
      let writes = 0;
      const h = loadAction({ prisma: { organization: { update: async () => { writes++; return {}; } } } });
      const result = await h.exports.updateOrganizationBranding({ ...validBrand, ...override });
      assert.equal(result.status, "error");
      assert.equal(writes, 0, "invalid input must be rejected before persistence");
    });
  }
});

test("school A actor cannot change school B branding by submitting its organization id", async () => {
  let writes = 0;
  const h = loadAction({ actorSchool: "school-a", prisma: { organization: { update: async () => { writes++; return {}; } } } });
  await assert.rejects(h.exports.updateOrganizationBranding({ ...validBrand, organizationId: "school-b" }), /REDIRECT:\/not-admin/);
  assert.equal(writes, 0, "cross-school branding update is denied before persistence");
});

test("school A cannot claim school B's public slug or write any branding fields", async () => {
  let writes = 0;
  const h = loadAction({ prisma: { organization: {
    findFirst: async ({ where }) => where.slug === "school-b" ? { id: "school-b" } : null,
    update: async () => { writes++; return {}; },
  } } });
  const result = await h.exports.updateOrganizationBranding({ ...validBrand, slug: "school-b" });
  assert.equal(result.status, "error");
  assert.match(result.message, /адрес школы уже занят/i);
  assert.equal(writes, 0, "a slug owned by another tenant cannot reach the update query");
});

test("school management exposes brand fields and reports a successful save", async () => {
  const calls = [];
  const toasts = [];
  const h = loadSchoolManagement({
    saveBranding: async (input) => { calls.push(input); return { status: "success", message: "Оформление сохранено" }; },
    toastMessages: toasts,
  });
  const school = { id: "school-a", ...validBrand, role: "OWNER", members: [] };
  let tree = h.render({ schools: [school] });
  const fields = Object.fromEntries(treeNodes(tree).filter((node) => node.type === "Input" && node.props.id)
    .map((node) => [node.props.id, node]));
  for (const id of ["school-name-school-a", "school-slug-school-a", "school-logo-school-a", "school-color-school-a"]) {
    assert.ok(fields[id], `editable branding field ${id} is rendered`);
  }
  const values = {
    "school-name-school-a": "Новая школа",
    "school-slug-school-a": "new-school",
    "school-logo-school-a": "https://cdn.example.test/new-logo.svg",
    "school-color-school-a": "#123456",
  };
  for (const [id, value] of Object.entries(values)) {
    const input = treeNodes(tree).find((node) => node.type === "Input" && node.props.id === id);
    input.props.onChange({ target: { value } });
    tree = h.render({ schools: [school] });
  }
  const form = treeNodes(tree).find((node) => node.type === "form" && treeNodes(node).some((child) => child.props?.id === "school-slug-school-a"));
  assert.ok(form, "brand editor has a form enclosing all branding fields");
  assert.match(treeText(form), /Сохранить оформление/);
  form.props.onSubmit({ preventDefault() {} });
  await h.flush();
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{
    organizationId: "school-a", name: "Новая школа", slug: "new-school",
    logoUrl: "https://cdn.example.test/new-logo.svg", primaryColor: "#123456",
  }], `branding action should receive all edited fields; toasts: ${JSON.stringify(toasts)}`);
  assert.ok(toasts.some(([kind, message]) => kind === "success" && /оформление школы сохранено/i.test(message)), JSON.stringify(toasts));
});

test("school management displays server validation errors without reporting success", async () => {
  const toasts = [];
  const h = loadSchoolManagement({
    saveBranding: async () => ({ status: "error", message: "Этот адрес школы уже занят" }),
    toastMessages: toasts,
  });
  const school = { id: "school-a", ...validBrand, role: "ADMIN", members: [] };
  let tree = h.render({ schools: [school] });
  const input = treeNodes(tree).find((node) => node.type === "Input" && node.props.id === "school-logo-school-a");
  assert.ok(input, "admin can edit school branding");
  const form = treeNodes(tree).find((node) => node.type === "form" && treeNodes(node).some((child) => child.props?.id === "school-logo-school-a"));
  form.props.onSubmit({ preventDefault() {} });
  await h.flush();
  assert.ok(toasts.some(([kind, message]) => kind === "error" && message === "Этот адрес школы уже занят"));
  assert.ok(!toasts.some(([kind]) => kind === "success"), "failed saves are never presented as successful");
});

test("school management blocks an unsafe logo URL locally with actionable feedback", () => {
  const toasts = [];
  let calls = 0;
  const h = loadSchoolManagement({
    saveBranding: async () => { calls++; return { status: "success" }; },
    toastMessages: toasts,
  });
  const school = { id: "school-a", ...validBrand, role: "OWNER", members: [] };
  let tree = h.render({ schools: [school] });
  const logo = treeNodes(tree).find((node) => node.type === "Input" && node.props.id === "school-logo-school-a");
  logo.props.onChange({ target: { value: "javascript:alert(1)" } });
  tree = h.render({ schools: [school] });
  const form = treeNodes(tree).find((node) => node.type === "form" && treeNodes(node).some((child) => child.props?.id === "school-logo-school-a"));
  form.props.onSubmit({ preventDefault() {} });
  assert.equal(calls, 0, "client validation prevents unsafe logo values reaching the server action");
  assert.ok(toasts.some(([kind, message]) => kind === "error" && message === "Ссылка на логотип должна начинаться с HTTPS"), JSON.stringify(toasts));
});

test("public pages render each school's own brand and never reuse another tenant's identity", async () => {
  const reads = [];
  const schoolA = { id: "school-a", name: "Лицей 5", slug: "lyceum-5", logoUrl: "https://cdn.test/a.svg", primaryColor: "#124A73" };
  const schoolB = { id: "school-b", name: "Школа 42", slug: "school-42", logoUrl: "https://cdn.test/b.svg", primaryColor: "#9A2D43" };
  const layout = loadTenantLayout({ organizations: { "lyceum-5": schoolA, "school-42": schoolB }, reads });
  assert.equal(typeof layout.default, "function", "tenant public layout is present");
  const a = await layout.default({ params: Promise.resolve({ organizationSlug: "lyceum-5" }), children: "courses A" });
  const b = await layout.default({ params: Promise.resolve({ organizationSlug: "school-42" }), children: "courses B" });
  const aBrand = treeNodes(a).find((node) => node.type === "Brand");
  const bBrand = treeNodes(b).find((node) => node.type === "Brand");
  assert.deepEqual(JSON.parse(JSON.stringify(aBrand.props.brand)), schoolA);
  assert.deepEqual(JSON.parse(JSON.stringify(bBrand.props.brand)), schoolB);
  assert.ok(!treeText(a).includes(schoolB.name) && !treeText(b).includes(schoolA.name), "rendered pages do not leak another school's name");
  assert.deepEqual(reads, ["lyceum-5", "school-42"], "each request resolves branding by its own tenant slug");
});
