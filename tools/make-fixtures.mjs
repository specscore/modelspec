#!/usr/bin/env node
// Writes marked offline fixtures: copies or a selected supported cohort plus a
// top-level `_fixture` marker naming where each was copied from, and two derived
// Directory indexes in which a second database names the same model.
//
//   node tools/make-fixtures.mjs [--supported-cohort] [--modelspec <https URL or path>] [--meaninggraph <...>] [--directory <...>]
//
// The defaults are the indexes on each registry's main branch. While a registry
// is not on main yet, pass the URL of its branch (or commit) instead. Every
// source is validated, and its `checksum` (sha256: plus the SHA-256 of the compact
// JSON of its list) is checked, before anything is written.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DEFAULTS, FIXTURE_SETS } from '../src/config.mjs';
import { readIndexText, validateDirectoryIndex, validateMeaningGraphIndex, validateModelspecIndex } from '../src/indexes.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const FIXTURE_NOTE = 'FIXTURE, not a live index. A copy of the index named in `copied_from`, kept for offline builds and tests. Only a build run with --use-fixture accepts this file; it must never be deployed.';
export const DERIVED_NOTE = 'FIXTURE, not a live index. The Directory index named in `derived_from` with a second database added that names the same ModelSpec model by its address, to test that every database of a model is listed. Only a build run with --use-fixture accepts this file; it must never be deployed.';
export const DERIVED_BY_ADDRESS_NOTE = 'FIXTURE, not a live index. The Directory index named in `derived_from` in which the first database also names its ModelSpec model by `model.address`, plus a second database that does, to test that databases are found by address. Only a build run with --use-fixture accepts this file; it must never be deployed.';

export const checksumOf = list => `sha256:${createHash('sha256').update(JSON.stringify(list)).digest('hex')}`;

const KINDS = {
  modelspec: { list: 'models', validate: validateModelspecIndex },
  meaninggraph: { list: 'graphs', validate: validateMeaningGraphIndex },
  directory: { list: 'databases', validate: validateDirectoryIndex },
};

/** The index plus the `_fixture` marker; the list and `checksum` stay as read. */
export function markAsFixture(kind, json, copiedFrom) {
  const { list, validate } = KINDS[kind];
  if (json._fixture !== undefined) throw new Error('The source is already a fixture');
  validate(json);
  if (json.checksum !== checksumOf(json[list])) {
    throw new Error(`The source checksum ${json.checksum} does not match its ${list} (${checksumOf(json[list])})`);
  }
  return { format: json.format, checksum: json.checksum, _fixture: { note: FIXTURE_NOTE, copied_from: copiedFrom }, [list]: json[list], ...sourceEnvelope(json) };
}

const sourceEnvelope = json => json.sources === undefined ? {} : { sources: json.sources, sourcesChecksum: json.sourcesChecksum };
export const COHORT_INPUTS = {
  modelspec: 'https://raw.githubusercontent.com/modelspec-org/registry/36343c6293cfe96ade53bbdd3baf980562f00604/index.json',
  meaninggraph: 'https://raw.githubusercontent.com/meaninggraph/registry/a5eea9aa50a82bf8e95244ad32f1976a1ac9cb43/index.json',
  directory: 'https://raw.githubusercontent.com/openvaultdb/directory/c2ba820259765f56df45acd42ed5a784ee7eb18c/index.json',
};
const COHORT_IDS = ['ecb-daily', 'geonames', 'ror'];
const COHORT_NOTE = 'FIXTURE, not a live index. A derived cohort preserving the baseline records named in derived_from, with exact selected descriptive records from the pinned upstream index. Only --use-fixture accepts this file; it must never be deployed.';

/** Keep the Chinook baseline, adding exact registered support for the pinned discoveries. */
export function supportedCohort(baselines, upstream, from = COHORT_INPUTS) {
  for (const kind of Object.keys(KINDS)) markAsFixture(kind, upstream[kind], from[kind]);
  const fixtures = {};
  for (const kind of ['modelspec', 'meaninggraph']) {
    const { list, validate } = KINDS[kind];
    const baselineIds = kind === 'modelspec' ? ['chinook'] : ['chinook', 'core'];
    const baseline = baselineIds.map(id => {
      const entry = baselines[kind][list].find(record => record.id === id);
      if (!entry) throw new Error(`Missing baseline ${kind} ${id}`);
      return entry;
    });
    const selected = COHORT_IDS.map(id => {
      const entry = upstream[kind][list].find(record => record.id === id);
      if (!entry) throw new Error(`Missing pinned ${kind} ${id}`);
      return entry;
    });
    const records = [...baseline, ...selected];
    fixtures[kind] = { format: baselines[kind].format, checksum: checksumOf(records),
      _fixture: { note: COHORT_NOTE, derived_from: baselines[kind]._fixture.copied_from ?? baselines[kind]._fixture.derived_from,
        ...((baselines[kind]._fixture.local_change ?? baselines[kind]._fixture.baseline_local_change) === undefined ? {} : { baseline_local_change: baselines[kind]._fixture.local_change ?? baselines[kind]._fixture.baseline_local_change }),
        upstream: from[kind], selected_ids: COHORT_IDS, baseline_ids: baselineIds }, [list]: records };
    validate(fixtures[kind], { allowFixture: true, requireFixture: true });
  }
  const databases = baselines.directory.databases;
  fixtures.directory = { format: baselines.directory.format, checksum: checksumOf(databases),
    _fixture: { note: COHORT_NOTE, derived_from: baselines.directory._fixture.copied_from ?? baselines.directory._fixture.derived_from,
      source_upstream: from.directory, selected_source_ids: upstream.directory.sources.map(source => source.id) },
    databases, ...sourceEnvelope(upstream.directory) };
  validateDirectoryIndex(fixtures.directory, { allowFixture: true, requireFixture: true });
  return fixtures;
}

