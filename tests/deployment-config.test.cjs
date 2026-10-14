/* eslint-disable @typescript-eslint/no-require-imports -- execute the real TypeScript config with mocked public environment. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function imageConfig(endpoint, bucket) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', 'next.config.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, URL, require: () => ({ env: {
    AWS_ENDPOINT_URL_S3: endpoint, NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES: bucket,
  } }) });
  return exports.default;
}

test('local HTTP storage image allowlist preserves protocol, virtual bucket hostname, and port', () => {
  const config = imageConfig('http://host.docker.internal:9000', 'school84-local');
  assert.equal(config.output, 'standalone');
  assert.deepEqual(JSON.parse(JSON.stringify(config.images.remotePatterns)), [
    { protocol: 'http', hostname: 'school84-local.host.docker.internal', port: '9000' },
  ]);
});

test('remote HTTPS storage image allowlist permits only the configured bucket host', () => {
  const config = imageConfig('https://t3.storage.dev', 'private-course-media');
  assert.deepEqual(JSON.parse(JSON.stringify(config.images.remotePatterns)), [
    { protocol: 'https', hostname: 'private-course-media.t3.storage.dev', port: '' },
  ]);
});

test('unsupported storage protocols fail early instead of broadening image access', () => {
  assert.throws(() => imageConfig('ftp://storage.example.test', 'bucket'), /HTTP or HTTPS/);
});

test('fresh-install demo seed creates school memberships before the tenant-scoped course', () => {
  const seed = fs.readFileSync(path.join(__dirname, '..', 'scripts/local-admin.sql'), 'utf8');
  const organization = seed.indexOf('INSERT INTO organization (');
  const memberships = seed.indexOf('INSERT INTO organization_membership');
  const course = seed.indexOf('INSERT INTO "Course" (');

  assert.ok(organization >= 0 && memberships > organization && course > memberships);
  assert.match(seed, /SELECT organization\.id, "user"\.id, 'OWNER'/);
  assert.match(seed, /SELECT organization\.id, "user"\.id, 'STUDENT'/);
  assert.match(seed, /"organizationId", "createdAt", "updatedAt", "userId"/);
  assert.match(seed, /ON CONFLICT \("organizationId", slug\)/);
});
