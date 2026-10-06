import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { checksumOf, COHORT_INPUTS, supportedCohort, markAsFixture, deriveTwoDatabases, deriveTwoByAddress } from '../tools/make-fixtures.mjs';
import { validateDirectoryIndex, validateModelspecIndex, validateMeaningGraphIndex } from '../src/indexes.mjs';
import { extractShell, renderSourcesPage, renderModelPage } from '../src/render.mjs';
import { buildSite, loadData } from '../src/site.mjs';
import { distProblems } from '../scripts/check-build.mjs';
import { deploy } from '../scripts/deploy.mjs';
import { config, productionConfig, tempRoot } from './helpers.mjs';

const read = name => readFile(new URL(`../fixtures/${name}.fixture.json`, import.meta.url), 'utf8').then(JSON.parse);
const raw = { modelspec: await read('modelspec-registry-index'), meaninggraph: await read('meaninggraph-registry-index'), directory: await read('ovdb-directory-index') };
const fx = { allowFixture: true, requireFixture: true };
const data = { modelspec: validateModelspecIndex(raw.modelspec, fx), meaninggraph: validateMeaningGraphIndex(raw.meaninggraph, fx), directory: validateDirectoryIndex(raw.directory, fx) };
const shell = extractShell(await readFile(new URL('../public/index.html', import.meta.url), 'utf8'));
const clone = value => structuredClone(value);
const changed = mutate => { const json = clone(raw.directory); mutate(json.sources); json.sourcesChecksum = checksumOf(json.sources); return json; };

