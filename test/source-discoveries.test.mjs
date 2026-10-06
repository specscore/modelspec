import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { validateDirectoryIndex } from '../src/indexes.mjs';
import { sourcesForModel, databasesForModel } from '../src/match.mjs';
import { extractShell, renderModelPage, renderRegistryPage } from '../src/render.mjs';
import { config, directoryJson, sampleData, modelspecJson, graphsJson, productionConfig, tempRoot } from './helpers.mjs';
import { loadData, buildSite, buildInfo } from '../src/site.mjs';
import { compareBuild, verifyLive } from '../src/freshness.mjs';

const source = (overrides = {}) => ({
  id: 'different-source-id', format: 'ovdb-source/draft-1', status: 'inactive',
  title: 'Source discovery', description: 'Native source metadata.', publisher: 'Source publisher',
  modelspec_url: 'https://modelspec.org/registry/models/chinook/', ...overrides,
});
const directory = sources => directoryJson({ databases: [], sources,
  sourcesChecksum: `sha256:${createHash('sha256').update(JSON.stringify(sources)).digest('hex')}` });

test('related sources use only explicit canonical model IDs, with independent source IDs', () => {
  const data = sampleData({ directory: directory([
    source(), source({ id: 'wrong', modelspec_url: 'https://modelspec.org/registry/models/other/' }),
    source({ id: 'chinook', title: 'Chinook', modelspec_url: undefined }),
  ]) });
  assert.deepEqual(sourcesForModel(data.modelspec.models[0], data.directory.sources).map(s => s.id), ['different-source-id']);
  assert.deepEqual(databasesForModel(data.modelspec.models[0], data.directory.databases), []);
});

test('absent and unlinked discovery metadata produces no related sources', () => {
  assert.deepEqual(validateDirectoryIndex(directoryJson()).sources, []);
  const data = sampleData({ directory: directory([source({ modelspec_url: undefined })]) });
  assert.deepEqual(sourcesForModel(data.modelspec.models[0], data.directory.sources), []);
});

test('model metadata URLs reject wrong origins, credentials, ports, traversal, escapes and suffixes', () => {
  for (const modelspec_url of [
    'https://modelspec.org.evil.example/registry/models/chinook/',
    'https://user@modelspec.org/registry/models/chinook/',
    'https://modelspec.org:443/registry/models/chinook/',
    'http://modelspec.org/registry/models/chinook/',
    'https://modelspec.org/registry/models/other/../chinook/',
    'https://modelspec.org/registry/models/%63hinook/',
    'https://modelspec.org/registry/models/chinook/?ref=x',
    'https://modelspec.org/registry/models/chinook/#x',
    'https://modelspec.org/registry/models/chinook', ['https://modelspec.org/registry/models/chinook/'],
  ]) assert.throws(() => validateDirectoryIndex(directory([source({ modelspec_url })])), /modelspec_url/);
});

test('source checksums and inactive trust boundary fail closed', () => {
  assert.throws(() => validateDirectoryIndex(directoryJson({ sourcesChecksum: 'sha256:' + '0'.repeat(64) })), /requires sources/);
  assert.throws(() => validateDirectoryIndex({ ...directory([source()]), sourcesChecksum: 'sha256:' + '0'.repeat(64) }), /does not match/);
  assert.throws(() => validateDirectoryIndex(directory([source({ status: 'active' })])), /inactive/);
  assert.throws(() => validateDirectoryIndex(directory([source(), source()])), /duplicates/);
});

test('source links render separately, escape metadata and preserve zero database counts', async () => {
  const data = sampleData({ directory: directory([source({ title: '<script>bad</script>', publisher: '<img>', description: '<b>metadata</b>' })]) });
  const shell = extractShell(await readFile(new URL('../public/index.html', import.meta.url), 'utf8'));
  const html = renderModelPage(data.modelspec.models[0], data, config(), shell);
  assert.match(html, /Related inactive source discoveries <span class="reg-count">1<\/span>/);
  assert.match(html, /href="https:\/\/directory.openvaultdb.com\/sources\/different-source-id\/"/);
  assert.match(html, /Databases using this model <span class="reg-count">0<\/span>/);
  assert.match(html, /do not establish native field bindings, database availability or query activation/);
  assert.match(html, /&lt;script&gt;bad&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>bad/);
  assert.match(renderRegistryPage(data, config(), shell), /0 databases/);
  const empty = sampleData({ directory: directory([]) });
  assert.match(renderModelPage(empty.modelspec.models[0], empty, config(), shell), /No inactive source discovery/);
});

const metadataFetch = sources => async url => ({ ok: true, text: async () => JSON.stringify(
  url.includes('modelspec-org') ? modelspecJson() : url.includes('meaninggraph') ? graphsJson() : {
    ...directory(sources), databases: directoryJson().databases,
  }) });

test('load and build reject explicit unknown registry targets, including injected build data', async () => {
  const { root, cleanup } = await tempRoot();
  try {
    const unknown = source({ modelspec_url: 'https://modelspec.org/registry/models/missing-model/' });
    const fetchImpl = metadataFetch([unknown]);
    const cfg = productionConfig(root);
    await assert.rejects(loadData(cfg, { fetchImpl }), /source different-source-id references unknown ModelSpec model missing-model/);
    await assert.rejects(buildSite({ root, config: cfg, readOptions: { fetchImpl } }), /unknown ModelSpec model missing-model/);
    await assert.rejects(buildSite({ root, config: cfg, data: sampleData({ directory: directory([unknown]) }) }), /unknown ModelSpec model missing-model/);
    const valid = await loadData(cfg, { fetchImpl: metadataFetch([
      source(), source({ id: 'another-source' }), source({ id: 'unlinked', modelspec_url: undefined }),
    ]) });
    assert.equal(sourcesForModel(valid.modelspec.models[0], valid.directory.sources).length, 2);
    await buildSite({ root, config: cfg, data: valid });
  } finally { await cleanup(); }
});

test('source-only metadata changes appear in page and build receipts and live verification', async () => {
  const shell = extractShell(await readFile(new URL('../public/index.html', import.meta.url), 'utf8'));
  const first = sampleData({ directory: directory([source()]) });
  const second = sampleData({ directory: directory([source({ title: 'Revised metadata' })]) });
  const cfg = { ...config(), commit: 'a'.repeat(40) };
  const before = buildInfo(cfg, first, '.', 3);
  const after = buildInfo(cfg, second, '.', 3);
  assert.equal(after.checksums.ovdbDirectory, before.checksums.ovdbDirectory);
  assert.equal(after.checksums.ovdbDirectorySources, second.directory.sourcesChecksum);
  assert.notEqual(after.checksums.ovdbDirectorySources, before.checksums.ovdbDirectorySources);
  for (const html of [renderModelPage(second.modelspec.models[0], second, cfg, shell), renderRegistryPage(second, cfg, shell)]) {
    assert.ok(html.includes(`OVDB Directory source metadata <code>${second.directory.sourcesChecksum}</code>`));
  }
  assert.equal(compareBuild({ live: before, commit: cfg.commit, checksums: after.checksums }).changed, true);
  const result = await verifyLive({ markerUrl: 'https://modelspec.org/build-info.json', built: after,
    fetch: async () => ({ ok: true, text: async () => JSON.stringify(before) }), delaysMs: [] });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.some(reason => reason.includes('ovdbDirectorySources')));
  assert.equal(Object.hasOwn(buildInfo(cfg, sampleData(), '.', 3).checksums, 'ovdbDirectorySources'), false);
});
