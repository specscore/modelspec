// Build configuration: where the three indexes come from, which sites the pages
// link to, and which directory the site is written to. Pure, so it can be unit
// tested.
//
// A build is PRODUCTION only when it reads all three indexes from their default
// https addresses and links the real MeaningGraph and OVDB Directory sites. It is
// then written to dist/, the directory the Worker serves, and nowhere else.
// Anything else (fixtures, another https index, a local file, a local base URL)
// is a NON-production build: it goes to its own directory, never dist/, and says
// so on every page and in build-info.json.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULTS = Object.freeze({
  modelspecRegistryIndex: 'https://raw.githubusercontent.com/modelspec-org/registry/main/index.json',
  meaningGraphRegistryIndex: 'https://raw.githubusercontent.com/meaninggraph/registry/main/index.json',
  ovdbDirectoryIndex: 'https://raw.githubusercontent.com/openvaultdb/directory/main/index.json',
  meaningGraphBaseUrl: 'https://meaninggraph.io',
  ovdbDirectoryBaseUrl: 'https://directory.openvaultdb.com',
});

/** The indexes a notification can name (keys of the checksums the build records). */
export const AWAITABLE = ['modelspec', 'meaninggraph', 'ovdbDirectory'];

/** The public address of this site: the build marker is served there, and the deploy workflow checks it. */
export const SITE_URL = 'https://modelspec.org';

/** The committed fixtures: marked copies of real indexes, relative to the repository root. */
export const FIXTURE_SETS = Object.freeze({
  default: Object.freeze({
    modelspec: 'fixtures/modelspec-registry-index.fixture.json',
    meaninggraph: 'fixtures/meaninggraph-registry-index.fixture.json',
    directory: 'fixtures/ovdb-directory-index.fixture.json',
  }),
  // The same indexes, but the Directory lists a second database of the Chinook model
  // (found by its model.address; the first is still found by repository and model path).
  'two-databases': Object.freeze({
    modelspec: 'fixtures/modelspec-registry-index.fixture.json',
    meaninggraph: 'fixtures/meaninggraph-registry-index.fixture.json',
    directory: 'fixtures/ovdb-directory-index.two-databases.fixture.json',
  }),
  // Both databases name the model by `model.address`, as Directory entries will once their manifests do.
  'two-by-address': Object.freeze({
    modelspec: 'fixtures/modelspec-registry-index.fixture.json',
    meaninggraph: 'fixtures/meaninggraph-registry-index.fixture.json',
    directory: 'fixtures/ovdb-directory-index.two-by-address.fixture.json',
  }),
});

/** The directory the Worker serves (wrangler.jsonc assets.directory). Only a production build is written here. */
export const DEPLOY_DIR_NAME = 'dist';

/** The only names `--out` accepts: one directory beside public/, fixed, so nothing else can be deleted. */
export const OUT_NAMES = Object.freeze([DEPLOY_DIR_NAME, 'dist-fixture', 'dist-nonprod', 'dist-check', 'dist-e2e', 'dist-e2e-two', 'dist-e2e-address']);

export const BUILD_MODES = Object.freeze(['production', 'nonproduction', 'local', 'fixture']);

const FLAGS_WITH_VALUE = ['--out', '--fixture-set'];
const FLAGS = ['--use-fixture', '--allow-local-index'];

function parseArgs(argv) {
  const flags = new Set();
  const values = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (FLAGS.includes(arg)) {
      flags.add(arg);
    } else if (FLAGS_WITH_VALUE.includes(arg)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
      values[arg] = value;
      i++;
    } else {
      throw new Error(`Unknown argument ${JSON.stringify(arg)}. Known: ${[...FLAGS, ...FLAGS_WITH_VALUE.map(f => `${f} <value>`)].join(', ')}`);
    }
  }
  return { flags, values };
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/** A site's base URL: https, or http on a loopback host (local builds of the sibling sites). No credentials, query or fragment. */
export function normaliseBaseUrl(name, value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL, got ${JSON.stringify(value)}`);
  }
  const loopbackHttp = url.protocol === 'http:' && LOOPBACK.has(url.hostname);
  if (url.protocol !== 'https:' && !loopbackHttp) {
    throw new Error(`${name} must be an https URL (http only for localhost), got ${JSON.stringify(value)}`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} must not carry credentials, a query or a fragment, got ${JSON.stringify(value)}`);
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