function modelAddress(first) {
  const repository = new URL(first.repository).pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '');
  return `modelspec://github.com/${repository}/${first.model.name}`;
}

/** A second database of the first database's model: another publisher, found by `model.address` only. */
function secondDatabase(first) {
  return {
    id: 'https://acme.example.net/chinook/',
    recordId: 'chinook-second-host', localId: 'chinook', directoryPath: '/ovdb/acme.example.net/chinook/',
    title: `${first.title} (second host)`,
    description: `A second database of the ${first.model.name} model, from another publisher, for testing.`,
    status: 'draft',
    url: 'https://acme.example.net/chinook/',
    serverId: 'https://acme.example.net/ovdb',
    serverDbBaseUrl: 'https://acme.example.net/database/chinook/',
    apiUrl: 'https://acme.example.net/api/chinook',
    repository: 'https://git.example.com/second-host/chinook-hosting',
    commit: first.commit,
    manifest: 'ovdb.yaml',
    licence: first.licence,
    model: { name: first.model.name, path: 'models/chinook.modelspec.hcl', address: modelAddress(first) },
    recordsets: [],
  };
}

function firstWithModel(directoryFixture) {
  const first = directoryFixture.databases.find(db => db.model);
  if (!first) throw new Error('The Directory index has no database with a model to derive a second one from');
  return first;
}

/** The Directory fixture plus a second database of the same model, found by `model.address` only. */
export function deriveTwoDatabases(directoryFixture, derivedFrom) {
  const databases = [...directoryFixture.databases, secondDatabase(firstWithModel(directoryFixture))];
  const result = { format: directoryFixture.format, checksum: checksumOf(databases), _fixture: { note: DERIVED_NOTE, derived_from: derivedFrom }, databases, ...sourceEnvelope(directoryFixture) };
  validateDirectoryIndex(result, { allowFixture: true, requireFixture: true });
  return result;
}

/** Both databases name the model by `model.address`: the first gets the address the real entry will carry once its manifest does. */
export function deriveTwoByAddress(directoryFixture, derivedFrom) {
  const first = firstWithModel(directoryFixture);
  const address = modelAddress(first);
  const databases = directoryFixture.databases.map(db => (db === first ? { ...db, model: { ...db.model, address } } : db));
  databases.push(secondDatabase(first));
  const result = { format: directoryFixture.format, checksum: checksumOf(databases), _fixture: { note: DERIVED_BY_ADDRESS_NOTE, derived_from: derivedFrom }, databases, ...sourceEnvelope(directoryFixture) };
  validateDirectoryIndex(result, { allowFixture: true, requireFixture: true });
  return result;
}

async function write(file, json) {
  const out = resolve(root, file);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(json, null, 2)}\n`);
  console.log(`Wrote ${file}`);
}

async function main() {
  const args = process.argv.slice(2);
  const cohort = args[0] === '--supported-cohort';
  if (cohort) args.shift();
  const from = cohort ? { ...COHORT_INPUTS } : { modelspec: DEFAULTS.modelspecRegistryIndex, meaninggraph: DEFAULTS.meaningGraphRegistryIndex, directory: DEFAULTS.ovdbDirectoryIndex };
  for (let i = 0; i < args.length; i += 2) {
    const kind = args[i]?.replace(/^--/, '');
    if (!(kind in from) || !args[i + 1]) throw new Error(`Usage: make-fixtures.mjs [--supported-cohort] [--modelspec <src>] [--meaninggraph <src>] [--directory <src>]; got ${args[i]}`);
    from[kind] = args[i + 1];
  }
  const upstream = Object.fromEntries(await Promise.all(Object.keys(KINDS).map(async kind => [kind, JSON.parse(await readIndexText(from[kind]))])));
  let fixtures;
  if (cohort) {
    const baselines = Object.fromEntries(await Promise.all(Object.keys(KINDS).map(async kind => [kind, JSON.parse(await readFile(resolve(root, FIXTURE_SETS.default[kind]), 'utf8'))])));
    fixtures = supportedCohort(baselines, upstream, from);
  } else fixtures = Object.fromEntries(Object.keys(KINDS).map(kind => [kind, markAsFixture(kind, upstream[kind], from[kind])]));
  // Validate both derived variants before writing any fixture.
  const two = deriveTwoDatabases(fixtures.directory, FIXTURE_SETS.default.directory);
  const byAddress = deriveTwoByAddress(fixtures.directory, FIXTURE_SETS.default.directory);
  for (const kind of Object.keys(KINDS)) await write(FIXTURE_SETS.default[kind], fixtures[kind]);
  await write(FIXTURE_SETS['two-databases'].directory, two);
  await write(FIXTURE_SETS['two-by-address'].directory, byAddress);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
