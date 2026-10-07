import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {test} from 'node:test';
import {validateModelspecIndex} from '../src/indexes.mjs';
import {registrySearchExport, publicId} from '../src/registry-search-export.mjs';
import {searchUiConfig} from '../src/registry-search-ui.mjs';
import {buildSite} from '../src/site.mjs';
import {config, modelspecJson, modelspecWithComponents, REPO, sampleData, tempRoot} from './helpers.mjs';

test('model, entity, inherited component field and native collection have distinct real destinations', async () => {
  const json = modelspecWithComponents();
  json.models[0].entities[0].use = ['Auditable'];
  json.models[0].components[0].fields[2].component = 'Metadata';
  json.models[0].components.push({name: 'Metadata', fields: [{name: 'traceId', type: 'string'}]});
  json.models[0].collections = [{name: 'ArtistViews', kind: 'computed', source: 'Artist', query: 'SELECT * FROM Artist', fields: [{name: 'ArtistId', type: 'integer', bind: 'Artist.ArtistId'}]}];
  const model = validateModelspecIndex(json).models[0];
  assert.equal(model.collections.length, 1);
  const data = sampleData({modelspec: json});
  const exportData = registrySearchExport(data, config());
  assert.equal(exportData.documents.filter(doc => doc.kind === 'model_collection').length, 1);
  const collection = exportData.documents.find(doc => doc.kind === 'model_collection');
  const field = exportData.documents.find(doc => doc.native_id.endsWith('/collection/ArtistViews/ArtistId'));
  const inherited = exportData.documents.find(doc => doc.qualified_name === 'chinook.Artist.createdAt');
  const embedded = exportData.documents.find(doc => doc.qualified_name === 'chinook.Artist.Audit.createdAt');
  const nested = exportData.documents.find(doc => doc.qualified_name === 'chinook.Artist.Audit.meta.traceId');
  assert.equal(collection.id, publicId('model_collection', `${model.address}/collection/ArtistViews`));
  assert.match(field.canonical_url, /#collection-field-ArtistViews-ArtistId$/);
  assert.equal(field.parent_id, collection.id);
  assert.match(inherited.canonical_url, /#field-Auditable-createdAt$/);
  assert.equal(inherited.declaring_component, 'Auditable');
  assert.equal(embedded.declaring_component, 'Auditable');
  assert.notEqual(inherited.id, embedded.id);
  assert.match(embedded.native_id, /\/property\/Audit\/component\/Auditable\/field\/createdAt$/);
  assert.match(embedded.canonical_url, /#field-Auditable-createdAt$/);
  assert.equal(nested.declaring_component, 'Metadata');
  assert.match(nested.canonical_url, /#field-Metadata-traceId$/);
  const {root, cleanup} = await tempRoot();
  try {
    await buildSite({root, config: {...config(['--use-fixture', '--out', 'dist-e2e']), outName: 'dist-e2e'}, data});
    const html = await readFile(join(root, 'dist-e2e/registry/models/chinook/index.html'), 'utf8');
    assert.match(html, /id="collection-ArtistViews"/);
    assert.match(html, /id="collection-field-ArtistViews-ArtistId"/);
    assert.match(html, /id="field-Auditable-createdAt"/);
    assert.match(html, /id="field-Metadata-traceId"/);
  } finally { await cleanup(); }
});

test('component cycles and unresolved component references fail export', () => {
  const cyclic = modelspecWithComponents();
  cyclic.models[0].entities[0].use = [];
  assert.throws(() => registrySearchExport(sampleData({modelspec: cyclic}), config()), /cyclic component reference/);
  const unresolved = modelspecWithComponents();
  unresolved.models[0].entities[0].use = [];
  unresolved.models[0].components[0].fields[2].component = 'Missing';
  assert.throws(() => registrySearchExport(sampleData({modelspec: unresolved}), config()), /unresolved component Missing/);
});

test('registry export excludes inactive Directory source discoveries and public UI needs an approved origin', () => {
  const data = sampleData();
  const result = registrySearchExport(data, config());
  assert.equal(result.documents.some(doc => doc.kind.includes('source')), false);
  assert.equal(result.documents.length, 7);
  assert.equal(searchUiConfig({}, {production: true, fixture: false}), null);
  assert.throws(() => searchUiConfig({REGISTRY_SEARCH_MODE: 'cloud', REGISTRY_SEARCH_ENDPOINT: 'https://search.example/v1/registry-search'}, {production: true, fixture: false}), /not been approved/);
});
