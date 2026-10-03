import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { checksumOf, deriveTwoByAddress, deriveTwoDatabases, markAsFixture } from '../tools/make-fixtures.mjs';
import { directoryJson, graphsJson, modelspecJson } from './helpers.mjs';

const withChecksum = (json, list) => ({ ...json, checksum: checksumOf(json[list]) });

test('markAsFixture keeps the list and checksum and adds the marker', () => {
  const real = withChecksum(modelspecJson(), 'models');
  const fixture = markAsFixture('modelspec', real, 'https://example.com/index.json');
  assert.deepEqual(fixture.models, real.models);
  assert.equal(fixture.checksum, real.checksum);
  assert.equal(fixture._fixture.copied_from, 'https://example.com/index.json');
  assert.match(fixture._fixture.note, /must never be deployed/);
});

test('markAsFixture refuses a wrong checksum, an invalid index and a fixture', () => {
  assert.throws(() => markAsFixture('modelspec', modelspecJson(), 'x'), /does not match/);
  assert.throws(() => markAsFixture('directory', { ...directoryJson(), format: 'x' }, 'x'), /format/);
  const real = withChecksum(graphsJson(), 'graphs');
  assert.throws(() => markAsFixture('meaninggraph', { ...real, _fixture: {} }, 'x'), /already a fixture/);
});

test('the derived Directory fixture adds a second database naming the model by address, with a valid checksum', () => {
  const marked = markAsFixture('directory', withChecksum(directoryJson(), 'databases'), 'x');
  const two = deriveTwoDatabases(marked, 'fixtures/x.json');
  assert.equal(two.databases.length, marked.databases.length + 1);
  assert.equal(two.checksum, checksumOf(two.databases));
  assert.equal(two._fixture.derived_from, 'fixtures/x.json');
  const added = two.databases.at(-1);
  assert.equal(added.model.address, 'modelspec://github.com/acme/shop/shop');
  assert.equal(two.databases[0].model.address, undefined, 'the first database still names the model by repository and path');
  assert.match(added.url, /^https:\/\//);
});

test('every committed fixture carries a top-level _fixture marker naming its origin', async () => {
  for (const name of ['modelspec-registry-index', 'meaninggraph-registry-index', 'ovdb-directory-index', 'ovdb-directory-index.two-databases', 'ovdb-directory-index.two-by-address']) {
    const json = JSON.parse(await readFile(new URL(`../fixtures/${name}.fixture.json`, import.meta.url), 'utf8'));
    assert.ok(json._fixture?.note, name);
    assert.ok(json._fixture.copied_from || json._fixture.derived_from, name);
  }
});

test('the by-address Directory fixture has both databases naming the model by the same address', () => {
  const marked = markAsFixture('directory', withChecksum(directoryJson(), 'databases'), 'x');
  const two = deriveTwoByAddress(marked, 'fixtures/x.json');
  assert.equal(two.databases.length, marked.databases.length + 1);
  assert.equal(two.checksum, checksumOf(two.databases));
  assert.equal(two.databases[0].model.address, 'modelspec://github.com/acme/shop/shop');
  assert.equal(two.databases.at(-1).model.address, 'modelspec://github.com/acme/shop/shop');
  assert.equal(marked.databases[0].model.address, undefined, 'the source fixture is not modified');
});
