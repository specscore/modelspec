import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {test} from 'node:test';
import {validateModelspecIndex} from '../src/indexes.mjs';
import {registrySearchExport} from '../src/registry-search-export.mjs';
import {searchUiConfig} from '../src/registry-search-ui.mjs';
import {buildSite} from '../src/site.mjs';
import {config, modelspecJson, modelspecWithComponents, REPO, sampleData, tempRoot} from './helpers.mjs';

test('model, record type and inherited component field have distinct real destinations, on the anchors written before the rename', async () => {
  const json = modelspecWithComponents();
  json.models[0].entities[0].use = ['Auditable'];
  json.models[0].components[0].fields[2].component = 'Metadata';
  json.models[0].components.push({name: 'Metadata', fields: [{name: 'traceId', type: 'string'}]});
  validateModelspecIndex(json);
  const data = sampleData({modelspec: json});
  const exportData = registrySearchExport(data, config());
  assert.deepEqual([...new Set(exportData.documents.map(doc => doc.kind))].sort(), ['model', 'model_entity', 'model_field']);
  const artist = exportData.documents.find(doc => doc.kind === 'model_entity' && doc.identifier === 'Artist');
  const artistId = exportData.documents.find(doc => doc.qualified_name === 'chinook.Artist.ArtistId');
  const inherited = exportData.documents.find(doc => doc.qualified_name === 'chinook.Artist.createdAt');
  const embedded = exportData.documents.find(doc => doc.qualified_name === 'chinook.Artist.Audit.createdAt');
  const nested = exportData.documents.find(doc => doc.qualified_name === 'chinook.Artist.Audit.meta.traceId');
  // Search keeps its present kinds, ids and URLs for this round: the anchors written before the rename, which every page still answers.
  assert.match(artist.canonical_url, /#entity-Artist$/);
  assert.match(artistId.canonical_url, /#property-Artist-ArtistId$/);
  assert.equal(artistId.parent_id, artist.id);
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
    for (const doc of exportData.documents.filter(doc => doc.kind !== 'model')) {
      const id = new URL(doc.canonical_url).hash.slice(1);
      assert.match(html, new RegExp(`id="${id}"`), `${doc.canonical_url} has an element on the page`);
    }
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

test('registry export excludes inactive Directory sources and production search uses only the reviewed VM pilot', () => {
  const data = sampleData();
  const result = registrySearchExport(data, config());
  assert.equal(result.documents.some(doc => doc.kind.includes('source')), false);
  assert.equal(result.documents.length, 7);
  const pilot = {endpoint: 'https://search.openvaultdb.com/v1/registry-search', mode: 'vm-pilot'};
  assert.deepEqual(searchUiConfig({}, {production: true, fixture: false}), pilot);
  assert.equal(searchUiConfig({}, {production: false, fixture: true}), null);
  assert.deepEqual(searchUiConfig({REGISTRY_SEARCH_ENDPOINT: pilot.endpoint, REGISTRY_SEARCH_MODE: pilot.mode}, {production: true, fixture: false}), pilot);
  assert.throws(() => searchUiConfig({REGISTRY_SEARCH_MODE: 'cloud', REGISTRY_SEARCH_ENDPOINT: 'https://search.example/v1/registry-search'}, {production: true, fixture: false}), /not been approved/);
  for (const endpoint of ['https://search.example/v1/registry-search', 'https://search.openvaultdb.com.evil.test/v1/registry-search', 'http://127.0.0.1:8787/v1/registry-search', 'https://user:pass@search.openvaultdb.com/v1/registry-search', 'https://search.openvaultdb.com/v1/registry-search?token=secret']) {
    assert.throws(() => searchUiConfig({REGISTRY_SEARCH_ENDPOINT: endpoint, REGISTRY_SEARCH_MODE: 'vm-pilot'}, {production: true, fixture: false}));
  }
  assert.throws(() => searchUiConfig({REGISTRY_SEARCH_MODE: 'vm-pilot'}, {production: true, fixture: false}), /must be set together/);
  assert.throws(() => searchUiConfig({REGISTRY_SEARCH_ENDPOINT: pilot.endpoint}, {production: true, fixture: false}), /must be set together/);
});
