import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {REPO} from './helpers.mjs';
import {SMOKE_PATHS} from '../scripts/smoke-live.mjs';
import {INDEXES} from '../src/index-commits.mjs';
import {FreshnessError, MARKER_PATH, checkFreshness, compareBuild, expectOk, fetchJson, markerFacts, printable, shortChecksum, shortCommit, verifyLive} from '../src/freshness.mjs';

const COMMIT = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const sum = digit => `sha256:${digit.repeat(64)}`;
// the indexes this site reads (the first two are used by name below), the field the marker keeps their checksums in
const KEYS = Object.keys(INDEXES);
const [K1, K2] = KEYS;
const CHECKS = 'checksums';
const SUMS = Object.fromEntries(KEYS.map((key, i) => [key, sum(String(i + 1))]));
const HEADS = Object.fromEntries(KEYS.map((key, i) => [key, String(i + 1).repeat(40)]));
const FORMAT = 'modelspec-build/1';
const marker = (over = {}) => ({format: FORMAT, commit: COMMIT, indexCommits: {...HEADS}, [CHECKS]: {...SUMS}, ...over});
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
const check = (routes, extra = {}) => checkFreshness({fetch: fakeFetch(routes), markerUrl: MARKER_URL, indexCommits: HEADS, commit: COMMIT, sleep: noSleep, ...extra});

test('compareBuild: same site commit and data repository commits is current', () => {
  assert.deepEqual(compareBuild({live: marker(), commit: COMMIT, indexCommits: HEADS}), {changed: false, reasons: []});
});

test('compareBuild: a different site commit is a change and names both commits', () => {
  const {changed, reasons} = compareBuild({live: marker({commit: OTHER}), commit: COMMIT, indexCommits: HEADS});
  assert.equal(changed, true);
  assert.equal(reasons.length, 1);
  assert.match(reasons[0], /site commit bbbbbbbbbbbb is live, aaaaaaaaaaaa is current/);
});

test('compareBuild: each data repository commit is compared on its own and named', () => {
  for (const name of Object.keys(HEADS)) {
    const {changed, reasons} = compareBuild({live: marker(), commit: COMMIT, indexCommits: {...HEADS, [name]: 'a'.repeat(40)}});
    assert.equal(changed, true, name);
    assert.deepEqual(reasons.length, 1);
    assert.match(reasons[0], new RegExp(`the ${name} index changed \\(commit [123]{12} is live, aaaaaaaaaaaa is current\\)`));
  }
});

test('compareBuild: several differences are all reported', () => {
  const {reasons} = compareBuild({live: marker({commit: OTHER}), commit: COMMIT, indexCommits: {...HEADS, [K1]: 'b'.repeat(40), [K2]: 'c'.repeat(40)}});
  assert.equal(reasons.length, 3);
});

test('compareBuild: a checksum is compared only when asked for (after a deploy), and named', () => {
  assert.equal(compareBuild({live: marker({indexChecksums: {}}), commit: COMMIT, indexCommits: HEADS}).changed, false);
  const {reasons} = compareBuild({live: marker(), commit: COMMIT, indexCommits: HEADS, checksums: {...SUMS, [K2]: sum('a')}});
  assert.equal(reasons.length, 1);
  assert.match(reasons[0], new RegExp(`the ${K2} index differs \\(sha256:222222222222 is live, sha256:aaaaaaaaaaaa is built\\)`));
});

test('compareBuild: a missing or unreadable live marker, or one without the new fields, is a change', () => {
  assert.equal(compareBuild({live: null, commit: COMMIT, indexCommits: HEADS}).changed, true);
  assert.equal(compareBuild({live: 'text', commit: COMMIT, indexCommits: HEADS}).changed, true);
  // a marker from before the commits were recorded
  const old = compareBuild({live: {format: FORMAT, production: true}, commit: COMMIT, indexCommits: HEADS});
  assert.equal(old.changed, true);
  assert.match(old.reasons.join(), /records no site commit/);
  assert.match(old.reasons.join(), new RegExp(`records no commit for the ${K2} index`));
  assert.equal(compareBuild({live: marker({indexCommits: {...HEADS, [K2]: null}}), commit: COMMIT, indexCommits: HEADS}).changed, true);
  assert.equal(compareBuild({live: marker({indexCommits: 'x'}), commit: COMMIT, indexCommits: HEADS}).changed, true);
});

