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

test('a fixture set is looked up as an own property: __proto__, constructor and the like are refused, and never production', () => {
  for (const name of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
    assert.throws(() => resolveWith(['--use-fixture', '--fixture-set', name, '--out', 'dist']), /Unknown fixture set/, name);
    assert.throws(() => resolveWith(['--use-fixture', '--fixture-set', name]), /Unknown fixture set/, name);
  }
  assert.equal(resolveWith(['--use-fixture', '--fixture-set', 'two-by-address']).fixtureSet, 'two-by-address');
  assert.match(resolveWith(['--use-fixture', '--fixture-set', 'two-by-address']).sources.directory.location, /two-by-address/);
});

test('a fixture build is never production, whatever it reads', () => {
  const c = resolveWith(['--use-fixture']);
  assert.equal(c.production, false);
  assert.equal(Object.keys(c.sources).length, 3);
});

const PIN = { MODELSPEC_REGISTRY_INDEX_COMMIT: 'd'.repeat(40), MEANINGGRAPH_REGISTRY_INDEX_COMMIT: 'e'.repeat(40), OVDB_DIRECTORY_INDEX_COMMIT: 'f'.repeat(40) };
const PINNED = {
  modelspec: `https://raw.githubusercontent.com/modelspec-org/registry/${'d'.repeat(40)}/index.json`,
  meaninggraph: `https://raw.githubusercontent.com/meaninggraph/registry/${'e'.repeat(40)}/index.json`,
  directory: `https://raw.githubusercontent.com/openvaultdb/directory/${'f'.repeat(40)}/index.json`,
};

test('the three index commits are all-or-none and name the URLs the build reads; the build is still production, written to dist/', () => {
  const none = resolveWith();
  assert.deepEqual(none.indexCommits, { modelspec: null, meaninggraph: null, ovdbDirectory: null });
  const c = resolveWith([], PIN);
  assert.deepEqual(Object.fromEntries(Object.entries(c.sources).map(([key, source]) => [key, [source.kind, source.location]])), {
    modelspec: ['url', PINNED.modelspec], meaninggraph: ['url', PINNED.meaninggraph], directory: ['url', PINNED.directory],
  });
  assert.deepEqual(c.indexCommits, { modelspec: 'd'.repeat(40), meaninggraph: 'e'.repeat(40), ovdbDirectory: 'f'.repeat(40) });
  assert.equal(c.mode, 'production');
  assert.equal(c.production, true);
  assert.equal(c.outName, 'dist');
  assert.throws(() => resolveWith([], { MODELSPEC_REGISTRY_INDEX_COMMIT: 'd'.repeat(40) }), /is set without the commits of the other indexes/);
  assert.throws(() => resolveWith([], { ...PIN, OVDB_DIRECTORY_INDEX_COMMIT: 'main' }), /OVDB_DIRECTORY_INDEX_COMMIT must be 40 lower-case hex digits/);
  assert.throws(() => resolveWith([], { ...PIN, MEANINGGRAPH_REGISTRY_INDEX_URL: 'https://example.test/i.json' }), /MEANINGGRAPH_REGISTRY_INDEX_URL and MEANINGGRAPH_REGISTRY_INDEX_COMMIT are mutually exclusive/);
});

test('an index URL that is the pinned URL of its repository is still production and records that commit; any other repository or form is not', () => {
  const c = resolveWith([], { OVDB_DIRECTORY_INDEX_URL: PINNED.directory });
  assert.equal(c.production, true);
  assert.deepEqual(c.indexCommits, { modelspec: null, meaninggraph: null, ovdbDirectory: 'f'.repeat(40) });
  for (const url of [PINNED.modelspec, PINNED.directory.replace('openvaultdb', 'fork'), PINNED.directory.replace('f'.repeat(40), 'some-branch'), `${PINNED.directory}?x=1`, 'https://raw.githubusercontent.com/openvaultdb/directory/main/other.json']) {
    const other = resolveWith(['--allow-local-index'], { OVDB_DIRECTORY_INDEX_URL: url });
    assert.equal(other.production, false, url);
    assert.equal(other.mode, 'nonproduction', url);
    assert.equal(other.outName, 'dist-nonprod');
  }
});

test('a fixture build ignores the index commits and stays a fixture build', () => {
  const c = resolveWith(['--use-fixture'], PIN);
  assert.equal(c.mode, 'fixture');
  assert.deepEqual(c.indexCommits, { modelspec: null, meaninggraph: null, ovdbDirectory: null });
});
