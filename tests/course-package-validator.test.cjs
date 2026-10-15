/* eslint-disable @typescript-eslint/no-require-imports -- Node's built-in test runner uses CommonJS in this repository. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const validator = path.join(root, "scripts/validate-course-package.cjs");
const fixture = path.join(root, "docs/examples/minimal-course.s84course");

test("reference package validates through the production archive parser", () => {
  const output = execFileSync(process.execPath, [validator, fixture], { cwd: root, encoding: "utf8" });
  assert.match(output, /Valid SchoolSphere course package/);
  assert.match(output, /Course: Python First Steps/);
  assert.match(output, /Chapters: 1; lessons: 1; cells: 3; assets: 0/);
});

test("validator rejects invalid archive data and reports usage errors", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "s84-validator-test-"));
  try {
    const invalidPackage = path.join(tempDir, "invalid.s84course");
    fs.writeFileSync(invalidPackage, "not a zip archive");
    const invalid = spawnSync(process.execPath, [validator, invalidPackage], { cwd: root, encoding: "utf8" });
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /Invalid course package/);

    const usage = spawnSync(process.execPath, [validator], { cwd: root, encoding: "utf8" });
    assert.equal(usage.status, 2);
    assert.match(usage.stderr, /Usage:/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