test('markerFacts reads a marker defensively', () => {
  assert.deepEqual(markerFacts(null), {commit: '', indexCommits: {}, checksums: {}});
  assert.deepEqual(markerFacts({commit: 5, indexCommits: 'x'}), {commit: '', indexCommits: {}, checksums: {}});
  assert.deepEqual(markerFacts(marker()), {commit: COMMIT, indexCommits: HEADS, checksums: SUMS});
});

test('checkFreshness: nothing changed, and only the live marker is fetched', async () => {
  const fetchImpl = fakeFetch({[MARKER_URL]: marker()});
  const result = await checkFreshness({fetch: fetchImpl, markerUrl: MARKER_URL, indexCommits: HEADS, commit: COMMIT, sleep: noSleep});
  assert.deepEqual(result, {changed: false, reasons: []});
  assert.deepEqual([...fetchImpl.calls.keys()], [MARKER_URL], 'the indexes are not read: the commits say whether they moved');
});

test('checkFreshness: a new data repository commit is a change', async () => {
  const result = await check({[MARKER_URL]: marker()}, {indexCommits: {...HEADS, [K1]: 'd'.repeat(40)}});
  assert.equal(result.changed, true);
  assert.match(result.reasons[0], new RegExp(`${K1} index changed`));
});

test('checkFreshness: a new site commit is a change', async () => {
  const result = await check({[MARKER_URL]: marker({commit: OTHER})});
  assert.equal(result.changed, true);
});

test('checkFreshness: a live site that does not answer, or answers rubbish, is a change with the reason kept', async () => {
  for (const live of [404, 'not json', new Error('socket hang up')]) {
    const result = await check({[MARKER_URL]: live});
    assert.equal(result.changed, true, String(live));
    assert.ok(result.reasons.length >= 2, result.reasons.join());
  }
});

test('checkFreshness insists on full commit ids, for the site and for every data repository', async () => {
  await assert.rejects(check({[MARKER_URL]: marker()}, {commit: undefined}), /40-digit/);
  await assert.rejects(check({[MARKER_URL]: marker()}, {commit: 'abc'}), /40-digit/);
  for (const bad of ['abc', 'main', 'A'.repeat(40), `${'a'.repeat(40)}\n`, null, undefined]) {
    await assert.rejects(check({[MARKER_URL]: marker()}, {indexCommits: {...HEADS, [K2]: bad}}), new RegExp(`the ${K2} index commit must be a full 40-digit commit id`), String(bad));
  }
});

test('checkFreshness compares the site commit case-insensitively', async () => {
  const result = await check({[MARKER_URL]: marker()}, {commit: COMMIT.toUpperCase()});
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
  const result = await verifyLive({fetch: stale, markerUrl: MARKER_URL, built: marker(), delaysMs: [1, 1, 1], sleep: noSleep});
  assert.equal(result.ok, false);
  assert.match(result.reasons[0], /site commit bbbbbbbbbbbb is live/);
  assert.equal(stale.calls.get(MARKER_URL), 4, 'one read, then one per wait');
  const gone = await verifyLive({fetch: fakeFetch({[MARKER_URL]: 500}), markerUrl: MARKER_URL, built: marker(), delaysMs: [1], sleep: noSleep});
  assert.equal(gone.ok, false);
  assert.match(gone.reasons[0], /HTTP 500/);
});

