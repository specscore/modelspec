import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { lstat, mkdir, readdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { OUT_NAMES } from '../src/config.mjs';
import { ASSETSIGNORE_TEXT, BUILD_MARKER, buildSite, loadData, prepareOutput } from '../src/site.mjs';
import { REPO, config, directoryJson, graphsJson, modelspecJson, productionConfig, read, sampleData, tempRoot } from './helpers.mjs';

const fixtureConfig = (root, name = 'dist-e2e') => ({ ...config(['--use-fixture', '--out', name], {}), outDir: join(root, name) });

test('a build is public/ plus registry/ plus build-info.json, and the landing page is public/index.html', async () => {
  const { root, cleanup } = await tempRoot();
  try {
    const data = sampleData();
    const result = await buildSite({ root, config: productionConfig(root), data });
    assert.equal(result.pages, 3);
    const dist = join(root, 'dist');
    assert.deepEqual((await readdir(dist)).sort(), ['.assetsignore', BUILD_MARKER, 'build-info.json', 'favicon.svg', 'index.html', 'registry', 'registry.css', 'script.js', 'style.css']);
    assert.equal(await read(dist, 'index.html'), await read(root, 'public', 'index.html'));
    for (const file of ['style.css', 'script.js', 'favicon.svg', 'registry.css']) assert.equal(await read(dist, file), await read(root, 'public', file));
    assert.ok(existsSync(join(dist, 'registry', 'index.html')));
    assert.ok(existsSync(join(dist, 'registry', 'models', 'chinook', 'index.html')));
    assert.equal(await read(dist, '.assetsignore'), ASSETSIGNORE_TEXT);
    assert.equal(ASSETSIGNORE_TEXT, `${BUILD_MARKER}\n`, 'only the marker stays out of the upload: build-info.json is served, the deploy workflow compares it');
    const info = JSON.parse(await read(dist, 'build-info.json'));
    assert.equal(info.production, true);
    assert.equal(info.outDir, 'dist');
    assert.equal(info.pages, 3);
    assert.deepEqual(info.models.map(m => m.id), ['chinook']);
    assert.equal(info.commit, null, 'a build without BUILD_COMMIT has no commit');
  } finally { await cleanup(); }
});

test('build-info.json records the commit of this repository and the checksum of each index it read', async () => {
  const { root, cleanup } = await tempRoot();
  try {
    const commit = 'c0ffee'.padEnd(40, '1');
    const data = sampleData();
    await buildSite({ root, config: { ...productionConfig(root), commit }, data });
    const info = JSON.parse(await read(join(root, 'dist'), 'build-info.json'));
    assert.equal(info.commit, commit);
    assert.deepEqual(info.checksums, { modelspec: data.modelspec.checksum, meaninggraph: data.meaninggraph.checksum, ovdbDirectory: data.directory.checksum });
    for (const checksum of Object.values(info.checksums)) assert.match(checksum, /^sha256:[0-9a-f]{64}$/);
  } finally { await cleanup(); }
});

test('a non-production build is marked in build-info.json and in every page, landing page included', async () => {
  const { root, cleanup } = await tempRoot();
  try {
    await buildSite({ root, config: fixtureConfig(root), data: sampleData() });
    const out = join(root, 'dist-e2e');
    const info = JSON.parse(await read(out, 'build-info.json'));
    assert.equal(info.production, false);
    assert.equal(info.fixture, true);
    assert.equal(info.mode, 'fixture');
    for (const page of ['index.html', 'registry/index.html', 'registry/models/chinook/index.html']) {
      const html = await read(out, page);
      assert.match(html, /<meta name="modelspec-build-source" content="fixture">/, page);
      assert.match(html, /<body>\s*<div class="build-banner"/, page);
    }
  } finally { await cleanup(); }
});

test('the build deletes only a directory it created, and never anything else', async () => {
  const { root, cleanup } = await tempRoot();
  try {
    const out = join(root, 'dist-e2e');
    await mkdir(out);
    await writeFile(join(out, 'precious.txt'), 'x');
    await assert.rejects(buildSite({ root, config: fixtureConfig(root), data: sampleData() }), /Refusing to delete .*not created by this build/);
    assert.equal(await read(out, 'precious.txt'), 'x');
    // an empty directory is fine, and so is the output of a previous build
    await (await import('node:fs/promises')).rm(join(out, 'precious.txt'));
    await buildSite({ root, config: fixtureConfig(root), data: sampleData() });
    await writeFile(join(out, 'stale.html'), 'stale');
    await buildSite({ root, config: fixtureConfig(root), data: sampleData() });
    assert.ok(!existsSync(join(out, 'stale.html')));
    assert.equal(await read(root, 'spec', 'keep.md'), 'keep');
    assert.ok(existsSync(join(root, 'public', 'index.html')));
  } finally { await cleanup(); }
});

test('prepareOutput accepts only the fixed names directly inside the root', async () => {
  const { root, cleanup } = await tempRoot();
  try {
    for (const name of OUT_NAMES) assert.equal(await prepareOutput(root, name), join(root, name));
    for (const bad of ['public', 'spec', '.', '..', '', '/tmp', 'dist/sub', '../dist', 'dist-other', join(root, 'dist')]) {
      await assert.rejects(prepareOutput(root, bad), /must be one of/, bad);
    }
    assert.ok(existsSync(join(root, 'public', 'index.html')));
    assert.ok(existsSync(join(root, 'spec', 'keep.md')));
  } finally { await cleanup(); }
});

test('an output name that is a symbolic link or a file is refused and its target is untouched', async () => {
  const { root, cleanup } = await tempRoot();
  try {
    await symlink(join(root, 'spec'), join(root, 'dist-e2e'));
    await assert.rejects(prepareOutput(root, 'dist-e2e'), /not a plain directory/);
    assert.ok(existsSync(join(root, 'spec', 'keep.md')));
    await writeFile(join(root, 'dist-check'), 'a file');
    await assert.rejects(prepareOutput(root, 'dist-check'), /not a plain directory/);
    assert.equal(await read(root, 'dist-check'), 'a file');
    assert.ok((await lstat(join(root, 'dist-e2e'))).isSymbolicLink());
  } finally { await cleanup(); }
});

test('a failed build leaves no output behind, not even the previous one', async () => {
  const { root, cleanup } = await tempRoot();
  try {
    await buildSite({ root, config: fixtureConfig(root), data: sampleData() });
    assert.ok(existsSync(join(root, 'dist-e2e', 'build-info.json')));
    const broken = { ...fixtureConfig(root), mode: 'local', sources: { ...fixtureConfig(root).sources, directory: { kind: 'local', location: join(root, 'missing.json') } } };
    await assert.rejects(buildSite({ root, config: broken }), /Cannot read the index file/);
    assert.ok(!existsSync(join(root, 'dist-e2e')));
  } finally { await cleanup(); }
});

test('an unreadable or invalid index fails loudly: no fallback, no output', async () => {
  const { root, cleanup } = await tempRoot();
  try {
    const prod = productionConfig(root);
    const down = async () => ({ ok: false, status: 503 });
    await assert.rejects(buildSite({ root, config: prod, readOptions: { fetchImpl: down, retries: 0 } }), /HTTP 503/);
    assert.ok(!existsSync(join(root, 'dist')));
    // one of three failing is enough
    const onlyDirectoryDown = async url => (url.includes('openvaultdb/directory')
      ? { ok: false, status: 404 }
      : { ok: true, text: async () => JSON.stringify(url.includes('modelspec-org') ? (await import('./helpers.mjs')).modelspecJson() : graphsJson()) });
    await assert.rejects(buildSite({ root, config: prod, readOptions: { fetchImpl: onlyDirectoryDown } }), /openvaultdb\/directory.*HTTP 404|HTTP 404/);
    assert.ok(!existsSync(join(root, 'dist')));
  } finally { await cleanup(); }
});

test('a fixture-marked index is refused by a production build', async () => {
  const { root, cleanup } = await tempRoot();
  try {
    const marked = async () => ({ ok: true, text: async () => JSON.stringify({ ...graphsJson(), _fixture: { note: 'x' } }) });
    await assert.rejects(loadData(productionConfig(root), { fetchImpl: marked }), /_fixture/);
  } finally { await cleanup(); }
});

test('a build whose ModelSpec index has a bad homepage fails and names the index', async () => {
  const { root, cleanup } = await tempRoot();
  try {
    for (const bad of ['http://chinookdb.com/', 42]) {
      const json = modelspecJson();
      json.models[0].homepage = bad;
      const served = async () => ({ ok: true, text: async () => JSON.stringify(json) });
      await assert.rejects(loadData(productionConfig(root), { fetchImpl: served }), /models\[0\]\.homepage must be .*\(index: https:\/\/raw\.githubusercontent\.com\/modelspec-org\/registry\/main\/index\.json\)/, String(bad));
    }
  } finally { await cleanup(); }
});

test('a build whose data lacks Chinook fails: the landing page says it is in all three layers', async () => {
  const { root, cleanup } = await tempRoot();
  try {
    await assert.rejects(buildSite({ root, config: fixtureConfig(root), data: sampleData({ directory: directoryJson({ databases: [] }) }) }), /Chinook is in all three/);
    assert.ok(!existsSync(join(root, 'dist-e2e', 'build-info.json')));
  } finally { await cleanup(); }
});

test('a public/ file that clashes with a generated one stops the build', async () => {
  const { root, cleanup } = await tempRoot();
  try {
    await mkdir(join(root, 'public', 'registry'));
    await assert.rejects(buildSite({ root, config: fixtureConfig(root), data: sampleData() }), /public\/registry clashes/);
  } finally { await cleanup(); }
});

test('the two-databases fixture build lists both databases on the model page', async () => {
  const { root, cleanup } = await tempRoot();
  try {
    const c = { ...config(['--use-fixture', '--fixture-set', 'two-databases', '--out', 'dist-e2e-two'], {}), outDir: join(root, 'dist-e2e-two') };
    await buildSite({ root, config: c });
    const html = await read(root, 'dist-e2e-two', 'registry', 'models', 'chinook', 'index.html');
    assert.match(html, /data-database="chinook"/);
    assert.match(html, /data-database="chinook-second-host"/);
    assert.match(html, /Databases using this model <span class="reg-count">2<\/span>/);
    assert.match(html, /second-host\.example\.com/);
    assert.match(html, /git\.example\.com\/second-host\/chinook-hosting/);
  } finally { await cleanup(); }
});

test('CLI: an unreachable index fails with exit 1 and writes nothing', () => {
  const env = { ...process.env, MODELSPEC_REGISTRY_INDEX_URL: 'https://127.0.0.1:9/index.json' };
  delete env.MEANINGGRAPH_BASE_URL;
  const run = spawnSync(process.execPath, [join(REPO, 'scripts/build.mjs')], { env, encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Build failed: Cannot read the index at https:\/\/127\.0\.0\.1:9\/index\.json/);
  assert.ok(!existsSync(join(REPO, 'dist-nonprod')));
});

test('CLI: --out dist is refused for a fixture build, and the output of a refused build is not touched', async () => {
  const run = spawnSync(process.execPath, [join(REPO, 'scripts/build.mjs'), '--use-fixture', '--out', 'dist'], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Refusing to write a fixture build into dist\//);
  const bad = spawnSync(process.execPath, [join(REPO, 'scripts/build.mjs'), '--use-fixture', '--out', 'public'], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(await readFile(join(REPO, 'public', 'index.html'), 'utf8'), /<title>ModelSpec/);
});

test('the by-address fixture build finds both databases by model address', async () => {
  const { root, cleanup } = await tempRoot();
  try {
    const c = { ...config(['--use-fixture', '--fixture-set', 'two-by-address', '--out', 'dist-e2e-address'], {}), outDir: join(root, 'dist-e2e-address') };
    await buildSite({ root, config: c });
    const html = await read(root, 'dist-e2e-address', 'registry', 'models', 'chinook', 'index.html');
    assert.match(html, /Databases using this model <span class="reg-count">2<\/span>/);
    assert.equal((html.match(/<dd>model address<\/dd>/g) ?? []).length, 2);
    assert.doesNotMatch(html, /<dd>repository and model file<\/dd>/);
  } finally { await cleanup(); }
});

test('build-info.json holds no absolute local path', async () => {
  const { root, cleanup } = await tempRoot();
  try {
    await buildSite({ root, config: fixtureConfig(root), data: sampleData() });
    const text = await read(root, 'dist-e2e', 'build-info.json');
    assert.ok(!text.includes(root) && !/\/Users\/|\/home\/|\/private\//.test(text), text);
  } finally { await cleanup(); }
});
