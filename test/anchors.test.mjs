// The anchors of the generated model pages. A record type is #record-<Name> and a field of one #field-<Record>-<member>;
// #entity-<Name>, #property-<Record>-<member> and #entities, written before the rename, open on the same place for ever
// (other sites link to them). Also: no two ids of a page are equal, aliases included; every link inside a page lands on an
// element; the page text uses the current words; and the two index rules that keep the anchors apart.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { validateDirectoryIndex, validateMeaningGraphIndex, validateModelspecIndex } from '../src/indexes.mjs';
import { registrySearchExport } from '../src/registry-search-export.mjs';
import { extractShell, renderRegistryPages } from '../src/render.mjs';
import { REPO, config, currentSpelling, modelspecJson, modelspecWithComponents, sampleData } from './helpers.mjs';

const fx = { allowFixture: true, requireFixture: true };
const fixture = async name => JSON.parse(await readFile(`${REPO}/fixtures/${name}.fixture.json`, 'utf8'));
const template = await readFile(`${REPO}/public/index.html`, 'utf8');
const shell = extractShell(template);
const ctx = config(['--use-fixture', '--out', 'dist-e2e']);

/** The committed fixtures: four registered models, with 23 record types between them. */
const committed = {
  modelspec: validateModelspecIndex(await fixture('modelspec-registry-index'), fx),
  meaninggraph: validateMeaningGraphIndex(await fixture('meaninggraph-registry-index'), fx),
  directory: validateDirectoryIndex(await fixture('ovdb-directory-index'), fx),
};

/** Every generated model page of a set of data: model, HTML. */
const modelPages = data => data.modelspec.models.map(model => [model, renderRegistryPages(data, ctx, shell).get(`registry/models/${model.id}/index.html`)]);
const idsOf = html => [...html.matchAll(/\sid="([^"]*)"/g)].map(m => m[1]);

const withComponents = sampleData({ modelspec: modelspecWithComponents() });
const SETS = { 'the committed fixtures': committed, 'the sample index': sampleData(), 'the sample index with components': withComponents, 'the sample in the current spelling': sampleData({ modelspec: currentSpelling(modelspecWithComponents()) }) };

test('the committed fixtures hold the models these tests stand for', () => {
  assert.equal(committed.modelspec.models.length, 4);
  assert.equal(committed.modelspec.models.reduce((n, m) => n + m.entities.length, 0), 23);
});

for (const [name, data] of Object.entries(SETS)) {
  test(`every anchor written before the rename still opens on the same element as the current one: ${name}`, () => {
    for (const [model, html] of modelPages(data)) {
      const where = `model ${model.id}`;
      const records = model.entities;
      const fields = records.flatMap(record => record.properties.map(field => [record.name, field.name]));
      // a record type: the section holds, as its first child, the empty element with the earlier id
      for (const { name: record } of records) {
        assert.ok(html.includes(`<section class="reg-entity" id="record-${record}" aria-labelledby="heading-record-${record}">\n        <span class="reg-alias" id="entity-${record}"></span>\n        <h3`), `${where}: #entity-${record} stands inside #record-${record}`);
      }
      // a field: the row holds, in its first cell, the empty element with the earlier id
      for (const [record, member] of fields) {
        assert.ok(html.includes(`<tr id="field-${record}-${member}">\n              <th scope="row" data-label="Field"><span class="reg-alias" id="property-${record}-${member}"></span><a class="reg-prop-name" href="#field-${record}-${member}">`), `${where}: #property-${record}-${member} stands inside #field-${record}-${member}`);
      }
      // the section
      assert.ok(html.includes('<section class="reg-section" id="records" aria-labelledby="records-heading">\n      <span class="reg-alias" id="entities"></span>'), `${where}: #entities stands inside #records`);
      // and nothing else carries an earlier id, nothing is missing
      const ids = idsOf(html);
      assert.deepEqual(ids.filter(id => id.startsWith('entity-')).sort(), records.map(r => `entity-${r.name}`).sort(), where);
      assert.deepEqual(ids.filter(id => id.startsWith('property-')).sort(), fields.map(([r, m]) => `property-${r}-${m}`).sort(), where);
      assert.equal(ids.filter(id => id === 'entities').length, 1, where);
      assert.deepEqual(ids.filter(id => id.startsWith('record-')).sort(), records.map(r => `record-${r.name}`).sort(), where);
      assert.equal(ids.filter(id => id === 'records').length, 1, where);
      // the page's own links use the current anchors
      assert.doesNotMatch(html, /href="#(entity-|property-|entities")/, `${where}: no link inside the page uses an earlier anchor`);
    }
  });

  test(`no two ids of a generated page are equal, aliases included, and every link inside a page lands on an element: ${name}`, () => {
    for (const [path, html] of renderRegistryPages(data, ctx, shell)) {
      const ids = idsOf(html);
      assert.equal(new Set(ids).size, ids.length, `${path}: ${ids.filter((id, i) => ids.indexOf(id) !== i)} repeated`);
      for (const [, target] of html.matchAll(/\shref="#([^"]*)"/g)) assert.ok(ids.includes(target), `${path}: a link to #${target} has no element`);
    }
  });

  test(`the page text calls them record types and fields: ${name}`, () => {
    const pages = renderRegistryPages(data, ctx, shell);
    for (const path of ['registry/index.html', ...data.modelspec.models.map(m => `registry/models/${m.id}/index.html`)]) {
      // the words as a visitor reads them: no tags, no attribute values, and not the descriptions that come from the three indexes
      const own = path === 'registry/index.html' ? pages.get(path) : pages.get(path).replace(/<p class="reg-lede">[\s\S]*?<\/p>/, '');
      let text = own.replace(/<(script|style)[\s\S]*?<\/\1>/g, '').replace(/<p class="reg-(model|row)-desc">[\s\S]*?<\/p>/g, '').replace(/<[^>]*>/g, ' ');
      assert.doesNotMatch(text, /\b(entity|entities|propert(y|ies))\b/i, path);
    }
  });
}

