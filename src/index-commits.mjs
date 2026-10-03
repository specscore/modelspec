// Reading the data repositories' indexes at an exact commit.
//
// raw.githubusercontent.com answers from a cache that can be five minutes old, so a build that reads
// `.../main/index.json` can read an index that was changed minutes ago and miss the change. Instead, each
// deploy-capable run resolves the current `main` of every data repository it reads to a commit
// (`git ls-remote`, which is not cached and needs no token: the repositories are public) and reads
// `https://raw.githubusercontent.com/<org>/<repo>/<commit>/index.json`, which never changes. Every run
// therefore sees every index at its true current head, and the build records the commits in its marker.
//
// This module resolves the commits, builds and recognises the pinned URLs, and cleans the git environment.
// Nothing here has a token: git is started with an argument list, a cleaned environment and a time limit.
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';

export const COMMIT_RE = /^[0-9a-f]{40}$/;

// The indexes this site reads: its key for each, the data repository, and the variables that name its
// URL and the commit to read it at.
export const INDEXES = {
  modelspec: {repo: 'modelspec-org/registry', urlEnv: 'MODELSPEC_REGISTRY_INDEX_URL', commitEnv: 'MODELSPEC_REGISTRY_INDEX_COMMIT'},
  meaninggraph: {repo: 'meaninggraph/registry', urlEnv: 'MEANINGGRAPH_REGISTRY_INDEX_URL', commitEnv: 'MEANINGGRAPH_REGISTRY_INDEX_COMMIT'},
  ovdbDirectory: {repo: 'openvaultdb/directory', urlEnv: 'OVDB_DIRECTORY_INDEX_URL', commitEnv: 'OVDB_DIRECTORY_INDEX_COMMIT'}
};

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pinnedPattern = repo => new RegExp(`^https://raw\\.githubusercontent\\.com/${escape(repo)}/([0-9a-f]{40})/index\\.json$`);

/** The URL of `repo`'s index.json at `commit` (40 lower-case hex digits). */
export function pinnedIndexUrl(repo, commit) {
  if (!COMMIT_RE.test(commit ?? '')) throw new Error(`a commit must be 40 lower-case hex digits, got ${JSON.stringify(String(commit).slice(0, 60))}`);
  return `https://raw.githubusercontent.com/${repo}/${commit}/index.json`;
}

/** The commit when `url` is exactly the pinned URL of `repo`'s index.json, otherwise null. No other host, repo, branch, path or query. */
export function pinnedCommitOf(url, repo) {
  return pinnedPattern(repo).exec(String(url))?.[1] ?? null;
}

/** True for the production URL of an index: the fixed `main` URL, or exactly the pinned URL of the same repository. */
export function isProductionIndexUrl(url, fallback, repo) {
  return url === fallback || pinnedCommitOf(url, repo) !== null;
}

/** The commits named in the environment: {key: commit|null}. All or none of them; each is checked for shape. */
export function pinsFromEnv(env = process.env) {
  const pins = {};
  for (const [key, {commitEnv}] of Object.entries(INDEXES)) {
    const value = env[commitEnv]?.trim() || '';
    if (value && !COMMIT_RE.test(value)) throw new Error(`${commitEnv} must be 40 lower-case hex digits`);
    pins[key] = value || null;
  }
  const present = Object.entries(pins).filter(([, commit]) => commit).map(([key]) => INDEXES[key].commitEnv);
  if (present.length > 0 && present.length < Object.keys(INDEXES).length) {
    throw new Error(`${present.join(', ')} is set without the commits of the other indexes: set all of ${Object.values(INDEXES).map(index => index.commitEnv).join(', ')} or none`);
  }
  return present.length ? pins : null;
}

/** The environment git runs in: no credentials, no user or system configuration, no prompt. */
export function gitEnvironment() {
  return {PATH: process.env.PATH ?? '', HOME: tmpdir(), LC_ALL: 'C', GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null'};
}

const defaultRun = args => execFileSync('git', args, {env: gitEnvironment(), cwd: tmpdir(), encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe']});

/** The commit `git ls-remote <url> refs/heads/main` printed: exactly one line, `<40 hex>\trefs/heads/main`. */
export function parseLsRemote(output, repo) {
  const lines = String(output ?? '').split('\n').filter(line => line !== '');
  if (lines.length !== 1) throw new Error(`git ls-remote for ${repo} printed ${lines.length} lines, not one`);
  const found = /^([0-9a-f]{40})\trefs\/heads\/main$/.exec(lines[0]);
  if (!found) throw new Error(`git ls-remote for ${repo} printed something that is not "<40 hex digits> refs/heads/main"`);
  return found[1];
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Resolves the current `main` of each data repository to a commit: {key: commit}. `run(args)` returns the output
 * of git (injected by the tests); a failed run is retried (`attempts` in all), an answer of the wrong shape is
 * refused at once. Never reads a cache and never needs a token.
 */
export async function resolveHeads({indexes = INDEXES, run = defaultRun, attempts = 3, retryDelayMs = 2_000, sleep = wait} = {}) {
  const heads = {};
  for (const [key, {repo}] of Object.entries(indexes)) {
    let output;
    for (let attempt = 1; ; attempt++) {
      try {
        output = run(['ls-remote', `https://github.com/${repo}`, 'refs/heads/main']);
        break;
      } catch (error) {
        if (attempt >= attempts) throw new Error(`cannot resolve main of ${repo}: ${String(error.message ?? error).split('\n')[0].slice(0, 160)}`);
        await sleep(retryDelayMs);
      }
    }
    heads[key] = parseLsRemote(output, repo);
  }
  return heads;
}

/** The environment lines (`NAME=commit`) that hand resolved commits on to the build. */
export function commitEnvLines(heads) {
  return Object.entries(INDEXES).map(([key, {commitEnv}]) => `${commitEnv}=${heads[key]}`);
}

/** Runs git with `args` in `cwd` (a fixed argument list, no shell, a cleaned environment, a time limit) and returns its output. */
export function gitCommand(args, cwd) {
  return execFileSync('git', args, {env: gitEnvironment(), cwd, encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe']});
}

/** The commit of HEAD in `cwd`, or '' when there is none. */
export function headCommit(cwd, run = args => gitCommand(args, cwd)) {
  try {
    const commit = run(['rev-parse', 'HEAD']).trim();
    return COMMIT_RE.test(commit) ? commit : '';
  } catch {
    return '';
  }
}

/**
 * The environment a build reads its indexes with. Pins already in `env` (a workflow resolved them) are used as
 * they are. Otherwise, for a production build by hand (no commit, no URL variable, no fixture), the current
 * `main` of each data repository is resolved with `resolve` and added as the three commit variables. A build
 * that names an index by URL, or reads a fixture, resolves nothing: it reads what it was told to read.
 * Returns {env, heads}: heads is null when nothing was resolved.
 */
export async function envWithPins({env = process.env, argv = [], resolve = resolveHeads, indexes = INDEXES, fixtureVars = []} = {}) {
  const named = Object.values(indexes).some(({urlEnv, commitEnv}) => env[urlEnv] || env[commitEnv]);
  const fixture = argv.includes('--use-fixture') || fixtureVars.some(name => ['1', 'true', 'yes'].includes(String(env[name] ?? '').toLowerCase()));
  if (named || fixture) return {env, heads: null};
  const heads = await resolve();
  return {env: {...env, ...Object.fromEntries(Object.entries(indexes).map(([key, {commitEnv}]) => [commitEnv, heads[key]]))}, heads};
}
