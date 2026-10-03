import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULTS } from '../src/config.mjs';
import { BUILD_MARKER, buildSite } from '../src/site.mjs';
import { distProblems } from '../scripts/check-build.mjs';
import { deploy, planDeploy } from '../scripts/deploy.mjs';
import { REPO, config, productionConfig, read, sampleData, tempRoot } from './helpers.mjs';

const prodRoot = async () => {
  const t = await tempRoot();
  await buildSite({ root: t.root, config: productionConfig(t.root), data: sampleData() });
  return t;
};
const rewriteInfo = async (root, change) => {
  const info = JSON.parse(await read(root, 'dist', 'build-info.json'));
  change(info);
  await writeFile(join(root, 'dist', 'build-info.json'), JSON.stringify(info));
};

test('the guard accepts a production build of dist/', async () => {
  const { root, cleanup } = await prodRoot();
  try { assert.deepEqual(await distProblems(root), []); } finally { await cleanup(); }
});

test('the guard refuses a missing dist/', async () => {
  const { root, cleanup } = await tempRoot();
  try { assert.match((await distProblems(root))[0], /does not exist/); } finally { await cleanup(); }
});

test('the guard refuses a fixture build copied into dist/', async () => {
  const { root, cleanup } = await tempRoot();
  try {
    const fixture = { ...config(['--use-fixture', '--out', 'dist-e2e'], {}) };
    await buildSite({ root, config: fixture, data: sampleData() });
    await cp(join(root, 'dist-e2e'), join(root, 'dist'), { recursive: true });
    const problems = (await distProblems(root)).join('\n');
    assert.match(problems, /not a production build \(mode: fixture\)/);
    assert.match(problems, /built from fixtures/);
    assert.match(problems, /was not built from the production indexes/);
    assert.match(problems, /differs from public\/index\.html/);
  } finally { await cleanup(); }
});

test('the guard refuses a build that read another index, linked another site, or was never finished', async () => {
  const cases = [
    ['another modelspec index', i => { i.sources.modelspec = { kind: 'url-custom', location: 'https://raw.githubusercontent.com/x/y/b/index.json' }; }, /modelspec index/],
    ['a local directory index', i => { i.sources.ovdbDirectory = { kind: 'local', location: 'x.json' }; }, /ovdbDirectory index/],
    ['another MeaningGraph base', i => { i.meaningGraphBaseUrl = 'http://127.0.0.1:4010'; }, /MeaningGraph links go to/],
    ['another Directory base', i => { i.ovdbDirectoryBaseUrl = 'http://127.0.0.1:4011'; }, /OVDB Directory links go to/],
    ['not marked production', i => { i.production = false; i.mode = 'nonproduction'; }, /not a production build/],
    ['written elsewhere', i => { i.outDir = 'dist-e2e'; }, /written to dist-e2e/],
    ['wrong format', i => { i.format = 'other/1'; }, /build-info format/],
  ];
  for (const [name, change, expected] of cases) {
    const { root, cleanup } = await prodRoot();
    try {
      await rewriteInfo(root, change);
      assert.match((await distProblems(root)).join('\n'), expected, name);
    } finally { await cleanup(); }
  }
  const { root, cleanup } = await prodRoot();
  try {
    await rm(join(root, 'dist', 'build-info.json'));
    assert.match((await distProblems(root)).join('\n'), /no finished build/);
  } finally { await cleanup(); }
});

test('the guard refuses a dist/ that is not exactly public/ plus registry/', async () => {
  const mutate = [
    ['a second build inside', async root => { await mkdir(join(root, 'dist', 'dist-e2e')); await writeFile(join(root, 'dist', 'dist-e2e', 'build-info.json'), '{}'); }, /not part of the site/],
    ['a stray file', async root => writeFile(join(root, 'dist', 'notes.txt'), 'x'), /notes\.txt/],
    ['an edited landing page', async root => writeFile(join(root, 'dist', 'index.html'), '<html>other</html>'), /index\.html differs from public\/index\.html/],
    ['a stale landing page after public/ changed', async root => writeFile(join(root, 'public', 'index.html'), `${await read(root, 'public', 'index.html')}\n<!-- edited -->`), /index\.html differs/],
    ['a missing asset', async root => rm(join(root, 'dist', 'style.css')), /style\.css of public\/ is missing/],
    ['a page from another build', async root => writeFile(join(root, 'dist', 'registry', 'index.html'), '<html><meta name="modelspec-build-source" content="fixture"></html>'), /registry\/index\.html was not built from the production indexes/],
    ['no marker', async root => rm(join(root, 'dist', BUILD_MARKER)), /marker|was not created by this build/],
    ['a non-page file in registry/', async root => writeFile(join(root, 'dist', 'registry', 'data.json'), '{}'), /not pages/],
  ];
  for (const [name, change, expected] of mutate) {
    const { root, cleanup } = await prodRoot();
    try {
      await change(root);
      assert.match((await distProblems(root)).join('\n'), expected, name);
    } finally { await cleanup(); }
  }
});

