import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {REPO} from './helpers.mjs';
import {FreshnessError, MARKER_PATH, checkFreshness, compareBuild, fetchJson, indexChecksum, markerFacts, verifyLive} from '../src/freshness.mjs';

const COMMIT = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const SUMS = {modelspec: 'sha256:s1', meaninggraph: 'sha256:m1', ovdbDirectory: 'sha256:o1'};
const marker = (over = {}) => ({format: 'modelspec-build/1', commit: COMMIT, checksums: {...SUMS}, ...over});
const URLS = {modelspec: 'https://idx.test/modelspec.json', meaninggraph: 'https://idx.test/meaning.json', ovdbDirectory: 'https://idx.test/ovdb.json'};
const MARKER_URL = `https://site.test${MARKER_PATH}`;
const noSleep = async () => {};

// A fake fetch over {url: body | (call) => Response-like}. Counts calls per URL.
function fakeFetch(routes) {
  const calls = new Map();
  const impl = async url => {
    calls.set(url, (calls.get(url) ?? 0) + 1);
    const route = routes[url];
    if (route === undefined) return {ok: false, status: 404, text: async () => 'not found'};
    const answer = typeof route === 'function' ? route(calls.get(url)) : route;
    if (answer instanceof Error) throw answer;
    if (typeof answer === 'number') return {ok: answer < 400, status: answer, text: async () => ''};
    return {ok: true, status: 200, text: async () => (typeof answer === 'string' ? answer : JSON.stringify(answer))};
  };
  impl.calls = calls;
  return impl;
}
const indexes = (sums = SUMS) => ({
  [URLS.modelspec]: {checksum: sums.modelspec},
  [URLS.meaninggraph]: {checksum: sums.meaninggraph},
  [URLS.ovdbDirectory]: {checksum: sums.ovdbDirectory}
});
const check = (routes, extra = {}) => checkFreshness({fetch: fakeFetch(routes), markerUrl: MARKER_URL, indexUrls: URLS, commit: COMMIT, sleep: noSleep, ...extra});

test('compareBuild: same commit and checksums is current', () => {
  assert.deepEqual(compareBuild({live: marker(), commit: COMMIT, checksums: SUMS}), {changed: false, reasons: []});
});

test('compareBuild: a different site commit is a change and names both commits', () => {
  const {changed, reasons} = compareBuild({live: marker({commit: OTHER}), commit: COMMIT, checksums: SUMS});
  assert.equal(changed, true);
  assert.equal(reasons.length, 1);
  assert.match(reasons[0], /site commit bbbbbbbbbbbb is live, aaaaaaaaaaaa is current/);
});

test('compareBuild: each index checksum is compared on its own and named', () => {
  for (const name of Object.keys(SUMS)) {
    const {changed, reasons} = compareBuild({live: marker(), commit: COMMIT, checksums: {...SUMS, [name]: 'sha256:new'}});
    assert.equal(changed, true, name);
    assert.deepEqual(reasons.length, 1);
    assert.match(reasons[0], new RegExp(`the ${name} index changed \\(sha256:[smo]1 is live, sha256:new is current\\)`));
  }
});

test('compareBuild: several differences are all reported', () => {
  const {reasons} = compareBuild({live: marker({commit: OTHER}), commit: COMMIT, checksums: {...SUMS, ovdbDirectory: 'sha256:x', meaninggraph: 'sha256:y'}});
  assert.equal(reasons.length, 3);
});

test('compareBuild: a missing or unreadable live marker, or one without the new fields, is a change', () => {
  assert.equal(compareBuild({live: null, commit: COMMIT, checksums: SUMS}).changed, true);
  assert.equal(compareBuild({live: 'text', commit: COMMIT, checksums: SUMS}).changed, true);
  // a marker from before the commit and checksums were recorded
  const old = compareBuild({live: {format: 'meaninggraph-build/1', production: true}, commit: COMMIT, checksums: SUMS});
  assert.equal(old.changed, true);
  assert.match(old.reasons.join(), /records no site commit/);
  assert.match(old.reasons.join(), /records no checksum for the ovdbDirectory index/);
  assert.equal(compareBuild({live: marker({checksums: {...SUMS, ovdbDirectory: null}}), commit: COMMIT, checksums: SUMS}).changed, true);
  assert.equal(compareBuild({live: marker({checksums: 'x'}), commit: COMMIT, checksums: SUMS}).changed, true);
});

test('markerFacts reads a marker defensively', () => {
  assert.deepEqual(markerFacts(null), {commit: '', checksums: {}});
  assert.deepEqual(markerFacts({commit: 5}), {commit: '', checksums: {}});
  assert.deepEqual(markerFacts(marker()), {commit: COMMIT, checksums: SUMS});
});

test('indexChecksum refuses an index without a checksum instead of guessing', () => {
  assert.equal(indexChecksum('x', {checksum: 'sha256:1'}), 'sha256:1');
  for (const bad of [{}, {checksum: ''}, {checksum: 7}, null, 'text']) {
    assert.throws(() => indexChecksum('x', bad), error => error instanceof FreshnessError && /carries no checksum/.test(error.message));
  }
});

test('checkFreshness: nothing changed', async () => {
  const result = await check({...indexes(), [MARKER_URL]: marker()});
  assert.equal(result.changed, false);
  assert.deepEqual(result.reasons, []);
  assert.deepEqual(result.checksums, SUMS);
});

test('checkFreshness: a new index checksum is a change', async () => {
  const result = await check({...indexes({...SUMS, meaninggraph: 'sha256:m2'}), [MARKER_URL]: marker()});
  assert.equal(result.changed, true);
  assert.match(result.reasons[0], /meaninggraph index changed/);
});

