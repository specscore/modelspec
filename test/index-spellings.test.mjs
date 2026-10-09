// The ModelSpec registry index may spell a model's record types `records` with their `fields` (ModelSpec
// 1.0-draft-2) or `entities` with their `properties` (1.0-draft). The site reads both and publishes the same bytes
// for either: pages, anchors, search export and build-info.json.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { validateModelspecIndex } from '../src/indexes.mjs';
import { registrySearchExport } from '../src/registry-search-export.mjs';
import { searchUiConfig } from '../src/registry-search-ui.mjs';
import { buildSite } from '../src/site.mjs';
import { bothSpellings, config, currentSpelling, modelspecJson, modelspecWithComponents, productionConfig, REPO, sampleData, tempRoot } from './helpers.mjs';

const committed = JSON.parse(readFileSync(join(REPO, 'fixtures', 'modelspec-registry-index.fixture.json'), 'utf8'));
const fx = { allowFixture: true, requireFixture: true };

/** The sample with components that embed each other without a cycle, and a native collection. */
function richSample() {
  const sample = modelspecWithComponents();
  sample.models[0].entities[0].use = ['Auditable'];
  sample.models[0].components[0].fields[2].component = 'Metadata';
  sample.models[0].components.push({ name: 'Metadata', fields: [{ name: 'traceId', type: 'string' }] });
  sample.models[0].collections = [{ name: 'ArtistViews', kind: 'computed', source: 'Artist', query: 'SELECT 1', fields: [{ name: 'ArtistId', type: 'int' }] }];
  return sample;
}

