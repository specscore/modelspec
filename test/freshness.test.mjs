import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {REPO} from './helpers.mjs';
import {FreshnessError, MARKER_PATH, assertAwaited, awaitChecksum, checkFreshness, compareBuild, expectOk, fetchJson, indexChecksum, markerFacts, parseAwaited, printable, shortChecksum, shortCommit, verifyLive} from '../src/freshness.mjs';

const COMMIT = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const sum = digit => `sha256:${digit.repeat(64)}`;
const SUMS = {modelspec: sum('1'), meaninggraph: sum('2'), ovdbDirectory: sum('3')};
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
    const {changed, reasons} = compareBuild({live: marker(), commit: COMMIT, checksums: {...SUMS, [name]: sum('a')}});
    assert.equal(changed, true, name);
    assert.deepEqual(reasons.length, 1);
    assert.match(reasons[0], new RegExp(`the ${name} index changed \\(sha256:[123]{12} is live, sha256:aaaaaaaaaaaa is current\\)`));
  }
});

test('compareBuild: several differences are all reported', () => {
  const {reasons} = compareBuild({live: marker({commit: OTHER}), commit: COMMIT, checksums: {...SUMS, ovdbDirectory: sum('b'), meaninggraph: sum('c')}});
  assert.equal(reasons.length, 3);
});

test('compareBuild: a missing or unreadable live marker, or one without the new fields, is a change', () => {
  assert.equal(compareBuild({live: null, commit: COMMIT, checksums: SUMS}).changed, true);
  assert.equal(compareBuild({live: 'text', commit: COMMIT, checksums: SUMS}).changed, true);
  // a marker from before the commit and checksums were recorded
  const old = compareBuild({live: {format: 'modelspec-build/1', production: true}, commit: COMMIT, checksums: SUMS});
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
  assert.equal(indexChecksum('x', {checksum: sum('1')}), sum('1'));
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
  const result = await check({...indexes({...SUMS, modelspec: sum('d')}), [MARKER_URL]: marker()});
  assert.equal(result.changed, true);
  assert.match(result.reasons[0], /modelspec index changed/);
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
  await assert.rejects(check({[MARKER_URL]: marker(), [URLS.modelspec]: {checksum: sum('8')}, [URLS.ovdbDirectory]: {checksum: sum('9')}}), /cannot read https:\/\/idx\.test\/meaning\.json: HTTP 404/);
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
  const wrongSums = await verifyLive({fetch: fakeFetch({[MARKER_URL]: marker({checksums: {...SUMS, ovdbDirectory: sum('e')}})}), markerUrl: MARKER_URL, built: marker(), delaysMs: [], sleep: noSleep});
  assert.equal(wrongSums.ok, false);
  assert.match(wrongSums.reasons[0], /ovdbDirectory index changed/);
});