test('verifyLive refuses a build marker without a commit and a build whose checksums differ', async () => {
  const noCommit = await verifyLive({fetch: fakeFetch({}), markerUrl: MARKER_URL, built: {format: 'x'}, sleep: noSleep});
  assert.equal(noCommit.ok, false);
  assert.match(noCommit.reasons[0], /no valid site commit/);
  const wrongSums = await verifyLive({fetch: fakeFetch({[MARKER_URL]: marker({[CHECKS]: {...SUMS, [K2]: sum('e')}})}), markerUrl: MARKER_URL, built: marker(), delaysMs: [], sleep: noSleep});
  assert.equal(wrongSums.ok, false);
  assert.match(wrongSums.reasons[0], new RegExp(`${K2} index differs`));
});

// ---- the values that come from public URLs are shape-checked before they are printed ----

test('printable drops control characters and :: so that fetched text cannot start a log command', () => {
  assert.equal(printable('z\n::error::x\r\u0007'), 'z  error x ');
  for (const text of ['::::warning::', ':::', ': ::: :', '\n::\n::']) assert.ok(!/::/.test(printable(text)), text);
  assert.equal(printable('x'.repeat(400)).length, 300);
  assert.equal(printable(undefined), '');
});

test('commits and checksums print only when they have the right shape', () => {
  assert.equal(shortCommit(COMMIT), 'aaaaaaaaaaaa');
  assert.equal(shortCommit('z\n::error::x'), 'invalid');
  assert.equal(shortCommit('A'.repeat(40)), 'invalid');
  assert.equal(shortChecksum(sum('4')), 'sha256:444444444444');
  assert.equal(shortChecksum('sha256:short'), 'invalid');
  assert.equal(shortChecksum(null), 'invalid');
  const hostile = compareBuild({live: {commit: 'z\n::error::x', indexCommits: {...HEADS, [K2]: '\n::warning::y'}, [CHECKS]: {...SUMS, [K1]: '::error::z'}}, commit: COMMIT, indexCommits: HEADS, checksums: SUMS});
  assert.match(hostile.reasons.join(), /site commit invalid is live/);
  assert.match(hostile.reasons.join(), new RegExp(`${K2} index changed \\(commit invalid is live`));
  assert.match(hostile.reasons.join(), new RegExp(`${K1} index differs \\(invalid is live`));
  assert.ok(!hostile.reasons.join('').includes('::'));
});

test('a failed read puts no part of the response in the message but the parser message, cleaned', async () => {
  const fetchImpl = fakeFetch({'https://x.test/j': '{"a": "::error::boom"\n'});
  await assert.rejects(fetchJson(fetchImpl, 'https://x.test/j', {sleep: noSleep}), error => !/\n|::/.test(error.message));
});

// ---- the pages after a deploy ----

test('expectOk retries with growing waits and then fails red', async () => {
  const waits = [];
  const sleep = async ms => { waits.push(ms); };
  const flaky = fakeFetch({'https://site.test/': n => (n < 3 ? 503 : {ok: 1})});
  assert.deepEqual(await expectOk({fetch: flaky, url: 'https://site.test/', sleep}), {ok: true, reason: ''});
  assert.deepEqual(waits, [5000, 10000]);
  waits.length = 0;
  const down = await expectOk({fetch: fakeFetch({'https://site.test/': new Error('boom\n::error::x')}), url: 'https://site.test/', sleep});
  assert.equal(down.ok, false);
  assert.ok(!/\n|::/.test(down.reason));
  assert.deepEqual(waits, [5000, 10000, 15000, 20000, 30000, 30000, 30000], 'about two and a half minutes in all');
});

