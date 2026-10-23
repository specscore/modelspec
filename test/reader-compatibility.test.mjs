import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {compatibilityAnchor, compatibilityModelView, compatibilityNativeId, sourceName} from '../src/model-compatibility.mjs';
import {validateModelspecIndex} from '../src/indexes.mjs';
import {registrySearchExport} from '../src/registry-search-export.mjs';
import {anchorId, extractShell, renderModelPage} from '../src/render.mjs';
import {buildSite} from '../src/site.mjs';
import {MANIFEST_FILE} from '../src/build-manifest.mjs';
import {config, modelspecJson, REPO, sampleData, tempRoot} from './helpers.mjs';

const fixture = JSON.parse(await readFile(new URL('./fixtures/reader-language.json', import.meta.url), 'utf8'));
const shell = extractShell(await readFile(`${REPO}/public/index.html`, 'utf8'));
const model = (entities, components = []) => validateModelspecIndex(modelspecJson({models: [{...modelspecJson().models[0], module: 'Own', entities, components}]})).models[0];

test('compatibility fragments match cross-reader vectors and source blankness matches Go', () => {
  const vectors = [
    [['field', 'a-b', 'c'], 'field--56c94121028d4fa696bc3b93e273ea7a5ce6fd653d3d9eb1a7757655eb27e629'],
    [['field', 'a', 'b-c'], 'field--b7a09fc386caa596ba5127a7bf7fda88777d761585baf53c12463ef3c8be31f6'],
    [['property', 'Percent%', 'x'], 'property--1461cd6647f8c9851b36bff482921e1725f010004a3c4484324b49f8ff99a813'],
    [['property', 'Percent_25', 'x'], 'property-Percent_25-x'],
    [['field', 'a/b', 'Café'], 'field--8265f3ad60d1ef61e3a36248827c26b389f0af73c2ffc6909d544e2726e27d67'],
    [['entity', '\uFEFF'], 'entity--ddc2333bc9b6da6f46e99019c3a280a8c5373d2ad4722e29e11126eceace0ad6'],
  ];
  for (const [parts, expected] of vectors) assert.equal(compatibilityAnchor(...parts), expected);
  assert.ok(sourceName('\uFEFF')); assert.equal(sourceName('\u0085'), false);
  const address = 'modelspec://github.com/acme/models/Own';
  const id = compatibilityNativeId(address, [['record', 'a/b'], ['property', 'c']], 'unused');
  assert.match(id, /^modelspec-compat-member\/v1:[a-f0-9]{64}$/);
  assert.equal(id, compatibilityNativeId(`${address}?ref=${'f'.repeat(40)}`, [['record', 'a/b'], ['property', 'c']], 'other'));
  assert.notEqual(id, compatibilityNativeId(address, [['record', 'a'], ['property', 'b/c']], 'unused'));
  assert.notEqual(id, compatibilityNativeId(address, [['component', 'a/b'], ['field', 'c']], 'unused'));
});

test('every real Go-approved language case builds and every emitted destination exists once', async () => {
  const raw = modelspecJson(); raw.models.push(...fixture.cases.map(item => item.model));
  const data = sampleData({modelspec: raw});
  const output = registrySearchExport(data, config());
  assert.equal(new Set(output.documents.map(row => row.id)).size, output.documents.length);
  const ids = new Set(output.documents.map(row => row.id));
  assert.ok(output.documents.every(row => !row.parent_id || ids.has(row.parent_id)));
  const {root, cleanup} = await tempRoot();
  try {
    await buildSite({root, config: config(['--use-fixture', '--out', 'dist-e2e']), data});
    const report = JSON.parse(await readFile(`${root}/dist-e2e/registry-compatibility.json`, 'utf8'));
    const manifest = JSON.parse(await readFile(`${root}/dist-e2e/${MANIFEST_FILE}`, 'utf8'));
    assert.ok(manifest.files['registry-compatibility.json']);
    assert.ok(report.models.some(row => row.diagnostics.some(item => item.code === 'recursive-reference')));
    assert.ok(report.models.some(row => row.diagnostics.some(item => item.code === 'qualified-reference-unavailable')));
    for (const entry of data.modelspec.models) {
      const html = await readFile(`${root}/dist-e2e/registry/models/${entry.id}/index.html`, 'utf8');
      const all = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
      assert.equal(new Set(all).size, all.length, entry.id);
      for (const row of output.documents.filter(row => row.canonical_url.includes(`/models/${entry.id}/#`))) {
        assert.equal(all.filter(id => id === new URL(row.canonical_url).hash.slice(1)).length, 1, row.canonical_url);
      }
    }
  } finally { await cleanup(); }
});