// Generate expectations from the exact pinned descriptive fixture envelope.
test('all pinned discoveries render exact ID/action/status/explicit model-link sets', () => {
  assert.equal(raw.directory.sources.length, 19);
  assert.equal(raw.directory.sourcesChecksum, 'sha256:3495119b41585f8fd7b15c1ab6d2bb0723cef6be3d370ba119bd00dc7bda706a');
  const html = renderSourcesPage(data, productionConfig('.'), shell);
  assert.match(html, /canonical" href="https:\/\/modelspec.org\/registry\/sources\/"/);
  assert.match(html, /name="modelspec-build-source" content="production"/);
  assert.ok(html.includes(raw.directory.sourcesChecksum));
  assert.deepEqual([...html.matchAll(/data-source-id="([^"]+)"/g)].map(m => m[1]).sort(), raw.directory.sources.map(s => s.id).sort());
  assert.deepEqual([...html.matchAll(/class="reg-source-action" href="([^"]+)"/g)].map(m => m[1]).sort(), raw.directory.sources.map(s => `https://directory.openvaultdb.com/sources/${s.id}/`).sort());
  assert.equal((html.match(/>View source in OVDB Directory<\/a>/g) ?? []).length, raw.directory.sources.length);
  assert.equal((html.match(/No ModelSpec link declared/g) ?? []).length, raw.directory.sources.filter(s => !s.modelspec_url).length);
  assert.equal((html.match(/Declared model link:/g) ?? []).length, raw.directory.sources.filter(s => s.modelspec_url).length);
  assert.equal((html.match(/>Inactive<\/span>/g) ?? []).length, raw.directory.sources.length);
  assert.doesNotMatch(html, /reg-source-action[^>]*target=/);
  for (const model of data.modelspec.models) {
    const related = data.directory.sources.filter(s => s.modelId === model.id);
    const detail = renderModelPage(model, data, config(), shell);
    assert.equal((detail.match(/class="reg-source-link"/g) ?? []).length, related.length);
  }
});

test('every linked and unlinked source rejects invalid consumed metadata', () => {
  const mutations = [s => s.status = 'active', s => s.format = 'unknown', s => s.access_mode = 'available', s => s.id = '../escape', s => s.title = '', s => s.publisher = '', s => s.description = '', s => s.modelspec_url = 'javascript:alert(1)', s => s.modelspec_url = 'https://modelspec.org/registry/models/ror/?x=1'];
  for (let i = 0; i < raw.directory.sources.length; i++) for (const mutate of mutations) {
    assert.throws(() => validateDirectoryIndex(changed(sources => mutate(sources[i])), fx), /Invalid index/);
  }
  for (let i = 0; i < raw.directory.sources.length; i++) if (raw.directory.sources[i].format === 'ovdb-source/draft-2') {
    assert.throws(() => validateDirectoryIndex(changed(sources => sources[i].query_activation = 'active'), fx), /blocked/);
  }
  assert.throws(() => validateDirectoryIndex(changed(sources => sources[1].id = sources[0].id), fx), /duplicates/);
  assert.throws(() => validateDirectoryIndex({ ...raw.directory, sourcesChecksum: checksumOf([]) }, fx), /does not match/);
});

test('target status/title come from registry, escaped text cannot introduce bindings or executable markup', () => {
  const promoted = clone(data);
  const model = promoted.modelspec.models.find(m => m.id === 'ecb-daily');
  model.status = 'accepted'; model.title = 'Accepted registry title';
  const source = promoted.directory.sources.find(s => s.modelId === model.id);
  source.title = '<img src=x onerror=alert(1)> 雪'; source.publisher = '<script>oops</script>'; source.description = '<b>native</b>';
  const html = renderSourcesPage(promoted, config(), shell);
  assert.match(html, /Accepted registry title<\/a> <span[^>]*>accepted/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt; 雪/);
  assert.doesNotMatch(html, /<script>oops|<img src=x/);
  assert.match(html, /does not establish accepted native-field bindings or activate source access/);
  assert.equal(source.status, 'inactive');
});

test('legacy absent and explicit empty envelopes render truthful empty state', () => {
  for (const dir of [{ ...raw.directory, sources: undefined, sourcesChecksum: undefined }, { ...raw.directory, sources: [], sourcesChecksum: checksumOf([]) }]) {
    const parsed = validateDirectoryIndex(dir, fx);
    const html = renderSourcesPage({ ...data, directory: parsed }, config(), shell);
    assert.match(html, /No source discoveries in this index/);
    assert.doesNotMatch(html, /data-source-id=/);
    if (dir.sourcesChecksum) assert.ok(html.includes(dir.sourcesChecksum));
  }
});

test('fixture generator preserves envelope and reproduces committed derived variants and supported cohort', async () => {
  const unmark = json => { const copy = clone(json); delete copy._fixture; return copy; };
  const marked = markAsFixture('directory', unmark(raw.directory), COHORT_INPUTS.directory);
  assert.deepEqual(marked.sources, raw.directory.sources);
  assert.equal(marked.sourcesChecksum, raw.directory.sourcesChecksum);
  for (const [derive, name] of [[deriveTwoDatabases, 'two-databases'], [deriveTwoByAddress, 'two-by-address']]) {
    const generated = derive(raw.directory, 'fixtures/ovdb-directory-index.fixture.json');
    assert.deepEqual(generated, await read(`ovdb-directory-index.${name}`));
    validateDirectoryIndex(generated, fx);
    assert.deepEqual(generated.sources, raw.directory.sources);
    assert.equal(generated.sourcesChecksum, raw.directory.sourcesChecksum);
    const second = generated.databases.at(-1);
    assert.equal(second.id, 'https://acme.example.net/chinook/'); assert.equal(second.url, second.id);
    assert.equal(second.recordId, 'chinook-second-host'); assert.equal(second.localId, 'chinook');
    assert.equal(second.directoryPath, '/ovdb/acme.example.net/chinook/');
  }
  const regenerated = supportedCohort(raw, Object.fromEntries(Object.entries(raw).map(([kind, json]) => [kind, unmark(json)])));
  assert.deepEqual(regenerated, raw);
  assert.equal(raw.modelspec.models.length, 4); assert.equal(raw.meaninggraph.graphs.length, 5);
  for (const kind of ['modelspec', 'meaninggraph']) {
    assert.equal(raw[kind]._fixture.upstream, COHORT_INPUTS[kind]);
    assert.equal(raw[kind].checksum, checksumOf(raw[kind][kind === 'modelspec' ? 'models' : 'graphs']));
  }
});

test('pinned build reads exactly metadata indexes; provider paths on the same origin stay forbidden', async () => {
  const { root, cleanup } = await tempRoot();
  try {
    const cfg = productionConfig(root);
    for (const kind of Object.keys(raw)) cfg.sources[kind].location = COHORT_INPUTS[kind];
    const allowed = new Map(Object.entries(raw).map(([kind, json]) => { const copy = clone(json); delete copy._fixture; return [COHORT_INPUTS[kind], copy]; }));
    const calls = [];
    await buildSite({ root, config: cfg, readOptions: { fetchImpl: async url => {
      assert.ok(allowed.has(url), `unlisted URL/path: ${url}`); calls.push(url);
      return { ok: true, text: async () => JSON.stringify(allowed.get(url)) };
    } } });
    assert.deepEqual(calls.sort(), [...allowed.keys()].sort());
    for (const source of raw.directory.sources) if (source.resource_url) assert.ok(!calls.includes(source.resource_url));
    assert.equal(calls.some(url => /bigquery.*(?:jobs|queries)/.test(url)), false);
  } finally { await cleanup(); }
});

test('after success, Directory 403/timeout/invalid metadata remove deployable output and withhold upload', async () => {
  for (const failure of ['403', 'timeout', 'invalid']) {
    const { root, cleanup } = await tempRoot();
    try {
      const cfg = productionConfig(root);
      await buildSite({ root, config: cfg, data });
      assert.equal((await distProblems(root)).length, 0);
      const fetchImpl = async url => {
        const kind = url.includes('modelspec-org') ? 'modelspec' : url.includes('meaninggraph') ? 'meaninggraph' : 'directory';
        if (kind === 'directory' && failure === '403') return { ok: false, status: 403 };
        if (kind === 'directory' && failure === 'timeout') throw new Error('metadata timeout');
        const json = clone(raw[kind]); delete json._fixture;
        if (kind === 'directory') json.sourcesChecksum = checksumOf([]);
        return { ok: true, text: async () => JSON.stringify(json) };
      };
      await assert.rejects(buildSite({ root, config: cfg, readOptions: { fetchImpl, retries: 0 } }), /HTTP 403|timeout|does not match/);
      assert.equal(existsSync(join(root, 'dist', 'build-info.json')), false);
      assert.ok((await distProblems(root)).length > 0);
      const calls = [];
      await assert.rejects(deploy({ argv: [], env: {}, root, exists: () => false, run: (command, args) => { calls.push([command, args]); return args.includes('check') ? 0 : 1; }, log: () => {} }), /build step failed/);
      assert.equal(calls.some(([, args]) => args[0] === 'deploy'), false);
      // Explicit unknown model targets also fail cross-index validation.
      const json = changed(sources => sources[0].modelspec_url = 'https://modelspec.org/registry/models/missing/'); delete json._fixture;
      await assert.rejects(loadData(cfg, { fetchImpl: async url => ({ ok: true, text: async () => JSON.stringify(url.includes('directory') ? json : (() => { const j = clone(raw[url.includes('modelspec-org') ? 'modelspec' : 'meaninggraph']); delete j._fixture; return j; })()) }) }), /unknown ModelSpec model/);
    } finally { await cleanup(); }
  }
});