test('checkFreshness: a new site commit is a change', async () => {
  const result = await check({...indexes(), [MARKER_URL]: marker({commit: OTHER})});
  assert.equal(result.changed, true);
});

test('checkFreshness: a live site that does not answer, or answers rubbish, is a change with the reason kept', async () => {
  for (const live of [404, 'not json', new Error('socket hang up')]) {
    const result = await check({...indexes(), [MARKER_URL]: live});
    assert.equal(result.changed, true, String(live));
    assert.ok(result.reasons.length >= 2, result.reasons.join());
  }
});

test('checkFreshness: an index that cannot be read is an error, never "unchanged"', async () => {
  await assert.rejects(check({[MARKER_URL]: marker(), [URLS.modelspec]: {checksum: 'x'}, [URLS.ovdbDirectory]: {checksum: 'y'}}), /cannot read https:\/\/idx\.test\/meaning\.json: HTTP 404/);
  await assert.rejects(check({...indexes(), [URLS.ovdbDirectory]: '{broken', [MARKER_URL]: marker()}), /is not valid JSON/);
  await assert.rejects(check({...indexes(), [URLS.ovdbDirectory]: {databases: []}, [MARKER_URL]: marker()}), /ovdbDirectory index carries no checksum/);
});

test('checkFreshness insists on a full commit id', async () => {
  await assert.rejects(check({...indexes(), [MARKER_URL]: marker()}, {commit: undefined}), /40-digit/);
  await assert.rejects(check({...indexes(), [MARKER_URL]: marker()}, {commit: 'abc'}), /40-digit/);
});

test('checkFreshness compares commits case-insensitively', async () => {
  const result = await check({...indexes(), [MARKER_URL]: marker()}, {commit: COMMIT.toUpperCase()});
  assert.equal(result.changed, false);
});

test('fetchJson retries a 5xx and a network error, but not a 404', async () => {
  const flaky = fakeFetch({'https://x.test/a': n => (n === 1 ? 503 : n === 2 ? new Error('reset') : {ok: 1})});
  assert.deepEqual(await fetchJson(flaky, 'https://x.test/a', {sleep: noSleep}), {ok: 1});
  assert.equal(flaky.calls.get('https://x.test/a'), 3);
  const missing = fakeFetch({});
  await assert.rejects(fetchJson(missing, 'https://x.test/b', {sleep: noSleep}), /HTTP 404/);
  assert.equal(missing.calls.get('https://x.test/b'), 1);
  const down = fakeFetch({'https://x.test/c': 502});
  await assert.rejects(fetchJson(down, 'https://x.test/c', {sleep: noSleep}), /cannot fetch https:\/\/x\.test\/c: HTTP 502/);
  assert.equal(down.calls.get('https://x.test/c'), 3);
});

test('verifyLive: the live site serves the build, at once or after a few attempts', async () => {
  const built = marker();
  assert.deepEqual(await verifyLive({fetch: fakeFetch({[MARKER_URL]: marker()}), markerUrl: MARKER_URL, built, sleep: noSleep}), {ok: true, reasons: []});
  const slow = fakeFetch({[MARKER_URL]: n => (n < 3 ? marker({commit: OTHER}) : marker())});
  assert.equal((await verifyLive({fetch: slow, markerUrl: MARKER_URL, built, sleep: noSleep})).ok, true);
  assert.equal(slow.calls.get(MARKER_URL), 3);
});

test('verifyLive: gives up with the reasons when the live site keeps serving something else', async () => {
  const stale = fakeFetch({[MARKER_URL]: marker({commit: OTHER})});
  const result = await verifyLive({fetch: stale, markerUrl: MARKER_URL, built: marker(), attempts: 4, sleep: noSleep});
  assert.equal(result.ok, false);
  assert.match(result.reasons[0], /site commit bbbbbbbbbbbb is live/);
  assert.equal(stale.calls.get(MARKER_URL), 4);
  const gone = await verifyLive({fetch: fakeFetch({[MARKER_URL]: 500}), markerUrl: MARKER_URL, built: marker(), attempts: 2, sleep: noSleep});
  assert.equal(gone.ok, false);
  assert.match(gone.reasons[0], /HTTP 500/);
});

test('verifyLive refuses a build marker without a commit and a build whose checksums differ', async () => {
  const noCommit = await verifyLive({fetch: fakeFetch({}), markerUrl: MARKER_URL, built: {format: 'x'}, sleep: noSleep});
  assert.equal(noCommit.ok, false);
  assert.match(noCommit.reasons[0], /no site commit/);
  const wrongSums = await verifyLive({fetch: fakeFetch({[MARKER_URL]: marker({checksums: {...SUMS, ovdbDirectory: 'sha256:old'}})}), markerUrl: MARKER_URL, built: marker(), attempts: 1, sleep: noSleep});
  assert.equal(wrongSums.ok, false);
  assert.match(wrongSums.reasons[0], /ovdbDirectory index changed/);
});

test('check-fresh refuses a non-production environment without touching the network', () => {
  const run = spawnSync(process.execPath, ['scripts/check-fresh.mjs'], {
    cwd: REPO, encoding: 'utf8',
    env: {PATH: process.env.PATH, BUILD_COMMIT: COMMIT, OVDB_DIRECTORY_INDEX_URL: 'https://example.test/index.json'},
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Refusing to deploy while OVDB_DIRECTORY_INDEX_URL is set/);
});
