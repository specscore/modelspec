// Decides whether the live site is still current, waits for an index that was just changed, and checks
// that a deploy reached the live site.
//
// A build records, in its build marker (served at MARKER_PATH), the commit of this repository and the
// `checksum` of each index it was built from (`commit` and `checksums`). A manual or notified deploy
// fetches the live marker and the current indexes and compares them here; it builds and deploys only on a
// difference. After a deploy the same comparison, against the build just made, proves the live site
// serves it. Everything takes `fetch` (and the clock) as a parameter, so the tests never touch the network.
//
// Everything fetched from a public URL is untrusted: it is shape-checked before it is printed (a commit
// is 40 hex digits, a checksum `sha256:` and 64 hex digits, anything else prints as "invalid"), and any
// other text is cleaned by `printable` (no control characters, no run of colons that could make `::` start a log command).

export const MARKER_PATH = '/build-info.json';

export class FreshnessError extends Error {}

const COMMIT = /^[0-9a-f]{40}$/;
export const CHECKSUM = /^sha256:[0-9a-f]{64}$/;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Text that is safe to put in a log line, a notice or the job summary. */
export const printable = (value, max = 300) => String(value ?? '').replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').replace(/:{2,}/g, ' ').slice(0, max);
export const shortCommit = value => (typeof value === 'string' && COMMIT.test(value) ? value.slice(0, 12) : 'invalid');
export const shortChecksum = value => (typeof value === 'string' && CHECKSUM.test(value) ? value.slice(0, 19) : 'invalid');

// GET url and parse it as JSON, retrying network errors, timeouts and HTTP 5xx. Throws FreshnessError.
export async function fetchJson(fetchImpl, url, {attempts = 3, timeoutMs = 20_000, retryDelayMs = 2_000, sleep = wait} = {}) {
  let failure = 'no attempt was made';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (attempt > 1) await sleep(retryDelayMs);
    let response;
    try {
      response = await fetchImpl(url, {headers: {'cache-control': 'no-cache', 'user-agent': 'site-autodeploy'}, signal: AbortSignal.timeout(timeoutMs)});
    } catch (error) {
      failure = printable(error?.message ?? error, 120);
      continue;
    }
    if (response.status >= 500) {
      failure = `HTTP ${response.status}`;
      continue;
    }
    if (!response.ok) throw new FreshnessError(`cannot read ${url}: HTTP ${response.status}`);
    try {
      return JSON.parse(await response.text());
    } catch (error) {
      throw new FreshnessError(`${url} is not valid JSON: ${printable(error.message, 80)}`);
    }
  }
  throw new FreshnessError(`cannot fetch ${url}: ${failure}`);
}

// The checksum an index carries. An index without one cannot be compared, and guessing "changed" would
// redeploy on every run, so it is an error.
export function indexChecksum(name, index) {
  const checksum = index?.checksum;
  if (typeof checksum !== 'string' || checksum === '') {
    throw new FreshnessError(`the ${name} index carries no checksum, so a change in it cannot be detected`);
  }
  return checksum;
}

// What a live (or just built) build marker says it is made of.
export function markerFacts(marker) {
  const checksums = marker && typeof marker === 'object' && marker.checksums && typeof marker.checksums === 'object' ? marker.checksums : {};
  return {commit: typeof marker?.commit === 'string' ? marker.commit : '', checksums};
}

// Pure. `live` is the parsed live marker (null when unreadable); `commit` and `checksums` are what a build
// made now would record ({indexName: checksum}). Returns {changed, reasons}; no reasons means current.
export function compareBuild({live, commit, checksums}) {
  if (!live || typeof live !== 'object') return {changed: true, reasons: ['the live build marker is missing or unreadable']};
  const facts = markerFacts(live);
  const reasons = [];
  if (!facts.commit) reasons.push('the live build marker records no site commit');
  else if (facts.commit !== commit) reasons.push(`site commit ${shortCommit(facts.commit)} is live, ${shortCommit(commit)} is current`);
  for (const [name, checksum] of Object.entries(checksums)) {
    const liveChecksum = facts.checksums[name];
    if (typeof liveChecksum !== 'string' || liveChecksum === '') reasons.push(`the live build marker records no checksum for the ${name} index`);
    else if (liveChecksum !== checksum) reasons.push(`the ${name} index changed (${shortChecksum(liveChecksum)} is live, ${shortChecksum(checksum)} is current)`);
  }
  return {changed: reasons.length > 0, reasons};
}

// Fetches the live marker and the current indexes and compares them. An unreadable live site counts as
// "changed" (a deploy is what repairs it); an unreadable index is an error, as it is for the build.
//   indexUrls: {indexName: url}
export async function checkFreshness({fetch: fetchImpl = globalThis.fetch, markerUrl, indexUrls, commit: given, sleep, retryDelayMs}) {
  const commit = String(given ?? '').toLowerCase();
  if (!COMMIT.test(commit)) throw new FreshnessError('the current commit must be a full 40-digit commit id');
  const options = {sleep, retryDelayMs};
  const checksums = {};
  for (const [name, url] of Object.entries(indexUrls)) {
    checksums[name] = indexChecksum(name, await fetchJson(fetchImpl, url, options));
  }
  let live = null;
  let liveProblem = '';
  try {
    live = await fetchJson(fetchImpl, markerUrl, options);
  } catch (error) {
    liveProblem = error.message;
  }
  const result = compareBuild({live, commit, checksums});
  if (liveProblem) result.reasons.push(liveProblem);
  return {...result, checksums};
}