test('the smoke check fetches the landing page, the registry pages and the published schema, each with the expectOk retries', async () => {
  assert.deepEqual(SMOKE_PATHS, ['/', '/registry/', '/registry/sources/', '/schema/modelspec-ast.schema.json']);
  const script = readFileSync(new URL('../scripts/smoke-live.mjs', import.meta.url), 'utf8');
  assert.match(script, /for \(const path of SMOKE_PATHS\) \{\s*const page = await expectOk\(\{ url: `\$\{SITE_URL\}\$\{path\}` \}\);/, 'every path goes through expectOk');
  const url = `https://site.test${SMOKE_PATHS[3]}`;
  const waits = [];
  const sleep = async ms => { waits.push(ms); };
  assert.deepEqual(await expectOk({fetch: fakeFetch({[url]: n => (n < 3 ? 503 : {$id: 'x'})}), url, sleep}), {ok: true, reason: ''});
  assert.deepEqual(waits, [5000, 10000]);
  waits.length = 0;
  const missing = await expectOk({fetch: fakeFetch({}), url, sleep});
  assert.equal(missing.ok, false, 'a schema that is not served fails the smoke check');
  assert.match(missing.reason, /schema\/modelspec-ast\.schema\.json answered HTTP 404/);
  assert.equal(waits.length, 7);
});

test('verifyLive waits with growing waits too', async () => {
  const waits = [];
  const stale = fakeFetch({[MARKER_URL]: marker({commit: OTHER})});
  const result = await verifyLive({fetch: stale, markerUrl: MARKER_URL, built: marker(), sleep: async ms => { waits.push(ms); }});
  assert.equal(result.ok, false);
  assert.equal(waits.reduce((a, b) => a + b, 0), 140_000);
});

// ---- the CLI: input checking happens before any network ----

const cli = env => spawnSync(process.execPath, ['scripts/check-fresh.mjs'], {cwd: REPO, encoding: 'utf8', env: {PATH: process.env.PATH, BUILD_COMMIT: COMMIT, ...env}});
const COMMIT_ENVS = Object.fromEntries(KEYS.map(key => [key, INDEXES[key].commitEnv]));
const PINS = Object.fromEntries(KEYS.map(key => [COMMIT_ENVS[key], HEADS[key]]));

test('check-fresh refuses missing, partial and malformed data repository commits before it reads anything', () => {
  const missing = cli({});
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /commits are not set \(.*\): run scripts\/resolve-index-commits\.mjs first/);
  const partial = cli({[COMMIT_ENVS[K1]]: HEADS[K1]});
  assert.equal(partial.status, 1);
  assert.match(partial.stderr, /is set without the commits of the other indexes/);
  for (const bad of ['abc', 'main', 'A'.repeat(40), `${'a'.repeat(40)}0`]) {
    const run = cli({...PINS, [COMMIT_ENVS[K2]]: bad});
    assert.equal(run.status, 1, bad);
    assert.match(run.stderr, new RegExp(`${COMMIT_ENVS[K2]} must be 40 lower-case hex digits`));
  }
});

test('check-fresh refuses a commit together with the URL of the same index, and an index URL that is not a production one', () => {
  const both = cli({...PINS, OVDB_DIRECTORY_INDEX_URL: 'https://raw.githubusercontent.com/openvaultdb/directory/main/index.json'});
  assert.equal(both.status, 1);
  assert.match(both.stderr, /OVDB_DIRECTORY_INDEX_URL and OVDB_DIRECTORY_INDEX_COMMIT are both set/);
  const other = cli({OVDB_DIRECTORY_INDEX_URL: 'https://example.test/index.json'});
  assert.equal(other.status, 1);
  assert.match(other.stderr, /Refusing to deploy while OVDB_DIRECTORY_INDEX_URL is set to https:\/\/example\.test\/index\.json/);
});

test('FORCE skips only the comparison: a forced run reads no live site and needs no commits, yet still refuses a non-production setup', () => {
  const forced = cli({FORCE: 'true'});
  assert.equal(forced.status, 0, forced.stderr);
  assert.match(forced.stdout, /Forced: the comparison is skipped/);
  const refused = cli({FORCE: 'true', MEANINGGRAPH_BASE_URL: 'https://example.test'});
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /Refusing to deploy while MEANINGGRAPH_BASE_URL is set/);
});
