// Reading and validating the three indexes the registry pages are built from:
//   modelspec-registry/draft-1   models with their entities and properties
//   meaning-registry/draft-1     MeaningGraph graphs (which model files they bind)
//   ovdb-directory/draft-1       OVDB Directory databases (which model they use)
//
// The indexes are untrusted input: ids become path segments, names become
// element ids and every URL ends up in an href. Each validator checks what the
// pages use and ignores the rest (the formats are drafts and may gain fields),
// and the build fails loudly on any violation. There is no fallback to older or
// hand-written data.

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const MODELSPEC_FORMAT = 'modelspec-registry/draft-1';
export const MEANINGGRAPH_FORMAT = 'meaning-registry/draft-1';
export const DIRECTORY_FORMAT = 'ovdb-directory/draft-1';

export class IndexError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'IndexError';
  }
}

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NAME = /^[A-Za-z0-9_]+$/;
const REFERENCE = /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/;
const HANDLE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const COMMIT = /^[0-9a-f]{40}$/;
const CHECKSUM = /^sha256:[0-9a-f]{64}$/;
const SEGMENT = '[A-Za-z0-9_.-]+';
// A registered model's address is unpinned; a database may pin the model it uses with ?ref=<commit>.
const MODEL_ADDRESS = new RegExp(`^modelspec://github\\.com/${SEGMENT}/${SEGMENT}/${SEGMENT}$`);
const PINNED_MODEL_ADDRESS = new RegExp(`^modelspec://github\\.com/${SEGMENT}/${SEGMENT}/${SEGMENT}(\\?ref=[0-9a-f]{40})?$`);
const GITHUB_REPOSITORY = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

// ---------------------------------------------------------------- reading

const TIMEOUT_MS = 30_000;
const RETRIES = 2;

/**
 * The text of an index: an https URL (retried on network errors and 5xx) or,
 * when the caller allowed it, a local file. Every failure throws.
 */
export async function readIndexText(location, { fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS, retries = RETRIES } = {}) {
  if (/^http:\/\//i.test(location)) throw new IndexError(`Refusing to read an index over plain http: ${location}`);
  if (!/^https:\/\//i.test(location)) {
    try {
      return await readFile(location, 'utf8');
    } catch (error) {
      throw new IndexError(`Cannot read the index file ${location}: ${error.message}`, { cause: error });
    }
  }
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let response;
    try {
      response = await fetchImpl(location, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json', 'user-agent': 'modelspec-org-build' } });
    } catch (error) {
      lastError = error.message;
      continue;
    }
    if (response.ok) return response.text();
    lastError = `HTTP ${response.status}`;
    if (response.status < 500) break;
  }
  throw new IndexError(`Cannot read the index at ${location}: ${lastError}`);
}

/** Read and parse an index, then run its validator. */
export async function loadIndex(source, validate, { fixture = false, ...options } = {}) {
  const text = await readIndexText(source.location, options);
  let json;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new IndexError(`The index at ${source.location} is not valid JSON: ${error.message}`, { cause: error });
  }
  try {
    return validate(json, { allowFixture: fixture, requireFixture: fixture });
  } catch (error) {
    if (error instanceof IndexError) throw new IndexError(`${error.message} (index: ${source.location})`, { cause: error });
    throw error;
  }
}

// ------------------------------------------------------------ validation helpers

function fail(path, message) {
  throw new IndexError(`Invalid index: ${path} ${message}`);
}

function text(value, path) {
  if (typeof value !== 'string' || value.trim() === '') fail(path, 'must be a non-empty string');
  return value;
}

function optionalText(value, path) {
  return value === undefined ? undefined : text(value, path);
}

function object(value, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(path, 'must be an object');
  return value;
}

function list(value, path) {
  if (!Array.isArray(value)) fail(path, 'must be an array');
  return value;
}

function pattern(value, path, regex, expectation) {
  text(value, path);
  if (!regex.test(value)) fail(path, `must be ${expectation}, got ${JSON.stringify(value)}`);
  return value;
}

