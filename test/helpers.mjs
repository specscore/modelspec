import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULTS, resolveBuildConfig } from '../src/config.mjs';
import { validateDirectoryIndex, validateMeaningGraphIndex, validateModelspecIndex } from '../src/indexes.mjs';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const COMMIT = 'a'.repeat(40);
export const CHECKSUM = `sha256:${'0'.repeat(64)}`;

export const ADDRESS = 'modelspec://github.com/acme/shop/shop';

/** A small, complete ModelSpec registry index (raw JSON, as the registry writes it). */
export function modelspecJson(overrides = {}) {
  return {
    format: 'modelspec-registry/draft-1',
    checksum: CHECKSUM,
    models: [{
      id: 'chinook',
      title: 'Chinook music store',
      description: 'The Chinook model.',
      status: 'draft',
      address: ADDRESS,
      repository: 'https://github.com/acme/shop',
      commit: COMMIT,
      licence: 'MIT',
      files: { source: 'model/shop.modelspec.hcl', json: 'model/shop.modelspec.json' },
      maintainers: ['someone'],
      entities: [
        { name: 'Artist', key: ['ArtistId'], properties: [
          { name: 'ArtistId', type: 'int', required: true, key: true },
          { name: 'Name', type: 'string', required: false, key: false },
        ] },
        { name: 'Album', key: ['AlbumId'], properties: [
          { name: 'AlbumId', type: 'int', required: true, key: true },
          { name: 'ArtistId', type: 'reference', references: 'Artist', required: true, key: false },
        ] },
      ],
    }],
    ...overrides,
  };
}

export function graphsJson(overrides = {}) {
  return {
    format: 'meaning-registry/draft-1',
    checksum: CHECKSUM,
    graphs: [
      { id: 'chinook', title: 'Chinook meanings', description: 'What Chinook means.', kind: 'dataset', status: 'draft', repository: 'https://github.com/acme/shop', model_files: ['model/shop.modelspec.hcl'] },
      { id: 'core', title: 'Core', kind: 'universal', repository: 'https://github.com/acme/core' },
    ],
    ...overrides,
  };
}

export function directoryJson(overrides = {}) {
  return {
    format: 'ovdb-directory/draft-1',
    checksum: CHECKSUM,
    databases: [
      { id: 'chinook', title: 'Chinook db', status: 'draft', url: 'https://one.example/ovdb/dbs/chinook', repository: 'https://github.com/acme/shop', model: { name: 'shop', path: 'model/shop.modelspec.hcl' } },
      { id: 'chinook-two', title: 'Chinook two', status: 'draft', url: 'https://two.example/ovdb/dbs/chinook', repository: 'https://git.example.com/other/hosting', model: { name: 'shop', path: 'x.hcl', address: ADDRESS } },
      { id: 'unrelated', title: 'Unrelated', status: 'draft', url: 'https://three.example/ovdb/dbs/u', repository: 'https://github.com/acme/other', model: { name: 'o', path: 'o.hcl' } },
    ],
    ...overrides,
  };
}

/** Validated indexes for buildSite and the render functions. */
export function sampleData({ modelspec, graphs, directory } = {}) {
  return {
    modelspec: validateModelspecIndex(modelspec ?? modelspecJson()),
    meaninggraph: validateMeaningGraphIndex(graphs ?? graphsJson()),
    directory: validateDirectoryIndex(directory ?? directoryJson()),
  };
}

export const config = (argv = ['--use-fixture'], env = {}) => resolveBuildConfig(argv, env, { root: REPO });

/** A production configuration, for tests that build a production directory in a temp root (never in the repo). */
export function productionConfig(root, overrides = {}) {
  return {
    mode: 'production',
    production: true,
    fixtureSet: null,
    sources: {
      modelspec: { kind: 'url', location: DEFAULTS.modelspecRegistryIndex },
      meaninggraph: { kind: 'url', location: DEFAULTS.meaningGraphRegistryIndex },
      directory: { kind: 'url', location: DEFAULTS.ovdbDirectoryIndex },
    },
    meaningGraphBaseUrl: DEFAULTS.meaningGraphBaseUrl,
    ovdbDirectoryBaseUrl: DEFAULTS.ovdbDirectoryBaseUrl,
    outName: 'dist',
    outDir: join(root, 'dist'),
    ...overrides,
  };
}

/** A throwaway repository root holding a copy of the real public/ and schema/. */
export async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), 'modelspec-test-'));
  await cp(join(REPO, 'public'), join(root, 'public'), { recursive: true });
  await cp(join(REPO, 'schema'), join(root, 'schema'), { recursive: true });
  await mkdir(join(root, 'spec'), { recursive: true });
  await writeFile(join(root, 'spec', 'keep.md'), 'keep');
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}

export const read = (...parts) => readFile(join(...parts), 'utf8');

/** The sample ModelSpec index with a component and an entity that embeds it, as the registry's `use` and `components` list them. */
export function modelspecWithComponents() {
  const json = modelspecJson();
  const [artist, album] = json.models[0].entities;
  artist.use = ['Auditable', 'Elsewhere.Tagged'];
  artist.properties.push({ name: 'Audit', type: 'component', component: 'Auditable', required: false, key: false });
  album.use = [];
  json.models[0].components = [
    { name: 'Auditable', fields: [
      { name: 'createdAt', type: 'datetime', required: true },
      { name: 'createdBy', type: 'reference', references: 'Artist', required: false },
      { name: 'meta', type: 'component', component: 'Auditable', required: false },
    ] },
    { name: 'Empty', fields: [] },
  ];
  return json;
}
