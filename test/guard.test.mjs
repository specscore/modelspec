import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { DEFAULTS } from '../src/config.mjs';
import { MANIFEST_FILE, manifestProblems } from '../src/build-manifest.mjs';
import { pinnedIndexUrl } from '../src/index-commits.mjs';
import { BUILD_MARKER, buildSite } from '../src/site.mjs';
import { distProblems } from '../scripts/check-build.mjs';
import { CLOUDFLARE_ENV, CONFIG_OVERRIDES, EXISTING_FLAG, checkoutProblems, configOverrides, deploy, planDeploy, withoutCloudflare } from '../scripts/deploy.mjs';
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

test('deploy runs check, build, verification, then wrangler deploy with an absolute --config and --assets; it stops at the first failure', async () => {
  const calls = [];
  const run = (command, args) => { calls.push([command, ...args]); return 0; };
  await deploy({ argv: [], env: {}, root: '/repo', run, verify: async () => [], exists: () => false, log: () => {} });
  assert.deepEqual(calls.map(c => c[0].split('/').pop()), ['npm', 'node', 'wrangler']);
  assert.deepEqual(calls[1].slice(1), ['/repo/scripts/build.mjs', '--out', 'dist']);
  assert.deepEqual(calls[2], ['/repo/node_modules/.bin/wrangler', 'deploy', '--config', '/repo/wrangler.jsonc', '--assets', '/repo/dist']);

  const failing = name => (command, args) => (args.includes(name) ? 1 : 0);
  let ran = 0;
  await assert.rejects(deploy({ argv: [], env: {}, root: '/repo', run: (...a) => { ran++; return failing('check')(...a); }, verify: async () => [], exists: () => false, log: () => {} }), /check step failed/);
  assert.equal(ran, 1);
  await assert.rejects(deploy({ argv: [], env: {}, root: '/repo', run: () => 0, verify: async () => ['dist/ is a fixture build'], exists: () => false, log: () => {} }), /Refusing to deploy:\n  dist\/ is a fixture build/);
  const seen = [];
  await assert.rejects(deploy({ argv: [], env: {}, root: '/repo', run: (c, a) => { seen.push(a); return a.includes('--out') ? 1 : 0; }, verify: async () => [], exists: () => false, log: () => {} }), /build step failed/);
  assert.ok(!seen.some(a => a.includes('deploy')), 'wrangler never ran');
});