test('CLI guard: refuses with exit 1 when publishing, only warns on wrangler dev', () => {
  const run = env => spawnSync(process.execPath, [join(REPO, 'scripts/check-build.mjs')], { env: { ...process.env, ...env }, encoding: 'utf8' });
  // The repository has no production dist/ unless someone built one; a missing one is refused too.
  const hasDist = spawnSync('test', ['-d', join(REPO, 'dist')]).status === 0;
  if (hasDist) return;
  const deployRun = run({ WRANGLER_COMMAND: 'deploy' });
  assert.equal(deployRun.status, 1);
  assert.match(deployRun.stderr, /Refusing to deploy dist\//);
  assert.equal(run({}).status, 1);
  const devRun = run({ WRANGLER_COMMAND: 'dev' });
  assert.equal(devRun.status, 0);
  assert.match(devRun.stderr, /NOT a production build \(local use only\)/);
  assert.equal(spawnSync(process.execPath, [join(REPO, 'scripts/check-build.mjs'), 'dist-e2e'], { encoding: 'utf8' }).status, 1);
});

test('wrangler.jsonc serves ./dist and runs the guard as its build command', async () => {
  const text = await read(REPO, 'wrangler.jsonc');
  assert.match(text, /"directory": "\.\/dist"/);
  assert.match(text, /"command": "node scripts\/check-build\.mjs"/);
  assert.doesNotMatch(text, /"directory": "\.?\/?public"/);
});

test('deploy refuses arguments, and any source, destination or link override', () => {
  assert.throws(() => planDeploy(['--assets', 'public'], {}), /takes no arguments/);
  assert.throws(() => planDeploy(['--dry-run'], {}), /takes no arguments/);
  assert.throws(() => planDeploy([], { MODELSPEC_REGISTRY_INDEX_URL: 'https://raw.githubusercontent.com/x/y/b/index.json' }), /MODELSPEC_REGISTRY_INDEX_URL/);
  assert.throws(() => planDeploy([], { MEANINGGRAPH_REGISTRY_INDEX_URL: 'https://example.com/i.json' }), /MEANINGGRAPH_REGISTRY_INDEX_URL/);
  assert.throws(() => planDeploy([], { OVDB_DIRECTORY_INDEX_URL: 'fixtures/x.json' }), /OVDB_DIRECTORY_INDEX_URL/);
  assert.throws(() => planDeploy([], { MEANINGGRAPH_BASE_URL: 'http://127.0.0.1:4010' }), /MEANINGGRAPH_BASE_URL/);
  assert.throws(() => planDeploy([], { OVDB_DIRECTORY_BASE_URL: 'https://example.com' }), /OVDB_DIRECTORY_BASE_URL/);
});

test('deploy passes the production values through and strips them from the build environment', () => {
  const { buildEnv } = planDeploy([], { PATH: '/bin', MEANINGGRAPH_BASE_URL: `${DEFAULTS.meaningGraphBaseUrl}/`, OVDB_DIRECTORY_INDEX_URL: DEFAULTS.ovdbDirectoryIndex, MODELSPEC_REGISTRY_INDEX_URL: '  ' });
  assert.deepEqual(buildEnv, { PATH: '/bin' });
});

test('deploy runs check, build, verification, then wrangler deploy without arguments; it stops at the first failure', async () => {
  const calls = [];
  const run = (command, args) => { calls.push([command.split('/').pop(), ...args]); return 0; };
  await deploy({ argv: [], env: {}, run, verify: async () => [], log: () => {} });
  assert.deepEqual(calls.map(c => c[0]), ['npm', 'node', 'wrangler']);
  assert.deepEqual(calls[1].slice(1).map(a => a.split('/').pop()), ['build.mjs', '--out', 'dist']);
  assert.deepEqual(calls[2], ['wrangler', 'deploy']);

  const failing = name => (command, args) => (args.includes(name) ? 1 : 0);
  let ran = 0;
  await assert.rejects(deploy({ argv: [], env: {}, run: (...a) => { ran++; return failing('check')(...a); }, verify: async () => [], log: () => {} }), /check step failed/);
  assert.equal(ran, 1);
  await assert.rejects(deploy({ argv: [], env: {}, run: () => 0, verify: async () => ['dist/ is a fixture build'], log: () => {} }), /Refusing to deploy:\n  dist\/ is a fixture build/);
  const seen = [];
  await assert.rejects(deploy({ argv: [], env: {}, run: (c, a) => { seen.push(a); return a.includes('--out') ? 1 : 0; }, verify: async () => [], log: () => {} }), /build step failed/);
  assert.ok(!seen.some(a => a.includes('deploy')), 'wrangler never ran');
});
