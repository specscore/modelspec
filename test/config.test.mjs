import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULTS, OUT_NAMES, resolveBuildConfig } from '../src/config.mjs';
import { REPO } from './helpers.mjs';

const resolveWith = (argv = [], env = {}) => resolveBuildConfig(argv, env, { root: REPO });

test('no flags and no variables is a production build written to dist/', () => {
  const c = resolveWith();
  assert.equal(c.mode, 'production');
  assert.equal(c.production, true);
  assert.equal(c.outName, 'dist');
  assert.equal(c.sources.modelspec.location, DEFAULTS.modelspecRegistryIndex);
  assert.equal(c.sources.meaninggraph.location, DEFAULTS.meaningGraphRegistryIndex);
  assert.equal(c.sources.directory.location, DEFAULTS.ovdbDirectoryIndex);
  assert.equal(c.meaningGraphBaseUrl, 'https://meaninggraph.io');
  assert.equal(c.ovdbDirectoryBaseUrl, 'https://directory.openvaultdb.com');
});

test('the default index addresses are the three main branches', () => {
  assert.equal(DEFAULTS.modelspecRegistryIndex, 'https://raw.githubusercontent.com/modelspec-org/registry/main/index.json');
  assert.equal(DEFAULTS.meaningGraphRegistryIndex, 'https://raw.githubusercontent.com/meaninggraph/registry/main/index.json');
  assert.equal(DEFAULTS.ovdbDirectoryIndex, 'https://raw.githubusercontent.com/openvaultdb/directory/main/index.json');
});

test('a fixture build is non-production, goes to dist-fixture and reads every index from a fixture', () => {
  const c = resolveWith(['--use-fixture']);
  assert.equal(c.mode, 'fixture');
  assert.equal(c.production, false);
  assert.equal(c.outName, 'dist-fixture');
  assert.deepEqual(Object.values(c.sources).map(s => s.kind), ['fixture', 'fixture', 'fixture']);
  assert.equal(c.fixtureSet, 'default');
});

test('the two-databases fixture set only swaps the Directory fixture', () => {
  const a = resolveWith(['--use-fixture']);
  const b = resolveWith(['--use-fixture', '--fixture-set', 'two-databases']);
  assert.equal(a.sources.modelspec.location, b.sources.modelspec.location);
  assert.notEqual(a.sources.directory.location, b.sources.directory.location);
  assert.match(b.sources.directory.location, /two-databases/);
  assert.throws(() => resolveWith(['--use-fixture', '--fixture-set', 'nope']), /Unknown fixture set/);
  assert.throws(() => resolveWith(['--fixture-set', 'two-databases']), /only goes with --use-fixture/);
});

test('another https index makes the build non-production and keeps it out of dist/', () => {
  const env = { MODELSPEC_REGISTRY_INDEX_URL: 'https://raw.githubusercontent.com/x/y/branch/index.json' };
  const c = resolveWith([], env);
  assert.equal(c.mode, 'nonproduction');
  assert.equal(c.outName, 'dist-nonprod');
  assert.equal(c.sources.modelspec.kind, 'url-custom');
  assert.throws(() => resolveWith(['--out', 'dist'], env), /Refusing to write a nonproduction build into dist\//);
});

test('a non-default base URL makes the build non-production', () => {
  const c = resolveWith(['--use-fixture'], { MEANINGGRAPH_BASE_URL: 'http://127.0.0.1:4010/' });
  assert.equal(c.meaningGraphBaseUrl, 'http://127.0.0.1:4010');
  const real = resolveWith([], { OVDB_DIRECTORY_BASE_URL: 'http://localhost:3000' });
  assert.equal(real.production, false);
  assert.equal(real.mode, 'nonproduction');
});

test('base URLs must be https, or http on localhost, without credentials, query or fragment', () => {
  for (const bad of ['http://example.com', 'ftp://example.com', 'javascript:alert(1)', 'nonsense', 'https://u:p@example.com', 'https://example.com/?a=1', 'https://example.com/#x']) {
    assert.throws(() => resolveWith(['--use-fixture'], { MEANINGGRAPH_BASE_URL: bad }), /MEANINGGRAPH_BASE_URL/, bad);
  }
});

test('an http index URL is refused', () => {
  assert.throws(() => resolveWith([], { OVDB_DIRECTORY_INDEX_URL: 'http://example.com/index.json' }), /must be an https URL/);
});

test('a local index needs --allow-local-index and is a local build', () => {
  const env = { OVDB_DIRECTORY_INDEX_URL: 'fixtures/ovdb-directory-index.fixture.json' };
  assert.throws(() => resolveWith([], env), /--allow-local-index/);
  const c = resolveWith(['--allow-local-index'], env);
  assert.equal(c.mode, 'local');
  assert.equal(c.outName, 'dist-nonprod');
  assert.equal(c.sources.directory.kind, 'local');
  assert.throws(() => resolveWith(['--allow-local-index', '--out', 'dist'], env), /Refusing to write a local build into dist\//);
});

test('--use-fixture refuses every index variable and --allow-local-index', () => {
  for (const name of ['MODELSPEC_REGISTRY_INDEX_URL', 'MEANINGGRAPH_REGISTRY_INDEX_URL', 'OVDB_DIRECTORY_INDEX_URL']) {
    assert.throws(() => resolveWith(['--use-fixture'], { [name]: DEFAULTS.ovdbDirectoryIndex }), new RegExp(`${name}.*both set|both set`));
  }
  assert.throws(() => resolveWith(['--use-fixture', '--allow-local-index']), /alternatives/);
});

test('--out accepts only the fixed names, exactly', () => {
  for (const name of OUT_NAMES.filter(n => n !== 'dist')) assert.equal(resolveWith(['--use-fixture', '--out', name]).outName, name);
  for (const bad of ['public', 'spec', 'schema', '.', '..', '/', '/tmp/x', '../dist-e2e', 'dist/sub', 'dist-e2e/', 'DIST-E2E', 'Dist', 'dist-', 'src', 'node_modules', '']) {
    assert.throws(() => resolveWith(['--use-fixture', '--out', bad]), /--out|needs a value/, JSON.stringify(bad));
  }
});

test('dist/ is for production builds only, and production builds only go to dist/', () => {
  assert.throws(() => resolveWith(['--use-fixture', '--out', 'dist']), /Refusing to write a fixture build into dist\//);
  assert.throws(() => resolveWith(['--out', 'dist-fixture']), /production build is written to dist\/ only/);
  assert.equal(resolveWith(['--out', 'dist']).outName, 'dist');
});

test('unknown arguments and missing values are refused', () => {
  assert.throws(() => resolveWith(['--assets', 'x']), /Unknown argument/);
  assert.throws(() => resolveWith(['--out']), /needs a value/);
  assert.throws(() => resolveWith(['--out', '--use-fixture']), /needs a value/);
});
