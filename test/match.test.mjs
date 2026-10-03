import assert from 'node:assert/strict';
import { test } from 'node:test';
import { databasesForModel, graphsForModel } from '../src/match.mjs';
import { ADDRESS, COMMIT, directoryJson, graphsJson, sampleData } from './helpers.mjs';

const model = data => data.modelspec.models[0];

test('graphs are found by repository and model file', () => {
  const data = sampleData();
  assert.deepEqual(graphsForModel(model(data), data.meaninggraph.graphs).map(g => g.id), ['chinook']);
});

test('a graph that binds the JSON AST of the model also matches', () => {
  const data = sampleData({ graphs: graphsJson({ graphs: [{ ...graphsJson().graphs[0], model_files: ['model/shop.modelspec.json'] }] }) });
  assert.deepEqual(graphsForModel(model(data), data.meaninggraph.graphs).map(g => g.id), ['chinook']);
});

test('same file name in another repository, or another file in the same repository, does not match', () => {
  const g = graphsJson().graphs[0];
  const data = sampleData({ graphs: graphsJson({ graphs: [
    { ...g, id: 'other-repo', repository: 'https://github.com/acme/elsewhere' },
    { ...g, id: 'other-file', model_files: ['model/other.modelspec.hcl'] },
    { ...g, id: 'no-files', model_files: undefined },
    { ...g, id: 'case-insensitive', repository: 'https://github.com/ACME/Shop.git' },
  ] }) });
  assert.deepEqual(graphsForModel(model(data), data.meaninggraph.graphs).map(g => g.id), ['case-insensitive']);
});

test('two databases naming the same model are both found, in Directory order', () => {
  const data = sampleData();
  const found = databasesForModel(model(data), data.directory.databases);
  assert.deepEqual(found.map(f => [f.database.id, f.via]), [['chinook', 'repository'], ['chinook-two', 'address']]);
});

test('a database is found by model.address, whatever its repository and path, with or without a ?ref pin', () => {
  const dbs = directoryJson().databases;
  const data = sampleData({ directory: directoryJson({ databases: [
    { ...dbs[1], id: 'pinned', model: { address: `${ADDRESS}?ref=${COMMIT}` } },
    { ...dbs[1], id: 'other-address', model: { address: 'modelspec://github.com/acme/shop/other', path: 'model/shop.modelspec.hcl' } },
  ] }) });
  assert.deepEqual(databasesForModel(model(data), data.directory.databases).map(f => f.database.id), ['pinned']);
});

test('the repository and path fallback applies only while model.address is absent', () => {
  const db = directoryJson().databases[0];
  const data = sampleData({ directory: directoryJson({ databases: [
    { ...db, id: 'by-path' },
    { ...db, id: 'wrong-path', model: { path: 'model/x.hcl' } },
    { ...db, id: 'wrong-repo', repository: 'https://github.com/acme/other' },
    { ...db, id: 'no-model', model: undefined },
    { ...db, id: 'address-wins', model: { path: 'model/shop.modelspec.hcl', address: 'modelspec://github.com/acme/shop/other' } },
  ] }) });
  assert.deepEqual(databasesForModel(model(data), data.directory.databases).map(f => f.database.id), ['by-path']);
});

test('no match gives empty lists', () => {
  const data = sampleData({ graphs: graphsJson({ graphs: [] }), directory: directoryJson({ databases: [] }) });
  assert.deepEqual(graphsForModel(model(data), data.meaninggraph.graphs), []);
  assert.deepEqual(databasesForModel(model(data), data.directory.databases), []);
});

test('journey step 9, by address: two databases that both name model.address are both found', () => {
  const dbs = directoryJson().databases;
  const data = sampleData({ directory: directoryJson({ databases: [
    { ...dbs[0], id: 'first', model: { name: 'shop', path: 'model/shop.modelspec.hcl', address: ADDRESS } },
    { ...dbs[1], id: 'second' },
  ] }) });
  const found = databasesForModel(model(data), data.directory.databases);
  assert.deepEqual(found.map(f => [f.database.id, f.via]), [['first', 'address'], ['second', 'address']]);
});

test('the owner and repository of an address are compared without case, the module with case', () => {
  const dbs = directoryJson().databases;
  const data = sampleData({ directory: directoryJson({ databases: [
    { ...dbs[1], id: 'upper', model: { address: `modelspec://github.com/ACME/Shop/shop?ref=${COMMIT}` } },
    { ...dbs[1], id: 'other-module-case', model: { address: 'modelspec://github.com/acme/shop/Shop' } },
  ] }) });
  assert.deepEqual(databasesForModel(model(data), data.directory.databases).map(f => f.database.id), ['upper']);
});