test('check-fresh refuses an overridden index without touching the network', () => {
  const run = spawnSync(process.execPath, ['scripts/check-fresh.mjs'], {
    cwd: REPO, encoding: 'utf8',
    env: {PATH: process.env.PATH, BUILD_COMMIT: COMMIT, OVDB_DIRECTORY_INDEX_URL: 'https://example.test/index.json'},
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Refusing to deploy while OVDB_DIRECTORY_INDEX_URL is set/);
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
  const hostile = compareBuild({live: {commit: 'z\n::error::x', checksums: {...SUMS, ovdbDirectory: '\n::warning::y'}}, commit: COMMIT, checksums: SUMS});
  assert.match(hostile.reasons.join(), /site commit invalid is live/);
  assert.match(hostile.reasons.join(), /ovdbDirectory index changed \(invalid is live/);
  assert.ok(!hostile.reasons.join('').includes('::'));
});

test('a failed read puts no part of the response in the message but the parser message, cleaned', async () => {
  const fetchImpl = fakeFetch({'https://x.test/j': '{"a": "::error::boom"\n'});
  await assert.rejects(fetchJson(fetchImpl, 'https://x.test/j', {sleep: noSleep}), error => !/\n|::/.test(error.message));
});

// ---- what a notification asks for ----

const KNOWN = {'ovdb-directory': 'ovdbDirectory', 'modelspec-registry': 'modelspec'};

test('parseAwaited: nothing, a valid pair, or an error that says what is wrong', () => {
  assert.equal(parseAwaited({}, KNOWN), null);
  assert.equal(parseAwaited({index: '', checksum: ''}, KNOWN), null);
  assert.deepEqual(parseAwaited({index: 'ovdb-directory', checksum: sum('f')}, KNOWN), {name: 'ovdbDirectory', checksum: sum('f')});
  assert.throws(() => parseAwaited({index: 'ovdb-directory'}, KNOWN), /needs both/);
  assert.throws(() => parseAwaited({checksum: sum('f')}, KNOWN), /needs both/);
  assert.throws(() => parseAwaited({index: 'unknown', checksum: sum('f')}, KNOWN), /does not read an index called "unknown"/);
  assert.throws(() => parseAwaited({index: '__proto__', checksum: sum('f')}, KNOWN), /does not read/);
  assert.throws(() => parseAwaited({index: 'constructor', checksum: sum('f')}, KNOWN), /does not read/);
  assert.throws(() => parseAwaited({index: 'a\n::error::b', checksum: sum('f')}, KNOWN), error => !/\n|::error::/.test(error.message));
  for (const bad of ['sha256:abc', sum('f').toUpperCase(), `${sum('f')}0`, `${sum('f')}\n`, 'md5:' + 'f'.repeat(64), ` ${sum('f')}`, `sha256:${'g'.repeat(64)}`]) {
    assert.throws(() => parseAwaited({index: 'ovdb-directory', checksum: bad}, KNOWN), /sha256: followed by 64/, JSON.stringify(bad));
  }
});

// ---- waiting for an index that was just changed (a fake clock: sleeping moves it) ----

function clock() {
  let t = 1_000_000;
  return {now: () => t, sleep: async ms => { t += ms; }, elapsed: () => t - 1_000_000};
}
const INDEX_URL = 'https://idx.test/ovdb.json';

test('awaitChecksum returns at once when the index already carries the checksum', async () => {
  const c = clock();
  const result = await awaitChecksum({fetch: fakeFetch({[INDEX_URL]: {checksum: sum('f')}}), name: 'ovdbDirectory', url: INDEX_URL, expected: sum('f'), ...c});
  assert.deepEqual(result, {attempts: 1, waitedMs: 0});
});

test('awaitChecksum waits through a stale read, then a failed one, until the new checksum arrives', async () => {
  const c = clock();
  const fetchImpl = fakeFetch({[INDEX_URL]: n => (n === 1 || n === 2 ? {checksum: sum('1')} : n === 3 ? 503 : {checksum: sum('f')})});
  const logs = [];
  const result = await awaitChecksum({fetch: fetchImpl, name: 'ovdbDirectory', url: INDEX_URL, expected: sum('f'), intervalMs: 30_000, log: line => logs.push(line), ...c});
  assert.equal(result.attempts, 4);
  assert.equal(c.elapsed(), 90_000, 'three waits of 30s');
  assert.equal(fetchImpl.calls.get(INDEX_URL), 4);
  assert.equal(logs.length, 3);
  assert.match(logs[0], /does not carry sha256:ffffffffffff yet \(sha256:111111111111\)/);
  assert.match(logs[2], /unreadable: cannot fetch .*HTTP 503/);
});

test('awaitChecksum gives up after about ten minutes, with a bounded number of reads, and says what it saw', async () => {
  const c = clock();
  const fetchImpl = fakeFetch({[INDEX_URL]: {checksum: sum('1')}});
  await assert.rejects(
    awaitChecksum({fetch: fetchImpl, name: 'ovdbDirectory', url: INDEX_URL, expected: sum('f'), ...c}),
    error => error instanceof FreshnessError && /still does not carry sha256:ffffffffffff after 10 minutes and 21 reads \(last seen: sha256:111111111111\)/.test(error.message)
  );
  assert.equal(c.elapsed(), 600_000);
  assert.equal(fetchImpl.calls.get(INDEX_URL), 21);
});

test('awaitChecksum never trusts the shape of what it reads, and refuses a malformed expectation', async () => {
  const c = clock();
  const hostile = fakeFetch({[INDEX_URL]: {checksum: '\n::error::x'}});
  await assert.rejects(awaitChecksum({fetch: hostile, name: 'ovdbDirectory', url: INDEX_URL, expected: sum('f'), deadlineMs: 1000, intervalMs: 500, ...c}), error => /last seen: invalid/.test(error.message) && !/::/.test(error.message));
  await assert.rejects(awaitChecksum({fetch: hostile, name: 'x', url: INDEX_URL, expected: 'sha256:short', ...c}), /sha256: followed by 64/);
  assert.equal(hostile.calls.get(INDEX_URL), 3, 'the malformed expectation read nothing: only the three reads of the first call');
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

test('verifyLive waits with growing waits too', async () => {
  const waits = [];
  const stale = fakeFetch({[MARKER_URL]: marker({commit: OTHER})});
  const result = await verifyLive({fetch: stale, markerUrl: MARKER_URL, built: marker(), sleep: async ms => { waits.push(ms); }});
  assert.equal(result.ok, false);
  assert.equal(waits.reduce((a, b) => a + b, 0), 140_000);
});

// ---- the CLI: input checking happens before any network ----

test('check-fresh refuses a malformed announcement before it reads anything', () => {
  for (const [env, message] of [
    [{IN_INDEX: 'ovdb-directory'}, /needs both/],
    [{IN_INDEX: 'nope', IN_CHECKSUM: sum('f')}, /does not read an index called "nope"/],
    [{IN_INDEX: 'ovdb-directory', IN_CHECKSUM: 'sha256:abc'}, /sha256: followed by 64/],
  ]) {
    const run = spawnSync(process.execPath, ['scripts/check-fresh.mjs'], {cwd: REPO, encoding: 'utf8', env: {PATH: process.env.PATH, BUILD_COMMIT: COMMIT, ...env}});
    assert.equal(run.status, 1, JSON.stringify(env));
    assert.match(run.stderr, message);
  }
});

// ---- the build checks that it read the awaited index ----

test('assertAwaited passes when nothing is awaited or the index carries the checksum, and throws on a stale read', () => {
  assertAwaited(null, SUMS);
  assertAwaited({key: 'modelspec', checksum: SUMS.modelspec}, SUMS);
  assert.throws(() => assertAwaited({key: 'modelspec', checksum: sum('f')}, SUMS), /modelspec index read for this build does not carry the announced checksum sha256:f{64} \(it carries sha256:1{64}\): the read was stale/);
  assert.throws(() => assertAwaited({key: 'meaninggraph', checksum: sum('f')}, {modelspec: SUMS.modelspec}), /it carries none/);
});

test('AWAIT_INDEX and AWAIT_CHECKSUM are set together and must be an index and a sha256 checksum; a fixture build awaits nothing', async () => {
  const {resolveBuildConfig} = await import('../src/config.mjs');
  const resolve = (argv, env) => resolveBuildConfig(argv, env, {root: REPO});
  assert.equal(resolve([], {}).awaited, null);
  assert.deepEqual(resolve([], {AWAIT_INDEX: 'modelspec', AWAIT_CHECKSUM: sum('f')}).awaited, {key: 'modelspec', checksum: sum('f')});
  assert.equal(resolve(['--use-fixture'], {AWAIT_INDEX: 'modelspec', AWAIT_CHECKSUM: sum('f')}).awaited, null);
  for (const env of [{AWAIT_INDEX: 'modelspec'}, {AWAIT_CHECKSUM: sum('f')}, {AWAIT_INDEX: 'nope', AWAIT_CHECKSUM: sum('f')}, {AWAIT_INDEX: 'modelspec', AWAIT_CHECKSUM: 'sha256:abc'}]) {
    assert.throws(() => resolve([], env), /AWAIT_INDEX must be one of/, JSON.stringify(env));
  }
});

test('buildSite stops, writing nothing, when an index does not carry the awaited checksum', async () => {
  const {readFileSync} = await import('node:fs');
  const text = readFileSync(`${REPO}/src/site.mjs`, 'utf8');
  const order = ['await loadData(', 'assertAwaited(config.awaited', 'await prepareOutput(' ].map(needle => text.indexOf(needle));
  assert.ok(order[0] > 0 && order[1] > order[0], 'the check follows the read of the indexes');
  assert.ok(text.indexOf('await mkdir(out') > order[1], 'and comes before anything is written');
});
