import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { IndexError, baseAddress, loadIndex, readIndexText, repositoryKey, validateDirectoryIndex, validateMeaningGraphIndex, validateModelspecIndex } from '../src/indexes.mjs';
import { COMMIT, REPO, directoryJson, graphsJson, modelspecJson } from './helpers.mjs';

const fixture = async name => JSON.parse(await readFile(new URL(`../fixtures/${name}.fixture.json`, import.meta.url), 'utf8'));
const fixtureSync = name => JSON.parse(readFileSync(new URL(`../fixtures/${name}.fixture.json`, import.meta.url), 'utf8'));
const fx = { allowFixture: true, requireFixture: true };

test('the committed fixtures validate and carry the fixture marker', async () => {
  const ms = validateModelspecIndex(await fixture('modelspec-registry-index'), fx);
  const mg = validateMeaningGraphIndex(await fixture('meaninggraph-registry-index'), fx);
  const dir = validateDirectoryIndex(await fixture('ovdb-directory-index'), fx);
  const two = validateDirectoryIndex(await fixture('ovdb-directory-index.two-databases'), fx);
  assert.equal(ms.models[0].address, 'modelspec://github.com/datatug/chinookdb/chinook');
  assert.equal(ms.models[0].entities.length, 11);
  assert.deepEqual(mg.graphs.map(g => g.id), ['chinook', 'core']);
  assert.equal(dir.databases.length, 1);
  assert.equal(two.databases.length, 2);
  assert.ok(ms.fixture && mg.fixture && dir.fixture && two.fixture);
});

test('a fixture marker is refused outside fixture mode, and fixture mode requires it', async () => {
  const marked = await fixture('ovdb-directory-index');
  assert.throws(() => validateDirectoryIndex(marked), /_fixture.*--use-fixture/);
  assert.throws(() => validateDirectoryIndex(directoryJson(), { allowFixture: true, requireFixture: true }), /_fixture.*is missing/);
  for (const [validate, name] of [[validateModelspecIndex, 'modelspec-registry-index'], [validateMeaningGraphIndex, 'meaninggraph-registry-index']]) {
    assert.throws(() => validate(fixtureSync(name)), /_fixture/);
  }
});
test('the checksums of the committed fixtures match their lists', async () => {
  const { createHash } = await import('node:crypto');
  for (const [name, list] of [['modelspec-registry-index', 'models'], ['meaninggraph-registry-index', 'graphs'], ['ovdb-directory-index', 'databases'], ['ovdb-directory-index.two-databases', 'databases']]) {
    const json = await fixture(name);
    assert.equal(json.checksum, `sha256:${createHash('sha256').update(JSON.stringify(json[list])).digest('hex')}`, name);
  }
});

test('wrong formats are refused', () => {
  assert.throws(() => validateModelspecIndex(modelspecJson({ format: 'modelspec-registry/draft-2' })), /format/);
  assert.throws(() => validateMeaningGraphIndex(graphsJson({ format: 'x' })), /format/);
  assert.throws(() => validateDirectoryIndex(directoryJson({ format: 'meaning-registry/draft-1' })), /format/);
  assert.throws(() => validateDirectoryIndex(null), /must be an object/);
  assert.throws(() => validateDirectoryIndex(directoryJson({ checksum: 'sha256:abc' })), /checksum/);
  assert.throws(() => validateDirectoryIndex(directoryJson({ databases: {} })), /databases must be an array/);
});

test('ModelSpec models: ids, addresses, repositories, commits and paths are checked', () => {
  const bad = patch => modelspecJson({ models: [{ ...modelspecJson().models[0], ...patch }] });
  for (const id of ['Chinook', 'a/b', '../x', 'a b', '', 'a--b', '-a']) assert.throws(() => validateModelspecIndex(bad({ id })), /id/, id);
  assert.throws(() => validateModelspecIndex(bad({ address: 'modelspec://example.com/a/b/c' })), /address/);
  assert.throws(() => validateModelspecIndex(bad({ address: 'meaning://github.com/a/b' })), /address/);
  assert.throws(() => validateModelspecIndex(bad({ repository: 'http://github.com/acme/shop' })), /repository/);
  assert.throws(() => validateModelspecIndex(bad({ repository: 'https://example.com/acme/shop' })), /repository/);
  assert.throws(() => validateModelspecIndex(bad({ commit: 'abc123' })), /commit/);
  assert.throws(() => validateModelspecIndex(bad({ files: { source: '../x.hcl' } })), /files.source/);
  assert.throws(() => validateModelspecIndex(bad({ files: { source: '/etc/passwd' } })), /files.source/);
  assert.throws(() => validateModelspecIndex(bad({ files: { source: 'a\\b' } })), /files.source/);
  assert.throws(() => validateModelspecIndex(bad({ maintainers: ['bad handle'] })), /maintainers/);
  assert.throws(() => validateModelspecIndex(bad({ licence: '' })), /licence/);
  assert.throws(() => validateModelspecIndex(modelspecJson({ models: [modelspecJson().models[0], modelspecJson().models[0]] })), /duplicates/);
});