/** Every file under `dir`, relative path to bytes. */
function snapshot(dir, prefix = '') {
  const files = {};
  for (const entry of readdirSync(join(dir, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(files, snapshot(dir, path));
    else files[path] = readFileSync(join(dir, path)).toString('base64');
  }
  return files;
}

async function build(modelspec, options = {}) {
  const { root, cleanup } = await tempRoot();
  try {
    const cfg = { ...productionConfig(root), searchUi: searchUiConfig({}, { production: true, fixture: false }), ...options };
    await buildSite({ root, config: cfg, data: sampleData({ modelspec }) });
    return snapshot(join(root, 'dist'));
  } finally { await cleanup(); }
}

test('the current spelling is read as the same thing: the validated index is identical', () => {
  for (const index of [modelspecJson(), modelspecWithComponents()]) {
    assert.deepEqual(validateModelspecIndex(currentSpelling(index)), validateModelspecIndex(index));
  }
  assert.deepEqual(validateModelspecIndex(currentSpelling(committed), fx), validateModelspecIndex(committed, fx), 'the committed fixture, with its eleven record types');
});

test('an index carrying both spellings is accepted and reads as the current one', () => {
  const index = modelspecWithComponents();
  assert.deepEqual(validateModelspecIndex(bothSpellings(index)), validateModelspecIndex(index));
  assert.deepEqual(validateModelspecIndex(bothSpellings(committed), fx), validateModelspecIndex(committed, fx));
});

test('when both spellings are present the current one wins, at each level, and the earlier one is not even read', () => {
  const index = bothSpellings(modelspecJson());
  const model = index.models[0];
  model.entities = [{ name: 'Stale', properties: [{ name: 'old', type: 'int' }] }];
  model.records[0].fields = [{ name: 'Newer', type: 'string' }];
  model.records[0].properties = 'not even a list';
  const read = validateModelspecIndex(index).models[0];
  assert.deepEqual(read.entities.map(e => e.name), ['Artist', 'Album']);
  assert.deepEqual(read.entities[0].properties.map(p => p.name), ['Newer']);
  const garbage = modelspecJson();
  garbage.models[0].entities = 'not a list';
  garbage.models[0].records = currentSpelling(modelspecJson()).models[0].records;
  assert.equal(validateModelspecIndex(garbage).models[0].entities.length, 2);
});

test('the two levels are chosen separately: records with properties, entities with fields', () => {
  const index = modelspecJson();
  const [artist, album] = index.models[0].entities;
  index.models[0].records = [{ name: 'Artist', key: artist.key, properties: artist.properties }];
  delete index.models[0].entities;
  assert.deepEqual(validateModelspecIndex(index).models[0].entities.map(e => [e.name, e.properties.length]), [['Artist', 2]]);
  const other = modelspecJson();
  other.models[0].entities = [{ name: 'Album', key: album.key, fields: album.properties }];
  assert.deepEqual(validateModelspecIndex(other).models[0].entities.map(e => [e.name, e.properties.length]), [['Album', 2]]);
});

// One rule at each level: a current key (`records`, `fields`) that is absent or `null` is "not written" and the
// earlier key is read; a current key that is present with an array, an empty array included, wins; any other value
// of it is refused, and the message names it.
const OTHER_TYPES = ['text', '', 0, 5, false, true, {}];
const names = list => list.map(item => item.name);
/** Chinook's first model with `edit` applied, validated; returns what the site reads of it. */
function readModel(edit) {
  const index = modelspecJson();
  edit(index.models[0]);
  return validateModelspecIndex(index).models[0];
}

test('records at the model level: absent or null reads entities; an array, empty included, wins', () => {
  assert.deepEqual(names(readModel(m => { m.records = undefined; }).entities), ['Artist', 'Album']);
  assert.deepEqual(names(readModel(m => { m.records = null; }).entities), ['Artist', 'Album'], 'null is not written');
  assert.deepEqual(readModel(m => { m.records = []; }).entities, [], 'an empty array is written and wins over a full entities');
  assert.deepEqual(names(readModel(m => { m.records = [{ name: 'Order', fields: [] }]; }).entities), ['Order']);
  // entities is read, and held to its own contract, only where records is not written
  assert.deepEqual(readModel(m => { m.records = null; m.entities = []; }).entities, []);
  assert.throws(() => readModel(m => { m.records = null; delete m.entities; }), /models\[0\]\.entities must be an array/);
  assert.throws(() => readModel(m => { m.records = null; m.entities = null; }), /models\[0\]\.entities must be an array/);
  assert.throws(() => readModel(m => { m.records = null; m.entities = 'text'; }), /models\[0\]\.entities must be an array/);
  // entities is not read where records is written
  assert.deepEqual(readModel(m => { m.records = []; m.entities = null; }).entities, []);
  assert.deepEqual(readModel(m => { m.records = []; delete m.entities; }).entities, []);
  assert.deepEqual(names(readModel(m => { m.records = [{ name: 'Order', fields: [] }]; m.entities = 'text'; }).entities), ['Order']);
});

test('records at the model level: any other type is refused, with or without entities, and the message names records', () => {
  for (const records of OTHER_TYPES) {
    assert.throws(() => readModel(m => { m.records = records; }), /models\[0\]\.records must be an array/, JSON.stringify(records));
    assert.throws(() => readModel(m => { m.records = records; delete m.entities; }), /models\[0\]\.records must be an array/, JSON.stringify(records));
  }
});

test('fields at the record level: absent or null reads properties; an array, empty included, wins', () => {
  const read = record => readModel(m => { m.entities = [record]; }).entities[0].properties.map(p => p.name);
  const current = readModel(m => { m.records = [{ name: 'A', fields: [{ name: 'f', type: 'int' }], properties: [{ name: 'p', type: 'int' }] }]; delete m.entities; });
  assert.deepEqual(current.entities[0].properties.map(p => p.name), ['f']);
  assert.deepEqual(read({ name: 'A', fields: undefined, properties: [{ name: 'p', type: 'int' }] }), ['p']);
  assert.deepEqual(read({ name: 'A', fields: null, properties: [{ name: 'p', type: 'int' }] }), ['p'], 'null is not written');
  assert.deepEqual(read({ name: 'A', fields: [], properties: [{ name: 'p', type: 'int' }] }), [], 'an empty array is written and wins over full properties');
  assert.deepEqual(read({ name: 'A', fields: [{ name: 'f', type: 'int' }], properties: [{ name: 'p', type: 'int' }] }), ['f']);
  assert.deepEqual(read({ name: 'A', fields: null, properties: [] }), []);
  assert.throws(() => read({ name: 'A', fields: null }), /entities\[0\]\.properties must be an array/);
  assert.throws(() => read({ name: 'A', fields: null, properties: null }), /entities\[0\]\.properties must be an array/);
  assert.throws(() => read({ name: 'A', fields: null, properties: 'text' }), /entities\[0\]\.properties must be an array/);
  // properties is not read where fields is written
  assert.deepEqual(read({ name: 'A', fields: [], properties: null }), []);
  assert.deepEqual(read({ name: 'A', fields: [] }), []);
  assert.deepEqual(read({ name: 'A', fields: [{ name: 'f', type: 'int' }], properties: 'text' }), ['f']);
});

test('fields at the record level: any other type is refused, with or without properties, and the message names fields', () => {
  for (const fields of OTHER_TYPES) {
    assert.throws(() => readModel(m => { m.entities = [{ name: 'A', fields, properties: [{ name: 'p', type: 'int' }] }]; }), /models\[0\]\.entities\[0\]\.fields must be an array/, JSON.stringify(fields));
    assert.throws(() => readModel(m => { m.entities = [{ name: 'A', fields }]; }), /models\[0\]\.entities\[0\]\.fields must be an array/, JSON.stringify(fields));
    assert.throws(() => readModel(m => { m.records = [{ name: 'A', fields }]; delete m.entities; }), /models\[0\]\.records\[0\]\.fields must be an array/, JSON.stringify(fields));
  }
});

test('a null current key publishes the bytes of the earlier one; an empty current array publishes what an empty earlier array does', async () => {
  const sample = richSample();
  const original = await build(sample);
  const nulled = structuredClone(sample);
  for (const model of nulled.models) {
    model.records = null;
    for (const record of model.entities) record.fields = null;
  }
  assert.deepEqual(await build(nulled), original);
  const emptied = modelspecJson();
  for (const model of emptied.models) model.records = [];
  const bare = modelspecJson();
  for (const model of bare.models) model.entities = [];
  assert.deepEqual(await build(emptied), await build(bare));
  assert.notDeepEqual(await build(emptied), await build(modelspecJson()), 'the empty array is not ignored');
});

test('an index with neither key, or a key that is not a list, is refused and the message names the key read', () => {
  const none = modelspecJson();
  delete none.models[0].entities;
  assert.throws(() => validateModelspecIndex(none), /models\[0\]\.entities must be an array/);
  const records = currentSpelling(modelspecJson());
  records.models[0].records = {};
  assert.throws(() => validateModelspecIndex(records), /models\[0\]\.records must be an array/);
  const fields = currentSpelling(modelspecJson());
  delete fields.models[0].records[1].fields;
  assert.throws(() => validateModelspecIndex(fields), /models\[0\]\.records\[1\]\.properties must be an array/);
  const fieldsWrong = currentSpelling(modelspecJson());
  fieldsWrong.models[0].records[0].fields[1].name = 'a b';
  assert.throws(() => validateModelspecIndex(fieldsWrong), /models\[0\]\.records\[0\]\.fields\[1\]\.name .*letters, digits and underscores/);
  const duplicate = currentSpelling(modelspecJson());
  duplicate.models[0].records.push({ name: 'Artist', fields: [] });
  assert.throws(() => validateModelspecIndex(duplicate), /duplicates entity Artist/);
});

test('the entry identifier is only printed: 1.0-draft and 1.0-draft-2 both read, and the page shows what the index says', async () => {
  for (const version of ['1.0-draft', '1.0-draft-2']) {
    const index = currentSpelling(modelspecJson());
    index.models[0].modelspec = version;
    assert.equal(validateModelspecIndex(index).models[0].modelspecVersion, version);
    const pages = await build(index);
    assert.match(Buffer.from(pages['registry/models/chinook/index.html'], 'base64').toString('utf8'), new RegExp(`ModelSpec ${version}<`));
  }
});

test('a build from an index in the current spelling, or in both, publishes the same bytes', async () => {
  const sample = richSample();
  const original = await build(sample);
  assert.ok(Object.keys(original).length > 10);
  assert.deepEqual(await build(currentSpelling(sample)), original);
  assert.deepEqual(await build(bothSpellings(sample)), original);
});

test('the search export is the same for either spelling: kinds, document ids and anchors', () => {
  const sample = richSample();
  const original = registrySearchExport(sampleData({ modelspec: sample }), config());
  assert.ok(original.documents.some(doc => doc.kind === 'model_entity'));
  assert.deepEqual(registrySearchExport(sampleData({ modelspec: currentSpelling(sample) }), config()), original);
  assert.deepEqual(registrySearchExport(sampleData({ modelspec: bothSpellings(sample) }), config()), original);
});