function httpsUrl(value, path) {
  text(value, path);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(path, `must be an absolute URL, got ${JSON.stringify(value)}`);
  }
  if (parsed.protocol !== 'https:') fail(path, `must be an https URL, got ${JSON.stringify(value)}`);
  if (parsed.username || parsed.password) fail(path, 'must not carry credentials');
  return value;
}

/** A path inside a repository: no leading slash, backslash, control character or `.`/`..`/empty segment. */
function repoPath(value, path) {
  text(value, path);
  const bad = value.startsWith('/') || value.includes('\\') || /[\u0000-\u001f]/.test(value)
    || value.split('/').some(segment => segment === '' || segment === '.' || segment === '..');
  if (bad) fail(path, `must be a relative path inside the repository, got ${JSON.stringify(value)}`);
  return value;
}

function envelope(json, format, listName, { allowFixture, requireFixture }) {
  object(json, 'index');
  if (json._fixture !== undefined && !allowFixture) {
    fail('_fixture', 'marks this file as a fixture, which only a build run with --use-fixture accepts');
  }
  if (requireFixture && json._fixture === undefined) {
    fail('_fixture', 'is missing: fixture mode only accepts a file carrying the fixture marker');
  }
  if (json.format !== format) fail('format', `must be ${format}, got ${JSON.stringify(json.format)}`);
  pattern(json.checksum, 'checksum', CHECKSUM, 'sha256:<64 hex>');
  list(json[listName], listName);
  return { format: json.format, checksum: json.checksum, fixture: json._fixture !== undefined };
}

function uniqueId(value, path, seen) {
  pattern(value, path, ID, 'lowercase words joined by hyphens');
  if (seen.has(value)) fail(path, `duplicates ${value}`);
  seen.add(value);
  return value;
}

/** `https://github.com/org/repo`, `.git` and trailing slashes dropped. */
export function normaliseRepositoryUrl(url) {
  return url.replace(/\/+$/, '').replace(/\.git$/, '');
}

/** The comparison key of a repository URL: GitHub owner and repository names are case-insensitive. */
export function repositoryKey(url) {
  const parsed = new URL(normaliseRepositoryUrl(url));
  return `${parsed.hostname}${parsed.pathname}`.toLowerCase();
}

/** A model address without its `?ref=<commit>` pin. */
export function baseAddress(address) {
  return address.replace(/\?ref=[0-9a-f]{40}$/, '');
}

/**
 * The comparison form of a model address: no `?ref=` pin, and the GitHub owner
 * and repository lowercased (GitHub ignores their case, as repositoryKey does).
 * The module name stays case-sensitive.
 */
export function normaliseModelAddress(address) {
  const [host, owner, repository, ...module] = baseAddress(address).slice('modelspec://'.length).split('/');
  return `modelspec://${host.toLowerCase()}/${owner.toLowerCase()}/${repository.toLowerCase()}/${module.join('/')}`;
}

// ------------------------------------------------------------ ModelSpec registry

function property(value, path, entityName, seen) {
  object(value, path);
  const name = pattern(value.name, `${path}.name`, NAME, 'letters, digits and underscores');
  if (seen.has(name)) fail(`${path}.name`, `duplicates property ${entityName}.${name}`);
  seen.add(name);
  const references = value.references === undefined ? undefined : pattern(value.references, `${path}.references`, REFERENCE, 'an entity name');
  const component = value.component === undefined ? undefined : pattern(value.component, `${path}.component`, REFERENCE, 'a component name');
  for (const flag of ['required', 'key']) {
    if (value[flag] !== undefined && typeof value[flag] !== 'boolean') fail(`${path}.${flag}`, 'must be true or false');
  }
  return { name, type: text(value.type, `${path}.type`), references, component, required: value.required === true, key: value.key === true };
}

function entity(value, path, seen) {
  object(value, path);
  const name = pattern(value.name, `${path}.name`, NAME, 'letters, digits and underscores');
  if (seen.has(name)) fail(`${path}.name`, `duplicates entity ${name}`);
  seen.add(name);
  const names = new Set();
  const properties = list(value.properties, `${path}.properties`).map((p, i) => property(p, `${path}.properties[${i}]`, name, names));
  const key = value.key === undefined ? [] : list(value.key, `${path}.key`).map((k, i) => text(k, `${path}.key[${i}]`));
  // The components the entity embeds (`use`).
  const use = value.use === undefined ? [] : list(value.use, `${path}.use`).map((u, i) => pattern(u, `${path}.use[${i}]`, REFERENCE, 'a component name'));
  return { name, key, use, properties };
}