test('only the wrangler call gets the Cloudflare credentials: not the check, not the build', async () => {
  assert.deepEqual(CLOUDFLARE_ENV, ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']);
  assert.deepEqual(withoutCloudflare({ PATH: '/bin', CLOUDFLARE_API_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: 'a' }), { PATH: '/bin' });
  const calls = [];
  const env = { PATH: '/bin', CLOUDFLARE_API_TOKEN: 'secret-token', CLOUDFLARE_ACCOUNT_ID: 'account' };
  await deploy({ argv: [], env, root: '/repo', run: (command, args, stepEnv) => { calls.push({ args, env: stepEnv }); return 0; }, verify: async () => [], exists: () => false, log: () => {} });
  assert.equal(calls.length, 3);
  for (const call of calls.slice(0, 2)) assert.ok(!('CLOUDFLARE_API_TOKEN' in call.env) && !('CLOUDFLARE_ACCOUNT_ID' in call.env), `${call.args.join(' ')} has no credentials`);
  assert.equal(calls[2].env.CLOUDFLARE_API_TOKEN, 'secret-token');
  assert.equal(calls[2].env.CLOUDFLARE_ACCOUNT_ID, 'account');
});

const HEAD = 'a'.repeat(40);
// a fake git: HEAD is `head`, the working tree has the `dirty` porcelain lines
const fakeGit = ({ head = `${HEAD}\n`, dirty = '' } = {}) => args => {
  if (args[0] === 'rev-parse') {
    if (head instanceof Error) throw head;
    return head;
  }
  assert.deepEqual(args, ['status', '--porcelain', '--untracked-files=all']);
  if (dirty instanceof Error) throw dirty;
  return dirty;
};

test('--use-existing-build uploads the dist/ already built, after the same verification, and builds nothing', async () => {
  const calls = [];
  const env = { PATH: '/bin', CLOUDFLARE_API_TOKEN: 'secret-token' };
  const clean = { git: fakeGit(), recorded: () => HEAD };
  await deploy({ argv: [EXISTING_FLAG], env, root: '/repo', run: (command, args, stepEnv) => { calls.push([command, args, stepEnv]); return 0; }, verify: async () => [], exists: () => false, log: () => {}, ...clean });
  assert.equal(calls.length, 1, 'wrangler only: no check, no build');
  assert.deepEqual(calls[0][1], ['deploy', '--config', '/repo/wrangler.jsonc', '--assets', '/repo/dist']);
  assert.equal(calls[0][2].CLOUDFLARE_API_TOKEN, 'secret-token');
  // the guard is not weakened: a dist/ that is not a production build is refused, and wrangler never runs
  let ran = 0;
  await assert.rejects(deploy({ argv: [EXISTING_FLAG], env, root: '/repo', run: () => { ran++; return 0; }, verify: async () => ['dist/ is a fixture build'], exists: () => false, log: () => {}, ...clean }), /dist\/ is a fixture build/);
  assert.equal(ran, 0);
  // the other refusals still apply
  assert.throws(() => planDeploy([EXISTING_FLAG, '--assets', 'x'], {}), /takes no arguments/);
  assert.throws(() => planDeploy([EXISTING_FLAG], { OVDB_DIRECTORY_INDEX_URL: 'https://example.test/x.json' }), /Refusing to deploy while OVDB_DIRECTORY_INDEX_URL/);
  assert.equal(planDeploy([EXISTING_FLAG], {}).useExisting, true);
  assert.equal(planDeploy([], {}).useExisting, false);
  await assert.rejects(deploy({ argv: [EXISTING_FLAG], env: {}, root: '/repo', run: () => 0, verify: async () => [], exists: file => file.endsWith('wrangler.toml'), log: () => {}, ...clean }), /wrangler\.toml/);
});

test('--use-existing-build refuses a build whose marker commit is not HEAD, and a tree that is not clean, before anything is uploaded', async () => {
  const attempt = async options => {
    let ran = 0;
    const outcome = await deploy({ argv: [EXISTING_FLAG], env: {}, root: '/repo', run: () => { ran++; return 0; }, verify: async () => [], exists: () => false, log: () => {}, git: fakeGit(options), recorded: () => options.recorded ?? HEAD }).then(() => null, error => error.message);
    assert.equal(ran, outcome === null ? 1 : 0, 'wrangler runs only when nothing was refused');
    return outcome;
  };
  assert.equal(await attempt({}), null);
  assert.match(await attempt({ recorded: 'b'.repeat(40) }), /the build was made from bbbbbbbbbbbb, but HEAD is aaaaaaaaaaaa: build again/);
  assert.match(await attempt({ recorded: '' }), /made from no recorded commit/);
  assert.match(await attempt({ recorded: 'A'.repeat(40) }), /no recorded commit/, 'only a lower-case full commit counts');
  assert.match(await attempt({ dirty: ' M src/site.mjs\n' }), /the working tree is not clean \(1 changed or untracked file, for example " M src\/site\.mjs"\)/);
  assert.match(await attempt({ dirty: '?? stray.txt\n?? other.txt\n' }), /2 changed or untracked files/);
  assert.match(await attempt({ head: new Error('not a git repository') }), /git cannot tell which commit HEAD is/);
  assert.match(await attempt({ head: 'HEAD\n' }), /not a commit id for HEAD/);
  assert.match(await attempt({ dirty: new Error('boom') }), /cannot tell whether the working tree is clean/);
  assert.deepEqual(checkoutProblems(HEAD, fakeGit()), []);
  // without the flag the build is made in this very step: git is not asked
  let ran = 0;
  await deploy({ argv: [], env: {}, root: '/repo', run: () => { ran++; return 0; }, verify: async () => [], exists: () => false, log: () => {}, git: () => { throw new Error('git must not be asked'); }, recorded: () => 'b'.repeat(40) });
  assert.equal(ran, 3);
});

const PIN = { MODELSPEC_REGISTRY_INDEX_COMMIT: 'd'.repeat(40), MEANINGGRAPH_REGISTRY_INDEX_COMMIT: 'e'.repeat(40), OVDB_DIRECTORY_INDEX_COMMIT: 'f'.repeat(40) };

test('the deploy plan accepts, per index, the production URL or exactly the pinned URL of the same repository, and nothing else', () => {
  const plan = planDeploy([], { ...PIN, CLOUDFLARE_API_TOKEN: 't' });
  assert.deepEqual(plan.buildEnv, PIN, 'the commits reach the build; the token does not');
  const pinnedModelspec = pinnedIndexUrl('modelspec-org/registry', 'd'.repeat(40));
  assert.deepEqual(planDeploy([], { MODELSPEC_REGISTRY_INDEX_URL: pinnedModelspec }).buildEnv, { MODELSPEC_REGISTRY_INDEX_URL: pinnedModelspec }, 'a pinned URL is passed to the build');
  assert.deepEqual(planDeploy([], { OVDB_DIRECTORY_INDEX_URL: DEFAULTS.ovdbDirectoryIndex }).buildEnv, {}, 'the default is dropped');
  const refused = [
    pinnedIndexUrl('someone/registry', 'd'.repeat(40)), pinnedIndexUrl('meaninggraph/registry', 'd'.repeat(40)), 'https://raw.githubusercontent.com/modelspec-org/registry/some-branch/index.json',
    pinnedModelspec.replace('d'.repeat(40), 'd'.repeat(39)), pinnedModelspec.replace('d'.repeat(40), 'D'.repeat(40)), `${pinnedModelspec}?x=1`, pinnedModelspec.replace('raw.githubusercontent.com', 'raw.example.test'),
  ];
  for (const form of refused) assert.throws(() => planDeploy([], { MODELSPEC_REGISTRY_INDEX_URL: form }), /Refusing to deploy while MODELSPEC_REGISTRY_INDEX_URL is set to/, form);
  assert.throws(() => planDeploy([], { ...PIN, OVDB_DIRECTORY_INDEX_URL: DEFAULTS.ovdbDirectoryIndex }), /are both set; the commit names the URL/);
  assert.throws(() => planDeploy([], { MODELSPEC_REGISTRY_INDEX_COMMIT: 'd'.repeat(40) }), /without the commits of the other indexes/);
  assert.throws(() => planDeploy([], { ...PIN, OVDB_DIRECTORY_INDEX_COMMIT: 'F'.repeat(40) }), /must be 40 lower-case hex digits/);
});

const pinnedConfig = root => {
  const base = productionConfig(root);
  const sources = {
    modelspec: { kind: 'url', location: pinnedIndexUrl('modelspec-org/registry', 'd'.repeat(40)) },
    meaninggraph: { kind: 'url', location: pinnedIndexUrl('meaninggraph/registry', 'e'.repeat(40)) },
    directory: { kind: 'url', location: pinnedIndexUrl('openvaultdb/directory', 'f'.repeat(40)) },
  };
  return { ...base, sources, indexCommits: { modelspec: 'd'.repeat(40), meaninggraph: 'e'.repeat(40), ovdbDirectory: 'f'.repeat(40) } };
};

test('the guard accepts a production build that read the pinned URLs, and records their commits', async () => {
  const { root, cleanup } = await tempRoot();
  try {
    await buildSite({ root, config: pinnedConfig(root), data: sampleData() });
    assert.deepEqual(await distProblems(root), []);
    assert.deepEqual(JSON.parse(await read(root, 'dist', 'build-info.json')).indexCommits, { modelspec: 'd'.repeat(40), meaninggraph: 'e'.repeat(40), ovdbDirectory: 'f'.repeat(40) });
  } finally { await cleanup(); }
});

test('the guard refuses a build that read, for any index, a URL that is neither production nor the pinned URL of the same repository', async () => {
  for (const [key, bad] of [
    ['modelspec', pinnedIndexUrl('meaninggraph/registry', 'd'.repeat(40))],
    ['meaninggraph', 'https://raw.githubusercontent.com/meaninggraph/registry/some-branch/index.json'],
    ['ovdbDirectory', `${pinnedIndexUrl('openvaultdb/directory', 'f'.repeat(40))}?x=1`],
    ['ovdbDirectory', pinnedIndexUrl('fork/directory', 'f'.repeat(40))],
  ]) {
    const { root, cleanup } = await prodRoot();
    try {
      await rewriteInfo(root, info => { info.sources[key] = { kind: 'url', location: bad }; });
      assert.match((await distProblems(root)).join('\n'), new RegExp(`it read the ${key} index from`), `${key}: ${bad}`);
    } finally { await cleanup(); }
  }
});

test('a build writes the manifest last, and the guard checks it: an extra, a changed or a missing file stops the upload', async () => {
  const { root, cleanup } = await prodRoot();
  try {
    assert.deepEqual(await manifestProblems(join(root, 'dist')), []);
    assert.deepEqual(await distProblems(root), []);
    await writeFile(join(root, 'dist', 'registry', 'stray.html'), '<html></html>');
    assert.match((await distProblems(root)).join('\n'), /registry\/stray\.html is not in the build manifest: a file was added after the build/);
    await rm(join(root, 'dist', 'registry', 'stray.html'));
    const home = await read(root, 'dist', 'registry', 'index.html');
    await writeFile(join(root, 'dist', 'registry', 'index.html'), home.replace('</body>', '<script>evil()</script></body>'));
    assert.match((await distProblems(root)).join('\n'), /registry\/index\.html differs from the build manifest: it was changed after the build/);
    await writeFile(join(root, 'dist', 'registry', 'index.html'), home);
    await rm(join(root, 'dist', 'favicon.svg'));
    assert.match((await distProblems(root)).join('\n'), /favicon\.svg is in the build manifest but missing/);
  } finally { await cleanup(); }
});

test('a missing, malformed or foreign manifest is refused', async () => {
  for (const change of [
    root => rm(join(root, 'dist', MANIFEST_FILE)),
    root => writeFile(join(root, 'dist', MANIFEST_FILE), '{broken'),
    root => writeFile(join(root, 'dist', MANIFEST_FILE), JSON.stringify({ format: 'other', files: {} })),
  ]) {
    const { root, cleanup } = await prodRoot();
    try {
      await change(root);
      assert.match((await distProblems(root)).join('\n'), /build manifest|no readable|is not a modelspec-build-manifest\/1 manifest/);
    } finally { await cleanup(); }
  }
});

test('the build removes everything that was in its output directory before it wrote the new site', async () => {
  const { root, cleanup } = await prodRoot();
  try {
    await writeFile(join(root, 'dist', 'left-over.html'), 'from an earlier step');
    await mkdir(join(root, 'dist', 'old-dir'));
    await buildSite({ root, config: productionConfig(root), data: sampleData() });
    assert.deepEqual(await distProblems(root), []);
    assert.ok(!JSON.parse(await read(root, 'dist', MANIFEST_FILE)).files['left-over.html']);
  } finally { await cleanup(); }
});

test('deploy refuses a wrangler.json, wrangler.toml or .wrangler/deploy/config.json redirect before it builds or runs anything', async () => {
  for (const file of CONFIG_OVERRIDES) {
    let ran = 0;
    await assert.rejects(
      deploy({ argv: [], env: {}, root: '/repo', run: () => { ran++; return 0; }, verify: async () => [], exists: path => path === `/repo/${file}`, log: () => {} }),
      error => error.message.includes(file) && /Refusing to deploy/.test(error.message),
      file,
    );
    assert.equal(ran, 0, `nothing ran for ${file}`);
  }
  assert.deepEqual(CONFIG_OVERRIDES, ['wrangler.json', 'wrangler.toml', '.wrangler/deploy/config.json']);
});

test('configOverrides finds real files in a real directory', async () => {
  const { root, cleanup } = await tempRoot();
  try {
    assert.deepEqual(configOverrides(root), []);
    await writeFile(join(root, 'wrangler.json'), '{}');
    await mkdir(join(root, '.wrangler', 'deploy'), { recursive: true });
    await writeFile(join(root, '.wrangler', 'deploy', 'config.json'), '{"configPath":"x"}');
    assert.deepEqual(configOverrides(root), ['wrangler.json', '.wrangler/deploy/config.json']);
  } finally { await cleanup(); }
});

test('the real tree has none of those files, and the real wrangler binary is named from the repository root', () => {
  assert.deepEqual(configOverrides(REPO), [], 'a stray wrangler.json, wrangler.toml or redirect in this checkout');
});

test('the guard refuses a dist/ whose .assetsignore is not the one the build writes, or is missing', async () => {
  for (const [change, expected] of [
    [root => writeFile(join(root, 'dist', '.assetsignore'), `${BUILD_MARKER}\n${MANIFEST_FILE}\n*.json\n`), /\.assetsignore is not the one the build writes/],
    // build-info.json is what the deploy workflow compares: it must be uploaded
    [root => writeFile(join(root, 'dist', '.assetsignore'), `${BUILD_MARKER}\n${MANIFEST_FILE}\nbuild-info.json\n`), /\.assetsignore is not the one the build writes/],
    [root => rm(join(root, 'dist', '.assetsignore')), /\.assetsignore is missing/],
  ]) {
    const { root, cleanup } = await prodRoot();
    try {
      await change(root);
      assert.match((await distProblems(root)).join('\n'), expected);
    } finally { await cleanup(); }
  }
});