// What a notification asks for. `input` is {index, checksum} as the dispatch gave them (untrusted text);
// `known` maps the index names a data repository may send to this site's own names for them. Returns null
// when nothing is awaited, {name, checksum} otherwise, or throws a FreshnessError that says what is wrong.
export function parseAwaited({index = '', checksum = ''}, known) {
  if (!index && !checksum) return null;
  if (!index || !checksum) throw new FreshnessError('a notification needs both the index and its checksum');
  if (!/^[a-z][a-z-]{0,39}$/.test(index) || !Object.hasOwn(known, index)) {
    throw new FreshnessError(`this site does not read an index called ${JSON.stringify(printable(index, 40))} (known: ${Object.keys(known).join(', ')})`);
  }
  if (!CHECKSUM.test(checksum)) throw new FreshnessError('the checksum must be sha256: followed by 64 lower-case hex digits');
  return {name: known[index], checksum};
}

// `raw.githubusercontent.com` answers from a cache that can be five minutes old, so a notification sent
// right after an index changed can read the old one. Fetches the index until it carries `expected`, for at
// most `deadlineMs` (the next wait is not started when it would pass the deadline), then fails. `now` and
// `sleep` are injected so that the tests need no real time. The same URL is polled that the build reads,
// so once it answers with the new checksum the build, a few seconds later and from the same place, reads it
// too; and the build checks the checksum itself (src/site.mjs) and fails if it is not the awaited one.
export async function awaitChecksum({fetch: fetchImpl = globalThis.fetch, name, url, expected, deadlineMs = 600_000, intervalMs = 30_000, now = Date.now, sleep = wait, log = () => {}}) {
  if (!CHECKSUM.test(expected ?? '')) throw new FreshnessError('the awaited checksum must be sha256: followed by 64 lower-case hex digits');
  const start = now();
  let last = 'nothing readable yet';
  for (let attempt = 1; ; attempt++) {
    try {
      const seen = (await fetchJson(fetchImpl, url, {attempts: 1}))?.checksum;
      if (seen === expected) return {attempts: attempt, waitedMs: now() - start};
      last = shortChecksum(seen);
    } catch (error) {
      last = `unreadable: ${printable(error.message, 120)}`;
    }
    if (now() - start + intervalMs > deadlineMs) {
      throw new FreshnessError(`the ${name} index still does not carry ${shortChecksum(expected)} after ${Math.round((now() - start) / 6000) / 10} minutes and ${attempt} reads (last seen: ${last}). A newer change may have replaced it: check the data repository.`);
    }
    log(`the ${name} index does not carry ${shortChecksum(expected)} yet (${last}); read ${attempt}, waiting ${intervalMs / 1000}s`);
    await sleep(intervalMs);
  }
}

export const SMOKE_DELAYS_MS = [5_000, 10_000, 15_000, 20_000, 30_000, 30_000, 30_000];

// After a deploy: does the live site serve the build whose marker is `built`? Retries with growing waits
// (about two and a half minutes in all), because the new version takes a moment to reach every edge.
// Returns {ok, reasons}.
export async function verifyLive({fetch: fetchImpl = globalThis.fetch, markerUrl, built, delaysMs = SMOKE_DELAYS_MS, sleep = wait, fetchOptions = {}}) {
  const facts = markerFacts(built);
  if (!COMMIT.test(facts.commit)) return {ok: false, reasons: ['the build marker records no valid site commit, so there is nothing to confirm']};
  let reasons = [];
  for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
    if (attempt > 0) await sleep(delaysMs[attempt - 1]);
    try {
      const live = await fetchJson(fetchImpl, markerUrl, {attempts: 1, sleep, ...fetchOptions});
      ({reasons} = compareBuild({live, commit: facts.commit, checksums: facts.checksums}));
      if (reasons.length === 0) return {ok: true, reasons: []};
    } catch (error) {
      reasons = [error.message];
    }
  }
  return {ok: false, reasons};
}

// After a deploy: does `url` answer 200? Same retries as verifyLive.
export async function expectOk({fetch: fetchImpl = globalThis.fetch, url, delaysMs = SMOKE_DELAYS_MS, sleep = wait}) {
  let reason = '';
  for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
    if (attempt > 0) await sleep(delaysMs[attempt - 1]);
    try {
      const response = await fetchImpl(url, {headers: {'user-agent': 'site-autodeploy'}, signal: AbortSignal.timeout(20_000)});
      if (response.status === 200) return {ok: true, reason: ''};
      reason = `${url} answered HTTP ${response.status}`;
    } catch (error) {
      reason = `${url}: ${printable(error?.message ?? error, 120)}`;
    }
  }
  return {ok: false, reason};
}

/**
 * The build's own check that it read the index that was awaited: `awaited` is {key, checksum} or null,
 * `checksums` the checksums of the indexes the build read ({key: checksum}). Throws when they differ.
 */
export function assertAwaited(awaited, checksums) {
  if (awaited && checksums[awaited.key] !== awaited.checksum) {
    throw new Error(`the ${awaited.key} index read for this build does not carry the announced checksum ${awaited.checksum} (it carries ${checksums[awaited.key] ?? 'none'}): the read was stale, run the deploy again`);
  }
}
