/* eslint-disable @typescript-eslint/no-require-imports -- Node's built-in test runner uses CommonJS fixtures. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repository = path.join(__dirname, '..');

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'schoolsphere-local-install-'));
  const scripts = path.join(root, 'scripts');
  fs.mkdirSync(scripts);
  const home = path.join(root, 'home');
  fs.mkdirSync(home);
  fs.copyFileSync(path.join(repository, 'scripts/local-school.sh'), path.join(scripts, 'local-school.sh'));
  fs.chmodSync(path.join(scripts, 'local-school.sh'), 0o755);
  fs.copyFileSync(path.join(repository, 'docker-compose.yml'), path.join(root, 'docker-compose.yml'));
  fs.mkdirSync(path.join(root, 'fake-bin'));

  const dockerPath = path.join(root, 'fake-bin/docker');
  fs.writeFileSync(dockerPath, `#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$FAKE_DOCKER_LOG"
case "$*" in
  info|*compose*version*) exit 0 ;;
  *"pg_isready"*) exit 0 ;;
  *"SELECT count(*) FROM pg_tables"*)
    if [ -f "$FAKE_SCHEMA_STATE" ]; then printf '16\\n'; else printf '0\\n'; fi
    exit 0 ;;
  *"information_schema.tables"*) printf 't\\n'; exit 0 ;;
  *"--profile init-schema run"*) touch "$FAKE_SCHEMA_STATE"; exit 0 ;;
  *"--profile local-admin run"*)
    if [ ! -f "$FAKE_SEED_MARKER" ]; then touch "$FAKE_SEED_MARKER"; fi
    exit 0 ;;
  *"ps -q"*) printf 'fake-container\\n'; exit 0 ;;
  inspect*) printf 'healthy\\n'; exit 0 ;;
  *" up -d db"*) touch "$FAKE_VOLUME_STATE"; exit 0 ;;
  *) exit 0 ;;
esac
`);
  fs.chmodSync(dockerPath, 0o755);

  const browserPath = path.join(root, 'fake-bin/browser');
  fs.writeFileSync(browserPath, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$FAKE_BROWSER_LOG"\n');
  fs.chmodSync(browserPath, 0o755);

  const env = {
    ...process.env,
    HOME: home,
    DOCKER_BIN: dockerPath,
    BROWSER_BIN: browserPath,
    STARTUP_TIMEOUT_SECONDS: '2',
    FAKE_DOCKER_LOG: path.join(root, 'docker.log'),
    FAKE_BROWSER_LOG: path.join(root, 'browser.log'),
    FAKE_SCHEMA_STATE: path.join(root, 'fake-schema-ready'),
    FAKE_SEED_MARKER: path.join(root, 'fake-seed-marker'),
    FAKE_VOLUME_STATE: path.join(root, 'fake-db-volume'),
  };

  return {
    root,
    env,
    dockerLog: () => fs.existsSync(env.FAKE_DOCKER_LOG) ? fs.readFileSync(env.FAKE_DOCKER_LOG, 'utf8') : '',
    run: (action) => spawnSync(path.join(scripts, 'local-school.sh'), action ? [action] : [], {
      cwd: root,
      env,
      encoding: 'utf8',
      timeout: 15_000,
    }),
  };
}

function cleanup(fixture) {
  fs.rmSync(fixture.root, { recursive: true, force: true });
}

test('start explains how to install Docker when the command is missing', () => {
  const fixture = makeFixture();
  try {
    const missingDocker = path.join(fixture.root, 'not-installed/docker');
    const result = spawnSync(path.join(fixture.root, 'scripts/local-school.sh'), ['start'], {
      cwd: fixture.root,
      env: { ...fixture.env, DOCKER_BIN: missingDocker },
      encoding: 'utf8',
      timeout: 5_000,
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /Docker не найден/);
    assert.match(result.stderr + result.stdout, /Docker Desktop|Docker Engine/);
    assert.equal(fs.existsSync(path.join(fixture.root, '.env')), false);
  } finally {
    cleanup(fixture);
  }
});

test('fresh start initializes the environment in safe order and opens the local learner page', () => {
  const fixture = makeFixture();
  try {
    const fakeCompose = spawnSync(fixture.env.DOCKER_BIN, ['compose', 'version'], { env: fixture.env, encoding: 'utf8' });
    assert.equal(fakeCompose.status, 0, fakeCompose.stderr);
    const result = fixture.run('start');
    assert.equal(result.status, 0, `${result.stderr || result.stdout}\nDocker calls:\n${fixture.dockerLog()}`);

    const calls = fixture.dockerLog().trim().split('\n');
    const sandboxBuild = calls.findIndex((call) => call.includes('--profile build-image build python-sandbox-image'));
    const dbStart = calls.findIndex((call) => call.includes('up -d db'));
    const schemaCheck = calls.findIndex((call) => call.includes('SELECT count(*) FROM pg_tables'));
    const schemaInit = calls.findIndex((call) => call.includes('--profile init-schema run --build --rm schema-init'));
    const appStart = calls.findIndex((call) => call.includes('up --build -d app python-runner'));
    const seed = calls.findIndex((call) => call.includes('--profile local-admin run --rm local-admin'));

    assert.ok(sandboxBuild >= 0 && dbStart > sandboxBuild, 'build runner before starting the database');
    assert.ok(schemaCheck > dbStart && schemaInit > schemaCheck, 'check the database before initializing an empty schema');
    assert.ok(schemaInit < seed && seed < appStart, 'seed demo data only after schema initialization and before app exposure');
    assert.equal(fs.readFileSync(path.join(fixture.root, 'browser.log'), 'utf8').trim(), 'http://localhost:3001');
    assert.match(fs.readFileSync(path.join(fixture.root, '.env'), 'utf8'), /^DEMO_LOGIN_ENABLED=true$/m);
    assert.equal(fs.statSync(path.join(fixture.root, '.env')).mode & 0o777, 0o600, 'local secrets are private to the user');
    assert.equal(fs.existsSync(path.join(fixture.root, 'fake-seed-marker')), true);
  } finally {
    cleanup(fixture);
  }
});

test('start removes newly created secrets and explains a failed private-permissions check', () => {
  const fixture = makeFixture();
  try {
    const fakeChmod = path.join(fixture.root, 'fake-bin/chmod');
    fs.writeFileSync(fakeChmod, '#!/bin/sh\nexit 1\n');
    fs.chmodSync(fakeChmod, 0o755);

    const result = spawnSync(path.join(fixture.root, 'scripts/local-school.sh'), ['start'], {
      cwd: fixture.root,
      env: { ...fixture.env, PATH: `${path.dirname(fakeChmod)}:${process.env.PATH}` },
      encoding: 'utf8',
      timeout: 5_000,
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /не удалось защитить \.env/i);
    assert.equal(fs.existsSync(path.join(fixture.root, '.env')), false);
    assert.equal(fs.readdirSync(fixture.root).some((name) => name.startsWith('.env.tmp.')), false);
  } finally {
    cleanup(fixture);
  }
});

test('reopening an initialized install preserves settings, schema, and learner progress', () => {
  const fixture = makeFixture();
  try {
    const initial = fixture.run('start');
    assert.equal(initial.status, 0, `${initial.stderr || initial.stdout}\nDocker calls:\n${fixture.dockerLog()}`);

    const envPath = path.join(fixture.root, '.env');
    const envBefore = fs.readFileSync(envPath, 'utf8');
    const progressPath = path.join(fixture.root, 'fake-db-volume');
    fs.writeFileSync(progressPath, 'learner-progress=lesson-4\n');
    const seedMarkerBefore = fs.statSync(path.join(fixture.root, 'fake-seed-marker')).ino;

    const reopened = fixture.run('start');
    assert.equal(reopened.status, 0, reopened.stderr || reopened.stdout);
    assert.equal(fs.readFileSync(envPath, 'utf8'), envBefore, '.env is left untouched on later starts');
    assert.equal(fs.readFileSync(progressPath, 'utf8'), 'learner-progress=lesson-4\n');
    assert.equal(fs.statSync(path.join(fixture.root, 'fake-seed-marker')).ino, seedMarkerBefore);

    const calls = fixture.dockerLog().trim().split('\n');
    const schemaRuns = calls.filter((call) => call.includes('--profile init-schema run --build --rm schema-init'));
    assert.equal(schemaRuns.length, 1, 'schema sync happens only for the initially empty database');
    const seedRuns = calls.filter((call) => call.includes('--profile local-admin run --rm local-admin'));
    assert.equal(seedRuns.length, 1, 'demo seed runs once on the initially empty database');
    assert.match(calls.join('\n'), /information_schema\.tables/);

    const seedSql = fs.readFileSync(path.join(repository, 'scripts/local-demo-seed.psql'), 'utf8');
    assert.match(seedSql, /school84_local_install_state/);
    assert.match(seedSql, /pg_advisory_xact_lock/);
    assert.match(seedSql, /state = 'demo_seed_pending_v1'/);
    assert.match(seedSql, /NOT EXISTS \([\s\S]*FROM "user"[\s\S]*FROM "Course"/);
    assert.match(seedSql, /BEGIN;[\s\S]*COMMIT;/);
    assert.match(seedSql, /Existing learner\/course data found; skipped demo seed/);
    assert.match(seedSql, /No fresh-install marker; skipped demo seed and left this database unchanged/);
  } finally {
    cleanup(fixture);
  }
});

test('existing SchoolSphere databases start without schema initialization or demo seeding', () => {
  const fixture = makeFixture();
  try {
    fs.writeFileSync(fixture.env.FAKE_SCHEMA_STATE, 'existing schema');
    fs.writeFileSync(fixture.env.FAKE_VOLUME_STATE, 'lesson-progress=module-3\n');

    const result = fixture.run('start');
    assert.equal(result.status, 0, `${result.stderr || result.stdout}\nDocker calls:\n${fixture.dockerLog()}`);
    const calls = fixture.dockerLog().trim().split('\n');
    assert.equal(calls.some((call) => call.includes('--profile init-schema run --build --rm schema-init')), false);
    assert.equal(calls.some((call) => call.includes('--profile local-admin run --rm local-admin')), false);
    assert.equal(calls.some((call) => call.includes('up --build -d app python-runner')), true);
    assert.equal(fs.readFileSync(fixture.env.FAKE_VOLUME_STATE, 'utf8'), 'lesson-progress=module-3\n');
  } finally {
    cleanup(fixture);
  }
});

test('stop only stops services and retains the persistent database volume and progress', () => {
  const fixture = makeFixture();
  try {
    const volumePath = path.join(fixture.root, 'fake-db-volume');
    fs.writeFileSync(volumePath, 'completed-lesson=lesson-2\n');

    const result = fixture.run('stop');
    assert.equal(result.status, 0, `${result.stderr || result.stdout}\nDocker calls:\n${fixture.dockerLog()}`);
    assert.equal(fs.readFileSync(volumePath, 'utf8'), 'completed-lesson=lesson-2\n');

    const calls = fixture.dockerLog().trim().split('\n');
    const composeCalls = calls.filter((call) => call.includes('compose --project-directory'));
    assert.equal(composeCalls.length, 1);
    assert.match(composeCalls[0], / stop$/);
    assert.doesNotMatch(composeCalls[0], /down|rm|volume|--volumes|-v(?:\s|$)/);
    assert.match(fs.readFileSync(path.join(repository, 'docker-compose.yml'), 'utf8'), /school84-db:/);
  } finally {
    cleanup(fixture);
  }
});

test('desktop launchers delegate to the supported start and stop actions', () => {
  const startCommand = fs.readFileSync(path.join(repository, 'Start SchoolSphere.command'), 'utf8');
  const stopCommand = fs.readFileSync(path.join(repository, 'Stop SchoolSphere.command'), 'utf8');
  const startBatch = fs.readFileSync(path.join(repository, 'Start SchoolSphere.bat'), 'utf8');
  const stopBatch = fs.readFileSync(path.join(repository, 'Stop SchoolSphere.bat'), 'utf8');
  const powershell = fs.readFileSync(path.join(repository, 'scripts/local-school.ps1'), 'utf8');

  assert.match(startCommand, /local-school\.sh start/);
  assert.match(stopCommand, /local-school\.sh stop/);
  assert.match(startBatch, /local-school\.ps1.*-Action Start/i);
  assert.match(stopBatch, /local-school\.ps1.*-Action Stop/i);
  assert.match(powershell, /\[ValidateSet\('Start', 'Stop'\)\]/);
  assert.match(powershell, /Invoke-Compose @\('stop'\)/);
  assert.doesNotMatch(powershell, /down\s+-v|volume\s+rm/i);
});