// components that embed no component, which the search export (unlike the page) requires
const acyclic = () => {
  const json = modelspecWithComponents();
  json.models[0].components[0].fields[2] = { name: 'meta', type: 'string' };
  json.models[0].entities[0].use = ['Auditable'];
  return json;
};

test('the search export keeps its present URLs, and each one lands on an element of its page', () => {
  for (const data of [committed, sampleData(), sampleData({ modelspec: acyclic() }), sampleData({ modelspec: currentSpelling(acyclic()) })]) {
    const exported = registrySearchExport(data, config());
    const pages = renderRegistryPages(data, ctx, shell);
    const kinds = new Set(exported.documents.map(doc => doc.kind));
    assert.deepEqual([...kinds].filter(kind => !['model', 'model_entity', 'model_field'].includes(kind)), [], 'the kinds do not change in this round, and there is no collection');
    for (const doc of exported.documents.filter(doc => doc.kind !== 'model')) {
      const url = new URL(doc.canonical_url);
      const html = pages.get(url.pathname.replace(/^\//, '') + 'index.html');
      assert.ok(idsOf(html).includes(url.hash.slice(1)), `${doc.canonical_url} (${doc.kind})`);
    }
    const entityUrls = exported.documents.filter(doc => doc.kind === 'model_entity').map(doc => new URL(doc.canonical_url).hash);
    assert.ok(entityUrls.length > 0 && entityUrls.every(hash => hash.startsWith('#entity-')), 'record types keep #entity-<Name> in the search export');
  }
});

// ------------------------------------------------------------ the index rules

test('a record type and a component of one model must not share a name, and the message names both', () => {
  const json = modelspecWithComponents();
  json.models[0].components[1].name = 'Album';
  assert.throws(() => validateModelspecIndex(json), /models\[0\]\.components\[1\]\.name duplicates the record type Album \(models\[0\]\.entities\[1\]\.name\): record types and components share one namespace/);
  // the same, in the current spelling, where the path names the key that was read
  assert.throws(() => validateModelspecIndex(currentSpelling(json)), /models\[0\]\.components\[1\]\.name duplicates the record type Album \(models\[0\]\.records\[1\]\.name\)/);
  // the same name in another model is not a clash: ids are per page
  const two = modelspecWithComponents();
  const other = structuredClone(two.models[0]);
  other.id = 'other';
  other.address = 'modelspec://github.com/acme/shop/other';
  other.components = [{ name: 'Album', fields: [{ name: 'x', type: 'int' }] }];
  other.entities = [{ name: 'Artist', key: [], properties: [] }];
  two.models.push(other);
  assert.equal(validateModelspecIndex(two).models.length, 2);
});

test('the clash is real: without the rule a record type and a component of one name would share #field-<Name>-<member>', () => {
  const json = modelspecWithComponents();
  json.models[0].components.push({ name: 'Artist', fields: [{ name: 'ArtistId', type: 'int' }] });
  assert.throws(() => validateModelspecIndex(json), /duplicates the record type Artist/);
  // forced past the validator, the page refuses it too: two ids are never equal
  const data = sampleData({ modelspec: modelspecWithComponents() });
  data.modelspec.models[0].components.push({ name: 'Artist', fields: [{ name: 'ArtistId', type: 'int', required: false }] });
  assert.throws(() => renderRegistryPages(data, ctx, shell), /duplicate element id "field-Artist-ArtistId"/);
});

test('collection was removed: the key is accepted when absent or an empty list and ignored, and refused otherwise, naming the word', () => {
  const read = collections => {
    const json = modelspecJson();
    if (collections !== undefined) json.models[0].collections = collections;
    return validateModelspecIndex(json).models[0];
  };
  for (const accepted of [undefined, []]) {
    const model = read(accepted);
    assert.equal('collections' in model, false, 'nothing of it is read');
    assert.equal(model.entities.length, 2);
  }
  const refusal = /models\[0\]\.collections is not accepted: ModelSpec removed the collection/;
  for (const refused of [[{ name: 'ArtistViews', kind: 'computed', source: 'Artist', query: 'SELECT 1', fields: [] }], [{}], null, {}, 'Views', 0]) {
    assert.throws(() => read(refused), refusal, JSON.stringify(refused));
  }
  const index = currentSpelling(modelspecJson());
  index.models[0].collections = [{ name: 'V' }];
  assert.throws(() => validateModelspecIndex(index), refusal);
});