test('ModelSpec entities and properties: names become anchors, so they are identifiers', () => {
  const withEntities = entities => modelspecJson({ models: [{ ...modelspecJson().models[0], entities }] });
  assert.throws(() => validateModelspecIndex(withEntities([{ name: 'A B', properties: [] }])), /letters, digits and underscores/);
  assert.throws(() => validateModelspecIndex(withEntities([{ name: 'A', properties: [] }, { name: 'A', properties: [] }])), /duplicates entity/);
  assert.throws(() => validateModelspecIndex(withEntities([{ name: 'A', properties: [{ name: 'x"y', type: 'int' }] }])), /letters, digits and underscores/);
  assert.throws(() => validateModelspecIndex(withEntities([{ name: 'A', properties: [{ name: 'x', type: 'int' }, { name: 'x', type: 'int' }] }])), /duplicates property/);
  assert.throws(() => validateModelspecIndex(withEntities([{ name: 'A', properties: [{ name: 'x', type: 'reference', references: '<b>' }] }])), /entity name/);
  assert.throws(() => validateModelspecIndex(withEntities([{ name: 'A', properties: [{ name: 'x', type: 'int', required: 'yes' }] }])), /true or false/);
  const ok = validateModelspecIndex(withEntities([{ name: 'A', properties: [{ name: 'x', type: 'reference', references: 'other.B' }] }]));
  assert.equal(ok.models[0].entities[0].properties[0].references, 'other.B');
});

test('unknown fields are ignored: the formats are drafts and may gain fields', () => {
  const json = modelspecJson();
  json.models[0].future_field = { anything: true };
  json.models[0].entities[0].properties[0].format = 'uuid';
  const ok = validateModelspecIndex(json);
  assert.equal(ok.models[0].entities[0].properties[0].name, 'ArtistId');
});

test('graphs and databases: ids, https URLs and model addresses are checked', () => {
  const graph = patch => graphsJson({ graphs: [{ ...graphsJson().graphs[0], ...patch }] });
  assert.throws(() => validateMeaningGraphIndex(graph({ id: '../x' })), /id/);
  assert.throws(() => validateMeaningGraphIndex(graph({ repository: 'http://github.com/a/b' })), /https/);
  assert.throws(() => validateMeaningGraphIndex(graph({ model_files: ['../x'] })), /model_files/);
  assert.throws(() => validateMeaningGraphIndex(graph({ model_files: 'x' })), /array/);
  const db = patch => directoryJson({ databases: [{ ...directoryJson().databases[0], ...patch }] });
  assert.throws(() => validateDirectoryIndex(db({ id: 'A/B' })), /id/);
  assert.throws(() => validateDirectoryIndex(db({ url: 'javascript:alert(1)' })), /https/);
  assert.throws(() => validateDirectoryIndex(db({ url: 'http://x.example/db' })), /https/);
  assert.throws(() => validateDirectoryIndex(db({ repository: 'https://u:p@github.com/a/b' })), /credentials/);
  assert.throws(() => validateDirectoryIndex(db({ model: { name: 'x' } })), /address or a path/);
  assert.throws(() => validateDirectoryIndex(db({ model: { address: 'modelspec://evil.example/a/b/c' } })), /address/);
  assert.throws(() => validateDirectoryIndex(db({ model: { path: '../x' } })), /path/);
  assert.throws(() => validateDirectoryIndex(directoryJson({ databases: [directoryJson().databases[0], directoryJson().databases[0]] })), /duplicates/);
  assert.equal(validateDirectoryIndex(db({ model: undefined })).databases[0].model, undefined);
});

test('repository and address helpers', () => {
  assert.equal(repositoryKey('https://GitHub.com/DataTug/ChinookDB.git/'), 'github.com/datatug/chinookdb');
  assert.equal(baseAddress(`modelspec://github.com/a/b/c?ref=${COMMIT}`), 'modelspec://github.com/a/b/c');
  assert.equal(baseAddress('modelspec://github.com/a/b/c'), 'modelspec://github.com/a/b/c');
});

test('reading: http is refused, failures throw, 5xx is retried, a local file needs a path', async () => {
  await assert.rejects(readIndexText('http://x.example/i.json'), /plain http/);
  await assert.rejects(readIndexText('/nonexistent/index.json'), /Cannot read the index file/);
  let calls = 0;
  const flaky = async () => (++calls < 3 ? { ok: false, status: 503, text: async () => '' } : { ok: true, text: async () => '{"a":1}' });
  assert.equal(await readIndexText('https://x.example/i.json', { fetchImpl: flaky }), '{"a":1}');
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(readIndexText('https://x.example/i.json', { fetchImpl: async () => { calls++; return { ok: false, status: 404 }; } }), /HTTP 404/);
  assert.equal(calls, 1, '4xx is not retried');
  await assert.rejects(readIndexText('https://x.example/i.json', { fetchImpl: async () => { throw new Error('boom'); }, retries: 1 }), /boom/);
  const text = await readIndexText(`${REPO}/fixtures/meaninggraph-registry-index.fixture.json`);
  assert.match(text, /meaning-registry/);
});

test('loadIndex names the index in every failure', async () => {
  const notJson = async () => ({ ok: true, text: async () => 'not json' });
  await assert.rejects(loadIndex({ location: 'https://x.example/i.json' }, validateDirectoryIndex, { fetchImpl: notJson }), /not valid JSON/);
  const wrong = async () => ({ ok: true, text: async () => JSON.stringify({ format: 'x' }) });
  await assert.rejects(loadIndex({ location: 'https://x.example/i.json' }, validateDirectoryIndex, { fetchImpl: wrong }), error => error instanceof IndexError && /https:\/\/x\.example\/i\.json/.test(error.message));
  const marked = async () => ({ ok: true, text: async () => JSON.stringify({ ...directoryJson(), _fixture: {} }) });
  await assert.rejects(loadIndex({ location: 'https://x.example/i.json' }, validateDirectoryIndex, { fetchImpl: marked }), /_fixture/);
  const ok = await loadIndex({ location: 'https://x.example/i.json' }, validateDirectoryIndex, { fetchImpl: async () => ({ ok: true, text: async () => JSON.stringify(directoryJson()) }) });
  assert.equal(ok.databases.length, 3);
});
