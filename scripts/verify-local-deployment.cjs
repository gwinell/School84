/* eslint-disable @typescript-eslint/no-require-imports -- this operator smoke script runs directly under Node. */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const containerName = process.argv[2] || 'school84-mvp-app-1';
const expectedImageId = process.argv[3];
const container = JSON.parse(execFileSync('docker', ['inspect', containerName], { encoding: 'utf8' }))[0];
assert.equal(container.State.Running, true, 'App must be running');
assert.equal(container.State.Health?.Status, 'healthy', 'App must be healthy');
assert.equal(container.Config.User, '1001:1001', 'App must run as the dedicated non-root user');
assert.equal(container.HostConfig.ReadonlyRootfs, true, 'App root filesystem must be read-only');
assert.ok(container.HostConfig.CapDrop.includes('ALL'), 'Linux capabilities must be dropped');
assert.ok(container.HostConfig.SecurityOpt.includes('no-new-privileges:true'), 'Privilege escalation must be disabled');
assert.ok(container.HostConfig.Memory > 0 && container.HostConfig.NanoCpus > 0 && container.HostConfig.PidsLimit > 0,
  'Memory, CPU and process limits must be configured');
assert.ok(Object.values(container.HostConfig.PortBindings).flat().every((p) => p.HostIp === '127.0.0.1'),
  'All published app ports must be loopback-only');
if (expectedImageId) assert.equal(container.Image, expectedImageId, 'Running app must use the reviewed image');
// Do not print runtime environment values: only compare the public storage config.
execFileSync('docker', ['exec', containerName, 'node', '-e', `
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const config = require('./.next/required-server-files.json').config;
  const endpoint = new URL(process.env.AWS_ENDPOINT_URL_S3);
  const pattern = config.images.remotePatterns[0];
  assert.equal(pattern.hostname, process.env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES + '.' + endpoint.hostname);
  assert.equal(pattern.protocol, endpoint.protocol.slice(0, -1));
  assert.equal(pattern.port, endpoint.port);
  assert.equal(config.output, 'standalone');
  assert.equal(fs.existsSync('/usr/local/lib/node_modules/npm'), false);
`], { stdio: 'pipe' });
console.log(`PASS ${containerName}: healthy, hardened, build/runtime storage agrees, reviewed image ${container.Image}`);
