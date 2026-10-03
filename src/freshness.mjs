// Decides whether the live site is still current, and checks that a deploy reached the live site.
//
// A build records, in its build marker (served at MARKER_PATH), the commit of this repository, the commit
// of each data repository its indexes were read at (`indexCommits`) and the `checksum` of each index
// (`checksums`). A manual or notified deploy resolves the current commit of each data repository
// (scripts/resolve-index-commits.mjs), fetches the live marker and compares them here; it builds and
// deploys only on a difference. After a deploy the same comparison, against the build just made, proves
// the live site serves it. The indexes are read at a commit, so what is built is exactly what was resolved.
// Everything takes `fetch` (and the clock) as a parameter, so the tests never touch the network.
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

// What a live (or just built) build marker says it is made of.
export function markerFacts(marker) {
  const record = value => (value && typeof value === 'object' ? value : {});
  return {
    commit: typeof marker?.commit === 'string' ? marker.commit : '',
    indexCommits: record(marker?.indexCommits),
    checksums: record(marker?.checksums)
  };
}

// Pure. `live` is the parsed live marker (null when unreadable); `commit` is this repository's commit,
// `indexCommits` ({indexName: data repository commit}) the commits the indexes would be read at now, and
// `checksums` ({indexName: checksum}), optional, what a build already made recorded. Returns {changed,
// reasons}; no reasons means current. Only the site commit and the index commits decide freshness; the
// checksums are compared after a deploy, when the build is known.
export function compareBuild({live, commit, indexCommits = {}, checksums = {}}) {
  if (!live || typeof live !== 'object') return {changed: true, reasons: ['the live build marker is missing or unreadable']};
  const facts = markerFacts(live);
  const reasons = [];
  if (!facts.commit) reasons.push('the live build marker records no site commit');
  else if (facts.commit !== commit) reasons.push(`site commit ${shortCommit(facts.commit)} is live, ${shortCommit(commit)} is current`);
  for (const [name, wanted] of Object.entries(indexCommits)) {
    const liveCommit = facts.indexCommits[name];
    if (typeof liveCommit !== 'string' || liveCommit === '') reasons.push(`the live build marker records no commit for the ${name} index`);
    else if (liveCommit !== wanted) reasons.push(`the ${name} index changed (commit ${shortCommit(liveCommit)} is live, ${shortCommit(wanted)} is current)`);
  }
  for (const [name, wanted] of Object.entries(checksums)) {
    const liveChecksum = facts.checksums[name];
    if (typeof liveChecksum !== 'string' || liveChecksum === '') reasons.push(`the live build marker records no checksum for the ${name} index`);
    else if (liveChecksum !== wanted) reasons.push(`the ${name} index differs (${shortChecksum(liveChecksum)} is live, ${shortChecksum(wanted)} is built)`);
  }
  return {changed: reasons.length > 0, reasons};
}

// Fetches the live marker and compares it with the current site commit and the resolved data repository
// commits. An unreadable live site counts as "changed" (a deploy is what repairs it).
//   indexCommits: {indexName: 40-hex commit}, every one validated here
export async function checkFreshness({fetch: fetchImpl = globalThis.fetch, markerUrl, indexCommits, commit: given, sleep, retryDelayMs}) {
  const commit = String(given ?? '').toLowerCase();
  if (!COMMIT.test(commit)) throw new FreshnessError('the current commit must be a full 40-digit commit id');
  for (const [name, value] of Object.entries(indexCommits)) {
    if (typeof value !== 'string' || !COMMIT.test(value)) throw new FreshnessError(`the ${name} index commit must be a full 40-digit commit id`);
  }
  let live = null;
  let liveProblem = '';
  try {
    live = await fetchJson(fetchImpl, markerUrl, {sleep, retryDelayMs});
  } catch (error) {
    liveProblem = error.message;
  }
  const result = compareBuild({live, commit, indexCommits});
  if (liveProblem) result.reasons.push(liveProblem);
  return result;
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
      ({reasons} = compareBuild({live, commit: facts.commit, indexCommits: facts.indexCommits, checksums: facts.checksums}));
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