function component(value, path, seen) {
  object(value, path);
  const name = pattern(value.name, `${path}.name`, NAME, 'letters, digits and underscores');
  if (seen.has(name)) fail(`${path}.name`, `duplicates component ${name}`);
  seen.add(name);
  const names = new Set();
  const fields = list(value.fields, `${path}.fields`).map((f, i) => property(f, `${path}.fields[${i}]`, name, names));
  return { name, fields };
}

/** Validate an already parsed ModelSpec registry index and return the normalised form. */
export function validateModelspecIndex(json, options = {}) {
  const head = envelope(json, MODELSPEC_FORMAT, 'models', options);
  const ids = new Set();
  const addresses = new Set();
  const models = json.models.map((m, i) => {
    const at = `models[${i}]`;
    object(m, at);
    const id = uniqueId(m.id, `${at}.id`, ids);
    const address = pattern(m.address, `${at}.address`, MODEL_ADDRESS, 'an unpinned modelspec://github.com/<org>/<repo>/<module> (no ?ref=)');
    if (addresses.has(normaliseModelAddress(address))) fail(`${at}.address`, `duplicates ${address}`);
    addresses.add(normaliseModelAddress(address));
    object(m.files, `${at}.files`);
    const names = new Set();
    const componentNames = new Set();
    return {
      id,
      title: text(m.title, `${at}.title`),
      description: text(m.description, `${at}.description`),
      status: text(m.status, `${at}.status`),
      homepage: m.homepage === undefined ? undefined : httpsUrl(m.homepage, `${at}.homepage`),
      address,
      repository: normaliseRepositoryUrl(pattern(m.repository, `${at}.repository`, GITHUB_REPOSITORY, 'a https://github.com/<org>/<repo> URL')),
      commit: pattern(m.commit, `${at}.commit`, COMMIT, 'a full 40-character commit id'),
      licence: text(m.licence, `${at}.licence`),
      files: {
        source: repoPath(m.files.source, `${at}.files.source`),
        json: m.files.json === undefined ? undefined : repoPath(m.files.json, `${at}.files.json`),
      },
      maintainers: m.maintainers === undefined ? [] : list(m.maintainers, `${at}.maintainers`).map((h, j) => pattern(h, `${at}.maintainers[${j}]`, HANDLE, 'a GitHub handle')),
      moduleVersion: optionalText(m.module_version, `${at}.module_version`),
      modelspecVersion: optionalText(m.modelspec, `${at}.modelspec`),
      entities: list(m.entities, `${at}.entities`).map((e, j) => entity(e, `${at}.entities[${j}]`, names)),
      components: m.components === undefined ? [] : list(m.components, `${at}.components`).map((c, j) => component(c, `${at}.components[${j}]`, componentNames)),
    };
  });
  return { ...head, models };
}

// ------------------------------------------------------------ MeaningGraph registry

/** Validate an already parsed MeaningGraph registry index and return the normalised form. */
export function validateMeaningGraphIndex(json, options = {}) {
  const head = envelope(json, MEANINGGRAPH_FORMAT, 'graphs', options);
  const ids = new Set();
  const graphs = json.graphs.map((g, i) => {
    const at = `graphs[${i}]`;
    object(g, at);
    return {
      id: uniqueId(g.id, `${at}.id`, ids),
      title: text(g.title, `${at}.title`),
      description: optionalText(g.description, `${at}.description`),
      kind: optionalText(g.kind, `${at}.kind`),
      status: optionalText(g.status, `${at}.status`),
      repository: normaliseRepositoryUrl(httpsUrl(g.repository, `${at}.repository`)),
      modelFiles: g.model_files === undefined ? [] : list(g.model_files, `${at}.model_files`).map((f, j) => repoPath(f, `${at}.model_files[${j}]`)),
    };
  });
  return { ...head, graphs };
}