function indexSource({ envName, value, fallback, allowLocal, root }) {
  const location = value?.trim() || fallback;
  if (/^https:\/\//i.test(location)) {
    return { kind: location === fallback ? 'url' : 'url-custom', location };
  }
  if (/^http:\/\//i.test(location)) throw new Error(`${envName} must be an https URL, got ${location}`);
  if (!allowLocal) {
    throw new Error(`${envName} ${location} is a local path: pass --allow-local-index to build from a local file (the site is then labelled as a local build and never written to ${DEPLOY_DIR_NAME}/)`);
  }
  return { kind: 'local', location: resolve(root, location) };
}

const ENV_NAMES = {
  modelspec: 'MODELSPEC_REGISTRY_INDEX_URL',
  meaninggraph: 'MEANINGGRAPH_REGISTRY_INDEX_URL',
  directory: 'OVDB_DIRECTORY_INDEX_URL',
};

/**
 * Decide where the three indexes come from, what the pages link to and where
 * the output goes. Throws with the reason for anything it refuses.
 */
export function resolveBuildConfig(argv, env, { root = ROOT } = {}) {
  const { flags, values } = parseArgs(argv);
  const useFixture = flags.has('--use-fixture');
  const allowLocal = flags.has('--allow-local-index');
  const fixtureSetName = values['--fixture-set'];
  if (fixtureSetName !== undefined && !useFixture) throw new Error('--fixture-set only goes with --use-fixture');
  if (useFixture && allowLocal) throw new Error('--use-fixture and --allow-local-index are alternatives: choose one data source');

  const explicit = Object.fromEntries(Object.entries(ENV_NAMES).map(([key, name]) => [key, env[name]?.trim() || '']));
  const setNames = Object.entries(explicit).filter(([, value]) => value).map(([key]) => ENV_NAMES[key]);

  let sources;
  let fixtureSet = null;
  if (useFixture) {
    if (setNames.length > 0) {
      throw new Error(`--use-fixture and ${setNames.join(', ')} are both set: choose one data source`);
    }
    fixtureSet = fixtureSetName ?? 'default';
    // An own-property lookup: `__proto__`, `constructor` and the like are not fixture sets.
    const files = Object.hasOwn(FIXTURE_SETS, fixtureSet) ? FIXTURE_SETS[fixtureSet] : undefined;
    if (!files) throw new Error(`Unknown fixture set ${JSON.stringify(fixtureSet)}. Known: ${Object.keys(FIXTURE_SETS).join(', ')}`);
    sources = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, { kind: 'fixture', location: resolve(root, file) }]));
  } else {
    sources = {
      modelspec: indexSource({ envName: ENV_NAMES.modelspec, value: explicit.modelspec, fallback: DEFAULTS.modelspecRegistryIndex, allowLocal, root }),
      meaninggraph: indexSource({ envName: ENV_NAMES.meaninggraph, value: explicit.meaninggraph, fallback: DEFAULTS.meaningGraphRegistryIndex, allowLocal, root }),
      directory: indexSource({ envName: ENV_NAMES.directory, value: explicit.directory, fallback: DEFAULTS.ovdbDirectoryIndex, allowLocal, root }),
    };
  }

  // The commit of this repository being built, recorded in build-info.json (set by the deploy workflow).
  const commit = env.BUILD_COMMIT?.trim() || '';
  if (commit && !/^[0-9a-f]{40}$/i.test(commit)) {
    throw new Error(`BUILD_COMMIT must be a full 40-digit commit id, got ${JSON.stringify(commit)}`);
  }

  // After a notification, check-fresh.mjs names the index that changed and its new checksum; the build refuses an
  // index that does not carry it (a cached read of the old one must not be published). A fixture build reads no
  // live index, so it awaits nothing.
  const awaitIndex = env.AWAIT_INDEX?.trim() || '';
  const awaitChecksum = env.AWAIT_CHECKSUM?.trim() || '';
  if (awaitIndex || awaitChecksum) {
    if (!AWAITABLE.includes(awaitIndex) || !/^sha256:[0-9a-f]{64}$/.test(awaitChecksum)) {
      throw new Error(`AWAIT_INDEX must be one of ${AWAITABLE.join(', ')} and AWAIT_CHECKSUM sha256:<64 hex>, together`);
    }
  }

  const meaningGraphBaseUrl = normaliseBaseUrl('MEANINGGRAPH_BASE_URL', env.MEANINGGRAPH_BASE_URL?.trim() || DEFAULTS.meaningGraphBaseUrl);
  const ovdbDirectoryBaseUrl = normaliseBaseUrl('OVDB_DIRECTORY_BASE_URL', env.OVDB_DIRECTORY_BASE_URL?.trim() || DEFAULTS.ovdbDirectoryBaseUrl);

  const kinds = Object.values(sources).map(source => source.kind);
  const production = !useFixture
    && kinds.length === 3
    && kinds.every(kind => kind === 'url')
    && meaningGraphBaseUrl === DEFAULTS.meaningGraphBaseUrl
    && ovdbDirectoryBaseUrl === DEFAULTS.ovdbDirectoryBaseUrl;
  let mode;
  if (useFixture) mode = 'fixture';
  else if (kinds.includes('local')) mode = 'local';
  else mode = production ? 'production' : 'nonproduction';

  const outName = values['--out'] ?? { production: DEPLOY_DIR_NAME, fixture: 'dist-fixture', local: 'dist-nonprod', nonproduction: 'dist-nonprod' }[mode];
  if (!OUT_NAMES.includes(outName)) {
    throw new Error(`Refusing --out ${JSON.stringify(outName)}: the output directory must be one of ${OUT_NAMES.join(', ')}`);
  }
  if (production && outName !== DEPLOY_DIR_NAME) {
    throw new Error(`A production build is written to ${DEPLOY_DIR_NAME}/ only, not to ${outName}/`);
  }
  if (!production && outName === DEPLOY_DIR_NAME) {
    throw new Error(`Refusing to write a ${mode} build into ${DEPLOY_DIR_NAME}/, the directory that gets deployed: only a build from the three production indexes may go there`);
  }

  return {
    mode,
    production,
    commit: commit.toLowerCase(),
    awaited: awaitIndex && !useFixture ? { key: awaitIndex, checksum: awaitChecksum } : null,
    fixtureSet,
    sources,
    meaningGraphBaseUrl,
    ovdbDirectoryBaseUrl,
    outName,
    outDir: resolve(root, outName),
  };
}