test('known self aliases resolve to local declarations and alternate spelling cannot evade cycle detection', () => {
  const input = model([{name: 'Root', use: ['Own.A', 'Own.A'], properties: []}], [{name: 'A', fields: [{name: 'nested', type: 'component', component: 'Own.A'}]}]);
  const view = compatibilityModelView(input);
  assert.equal(view.fields.length, 1);
  assert.ok(view.diagnostics.some(row => row.code === 'recursive-reference'));
  assert.ok(view.diagnostics.some(row => row.code === 'repeated-identical-use'));
  const data = sampleData(); data.modelspec.models = [input];
  const html = renderModelPage(input, data, config(), shell);
  assert.ok(html.includes(`href="#${anchorId('component', 'A')}"`));
  input.entities[0].use = ['Own.Missing'];
  assert.throws(() => compatibilityModelView(input), /unresolved local name Own.Missing/);
});

test('expansion limits preserve later direct fields and do not hide unreachable or post-limit invalid references', () => {
  const input = model([{name: 'First', use: ['A'], properties: []}, {name: 'Later', properties: [{name: 'keepMe', type: 'string'}]}], [{name: 'A', fields: [{name: 'one', type: 'string'}, {name: 'two', type: 'string'}]}]);
  const view = compatibilityModelView(input, {expandedFields: 1});
  assert.ok(view.diagnostics.some(row => row.code === 'expanded-field-limit'));
  assert.ok(view.fields.some(row => row.record.name === 'Later' && row.field.name === 'keepMe'));
  input.components.push({name: 'Unreachable', fields: [{name: 'bad', type: 'component', component: 'Missing'}]});
  assert.throws(() => compatibilityModelView(input, {expandedFields: 1}), /unresolved local name Missing/);
});

test('iterative deep/wide expansion and diagnostics have explicit bounded outcomes', () => {
  const chain = Array.from({length: 100}, (_, i) => ({name: `C${i}`, fields: i === 99 ? [{name: 'leaf', type: 'string'}] : [{name: 'next', type: 'component', component: `C${i + 1}`}]}));
  const input = model([{name: 'Root', properties: [{name: 'tree', type: 'component', component: 'C0'}]}], chain);
  assert.ok(compatibilityModelView(input, {depth: 3}).diagnostics.some(row => row.code === 'expansion-depth-limit'));
  assert.ok(compatibilityModelView(input, {work: 2}).diagnostics.some(row => row.code === 'expansion-work-limit'));
  assert.ok(compatibilityModelView(input, {textUnits: 1}).diagnostics.some(row => row.code === 'expansion-text-limit'));
  input.entities[0].use = Array.from({length: 20}, (_, i) => `Unknown${i}.Thing`);
  const limited = compatibilityModelView(input, {diagnostics: 2});
  assert.equal(limited.diagnostics.length, 2); assert.ok(limited.omittedDiagnostics > 0);
});

test('all nine migrated model search documents retain their exact public identities and payloads', async () => {
  const raw = JSON.parse(await readFile(new URL('./fixtures/migration-nine-models.json', import.meta.url), 'utf8'));
  const expected = JSON.parse(await readFile(new URL('./fixtures/migration-nine-identities.json', import.meta.url), 'utf8'));
  const output = registrySearchExport({modelspec: validateModelspecIndex(raw)}, {mode: 'local'});
  assert.equal(output.documents.length, expected.documents);
  assert.equal(createHash('sha256').update(JSON.stringify(output.documents)).digest('hex'), expected.documents_sha256);
  assert.throws(() => registrySearchExport({modelspec: {models: [...validateModelspecIndex(raw).models, {...validateModelspecIndex(raw).models[0], title: 'Conflicting payload'}]}}, {mode: 'local'}), /Conflicting duplicate search document/);
});