// ------------------------------------------------------------ OVDB Directory

function directoryPathForGlobalId(value, where) {
  let url;
  try { url = new URL(value); } catch { fail(where, 'must be a canonical public https database identity URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || url.href !== value) {
    fail(where, 'must be a canonical public https database identity URL without credentials, port, query or fragment');
  }
  const privateSuffixes = ['localhost', 'local', 'localdomain', 'internal', 'lan', 'home.arpa', 'arpa', 'intranet', 'corp', 'private', 'svc', 'home', 'test', 'invalid', 'onion'];
  if (!url.hostname.includes('.') || url.hostname.endsWith('.') || url.hostname.includes(':') || /^\d+(\.\d+)*$/.test(url.hostname) || privateSuffixes.some((suffix) => url.hostname === suffix || url.hostname.endsWith(`.${suffix}`)) || url.hostname.split('.').some((label) => !/^(?!-)[a-z0-9-]{1,63}(?<!-)$/.test(label))) {
    fail(where, 'must use a public host');
  }
  const segments = url.pathname.split('/').slice(1);
  if (segments.at(-1) === '') segments.pop();
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) fail(where, 'must not contain empty or traversal path segments');
  for (const segment of segments) {
    let decoded;
    try { decoded = decodeURIComponent(segment); } catch { fail(where, 'contains an invalid path escape'); }
    if (decoded === '.' || decoded === '..' || /[/\\\u0000-\u001f\u007f]/.test(decoded)) fail(where, 'contains an unsafe path segment');
    if (segment.includes('%') && encodeURIComponent(decoded).replace(/[!'()*]/g, (character) => `%${character.codePointAt(0).toString(16).toUpperCase()}`) !== segment) fail(where, 'contains a non-canonical encoded path segment');
  }
  const route = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
  return `/ovdb/${url.host}${route}`;
}

/** Validate an already parsed OVDB Directory index and return the normalised form. */
export function validateDirectoryIndex(json, options = {}) {
  const head = envelope(json, DIRECTORY_FORMAT, 'databases', options);
  const ids = new Set();
  const globalIds = new Set();
  const recordIds = new Set();
  const databases = json.databases.map((d, i) => {
    const at = `databases[${i}]`;
    object(d, at);
    let model;
    if (d.model !== undefined) {
      object(d.model, `${at}.model`);
      model = {
        name: optionalText(d.model.name, `${at}.model.name`),
        path: d.model.path === undefined ? undefined : repoPath(d.model.path, `${at}.model.path`),
        address: d.model.address === undefined ? undefined : pattern(d.model.address, `${at}.model.address`, PINNED_MODEL_ADDRESS, 'modelspec://github.com/<org>/<repo>/<module>, optionally with ?ref=<commit>'),
      };
      if (model.path === undefined && model.address === undefined) fail(`${at}.model`, 'must carry an address or a path');
    }
    let id;
    if (typeof d.id === 'string' && d.id.startsWith('https://')) {
      id = d.id;
      if (globalIds.has(id)) fail(`${at}.id`, `duplicate global database identity ${JSON.stringify(id)}`);
      globalIds.add(id);
    } else id = uniqueId(d.id, `${at}.id`, ids);
    let recordId;
    if (id.startsWith('https://')) {
      recordId = uniqueId(d.recordId, `${at}.recordId`, recordIds);
      if (d.localId === undefined) fail(`${at}.localId`, 'is required when id is a global database identity');
      if (d.url !== id) fail(`${at}.url`, 'must equal the canonical global database identity id');
    } else recordId = uniqueId(d.recordId ?? id, `${at}.recordId`, recordIds);
    const expectedDirectoryPath = id.startsWith('https://') ? directoryPathForGlobalId(id, `${at}.id`) : undefined;
    const directoryPath = d.directoryPath === undefined ? expectedDirectoryPath : text(d.directoryPath, `${at}.directoryPath`);
    if (expectedDirectoryPath !== undefined && directoryPath !== expectedDirectoryPath) fail(`${at}.directoryPath`, `must be ${expectedDirectoryPath} for id`);
    if (expectedDirectoryPath === undefined && d.directoryPath !== undefined) fail(`${at}.directoryPath`, 'is supported only with a global database identity id');
    const serverId = d.serverId === undefined ? undefined : httpsUrl(d.serverId, `${at}.serverId`);
    const serverOrigin = serverId === undefined ? undefined : new URL(serverId).origin;
    const serverDbBaseUrl = d.serverDbBaseUrl === undefined ? undefined : httpsUrl(d.serverDbBaseUrl, `${at}.serverDbBaseUrl`);
    const apiUrl = d.apiUrl === undefined ? undefined : httpsUrl(d.apiUrl, `${at}.apiUrl`);
    if (serverOrigin && serverDbBaseUrl && new URL(serverDbBaseUrl).origin !== serverOrigin) fail(`${at}.serverDbBaseUrl`, 'must share the serverId origin');
    if (serverOrigin && apiUrl && new URL(apiUrl).origin !== serverOrigin) fail(`${at}.apiUrl`, 'must share the serverId origin');
    return {
      id,
      ...(recordId === undefined ? {} : { recordId }),
      ...(d.localId === undefined ? {} : { localId: pattern(d.localId, `${at}.localId`, /^[a-z][a-z0-9-]{0,39}$/, 'lowercase letters, digits and single hyphens, beginning with a letter') }),
      ...(directoryPath === undefined ? {} : { directoryPath }),
      ...(serverId === undefined ? {} : { serverId }),
      ...(serverDbBaseUrl === undefined ? {} : { serverDbBaseUrl }),
      ...(apiUrl === undefined ? {} : { apiUrl }),
      title: text(d.title, `${at}.title`),
      status: text(d.status, `${at}.status`),
      url: httpsUrl(d.url, `${at}.url`),
      repository: normaliseRepositoryUrl(httpsUrl(d.repository, `${at}.repository`)),
      model,
    };
  });
  const routes = new Set();
  for (const database of databases) {
    if (!database.directoryPath) continue;
    if (routes.has(database.directoryPath.toLowerCase())) fail('databases', `duplicate Directory path ${JSON.stringify(database.directoryPath)}`);
    routes.add(database.directoryPath.toLowerCase());
  }
  return { ...head, databases, sources: validateSourceDiscoveries(json.sources, json.sourcesChecksum), sourcesChecksum: json.sourcesChecksum };
}

/** Validate the inactive discovery metadata used by model pages, without reading provider data. */
export function validateSourceDiscoveries(value, checksum) {
  if (value === undefined) {
    if (checksum !== undefined) fail('sourcesChecksum', 'requires sources');
    return [];
  }
  list(value, 'sources');
  pattern(checksum, 'sourcesChecksum', CHECKSUM, 'sha256:<64 hex>');
  const expected = `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
  if (checksum !== expected) fail('sourcesChecksum', 'does not match the source metadata');
  const ids = new Set();
  return value.map((source, i) => {
    const at = `sources[${i}]`;
    object(source, at);
    const id = uniqueId(source.id, `${at}.id`, ids);
    if (id.length > 80) fail(`${at}.id`, 'must be at most 80 characters');
    if (source.status !== 'inactive') fail(`${at}.status`, 'must be inactive');
    if (!['ovdb-source/draft-1', 'ovdb-source/draft-2'].includes(source.format)) fail(`${at}.format`, 'must be an OVDB source discovery format');
    let modelId;
    if (source.modelspec_url !== undefined) {
      text(source.modelspec_url, `${at}.modelspec_url`);
      const match = /^https:\/\/modelspec\.org\/registry\/models\/([a-z0-9]+(?:-[a-z0-9]+)*)\/$/.exec(source.modelspec_url);
      if (!match) fail(`${at}.modelspec_url`, 'must be an exact canonical ModelSpec model route');
      modelId = match[1];
    }
    return {
      id, modelId,
      title: text(source.title, `${at}.title`),
      description: text(source.description, `${at}.description`),
      publisher: text(source.publisher, `${at}.publisher`),
      status: source.status,
    };
  });
}
