import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { validateDirectoryIndex } from '../src/indexes.mjs';
import { sourcesForModel, databasesForModel } from '../src/match.mjs';
import { extractShell, renderModelPage, renderRegistryPage } from '../src/render.mjs';
import { config, directoryJson, sampleData } from './helpers.mjs';

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
