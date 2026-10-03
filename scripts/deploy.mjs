#!/usr/bin/env node
// `npm run deploy`: builds dist/ from the three production indexes and deploys
// exactly that dist/.
//
// Nothing that could change what is uploaded is honoured: no arguments (npm
// appends them to the script, so `npm run deploy -- --assets x` would reach
// wrangler), no fixture or local-index flags, and none of the index or base-URL
// variables unless it is set to the production value. There is no override.
// wrangler is then run as `wrangler deploy --config <ROOT>/wrangler.jsonc
// --assets <ROOT>/dist` (absolute paths), so a stray wrangler.json, wrangler.toml
// or .wrangler/deploy/config.json redirect cannot change the configuration, and
// the directory uploaded is the directory the guard checked. The build guard in
// wrangler.jsonc (scripts/check-build.mjs) checks dist/ once more when wrangler
// starts. Only this script is protected against such flags and files: a plain
// `wrangler deploy --assets <dir>` is not.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULTS, ROOT } from '../src/config.mjs';
import { COMMIT_RE, INDEXES, gitCommand, isProductionIndexUrl, pinsFromEnv } from '../src/index-commits.mjs';
import { distProblems } from './check-build.mjs';

/**
 * `--use-existing-build`: upload the dist/ that a production build (npm run build) already made, after the same
 * verification, instead of checking and building again. The deploy workflow uses it so that the check and the
 * build, which parse the public indexes, run in earlier steps without the Cloudflare token. Because nothing is
 * built here, three more things are required first: the build marker's commit is HEAD, the working tree is clean
 * (no tracked change, no untracked file), and dist/ matches the manifest of file hashes the build wrote (an extra,
 * a missing or a changed file is refused; scripts/check-build.mjs, which wrangler runs again as its build command).
 */
export const EXISTING_FLAG = '--use-existing-build';

/** The variables that give access to the Cloudflare account: only the wrangler call gets them. */
export const CLOUDFLARE_ENV = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'];

/** `env` without the Cloudflare credentials. */
export function withoutCloudflare(env) {
  const rest = { ...env };
  for (const name of CLOUDFLARE_ENV) delete rest[name];
  return rest;
}

// The index URL variables: the production `main` URL, or (not together with the commit variables) exactly the
// pinned URL of the same repository.
const INDEX_URLS = {
  MODELSPEC_REGISTRY_INDEX_URL: [DEFAULTS.modelspecRegistryIndex, 'modelspec'],
  MEANINGGRAPH_REGISTRY_INDEX_URL: [DEFAULTS.meaningGraphRegistryIndex, 'meaninggraph'],
  OVDB_DIRECTORY_INDEX_URL: [DEFAULTS.ovdbDirectoryIndex, 'ovdbDirectory'],
};

const ENV_DEFAULTS = {
  MEANINGGRAPH_BASE_URL: DEFAULTS.meaningGraphBaseUrl,
  OVDB_DIRECTORY_BASE_URL: DEFAULTS.ovdbDirectoryBaseUrl,
};

/**
 * Validate a deploy request. Throws with the reason when it must be refused,
 * otherwise returns the environment for the build step (the caller's, minus the
 * variables that select a source or a destination).
 */
export function planDeploy(argv, env) {
  const unknown = argv.filter(arg => arg !== EXISTING_FLAG);
  if (unknown.length > 0) {
    throw new Error(`Refusing to deploy: npm run deploy takes no arguments (got ${unknown.join(' ')}). It deploys exactly the dist/ it builds from the production indexes; use plain wrangler yourself for anything else`);
  }
  // The data repository commits to read the indexes at (all or none, shape-checked); the build is told them, or resolves them itself.
  const pins = pinsFromEnv(env);
  // The check and the build parse public indexes: they never get the Cloudflare credentials.
  const buildEnv = withoutCloudflare(env);
  for (const [name, [fallback, key]] of Object.entries(INDEX_URLS)) {
    const value = (env[name] ?? '').trim();
    if (value !== '' && pins) throw new Error(`Refusing to deploy: ${name} and ${INDEXES[key].commitEnv} are both set; the commit names the URL`);
    if (value !== '' && value !== fallback && !isProductionIndexUrl(value, fallback, INDEXES[key].repo)) {
      throw new Error(`Refusing to deploy while ${name} is set to ${value}: a deploy always uses ${fallback} or its pinned commit URL`);
    }
    // the production default applies anyway; a pinned URL is passed on to the build
    if (value === '' || value === fallback) delete buildEnv[name];
  }
  for (const [name, fallback] of Object.entries(ENV_DEFAULTS)) {
    const value = (env[name] ?? '').trim();
    if (value !== '' && value.replace(/\/+$/, '') !== fallback) {
      throw new Error(`Refusing to deploy while ${name} is set to ${value}: a deploy always uses ${fallback}`);
    }
    delete buildEnv[name];
  }
  return { buildEnv, useExisting: argv.includes(EXISTING_FLAG) };
}

/** Files that would make wrangler read some other configuration than wrangler.jsonc. */
export const CONFIG_OVERRIDES = ['wrangler.json', 'wrangler.toml', '.wrangler/deploy/config.json'];

/** The wrangler configuration files that must not exist beside wrangler.jsonc; an empty list means fit. */
export function configOverrides(root = ROOT, exists = existsSync) {
  return CONFIG_OVERRIDES.filter(file => exists(join(root, file)));
}

/** Run a command with inherited output; the exit status (1 when it could not start). */
function runCommand(command, args, env) {
  return spawnSync(command, args, { cwd: ROOT, env, stdio: 'inherit' }).status ?? 1;
}

/** Run git (a fixed argument list, no shell, a cleaned environment, a time limit) in the repository and return its output. */
function runGit(args) {
  return gitCommand(args, ROOT);
}

/**
 * What stops a build that was not made in this step from being uploaded: the marker's commit is not HEAD, or the
 * working tree is not clean. `git(args)` returns the output of git (injectable for tests).
 */
export function checkoutProblems(markerCommit, git = runGit) {
  const problems = [];
  let head = '';
  try {
    head = git(['rev-parse', 'HEAD']).trim();
  } catch {
    problems.push('git cannot tell which commit HEAD is, so the build cannot be tied to it');
  }
  if (head && !COMMIT_RE.test(head)) problems.push('git printed something that is not a commit id for HEAD');
  else if (head && markerCommit !== head) {
    problems.push(`the build was made from ${typeof markerCommit === 'string' && COMMIT_RE.test(markerCommit) ? markerCommit.slice(0, 12) : 'no recorded commit'}, but HEAD is ${head.slice(0, 12)}: build again (npm run build) at this commit`);
  }
  try {
    const dirty = git(['status', '--porcelain', '--untracked-files=all']).split('\n').filter(Boolean);
    if (dirty.length > 0) problems.push(`the working tree is not clean (${dirty.length} changed or untracked file${dirty.length === 1 ? '' : 's'}, for example ${JSON.stringify(dirty[0].replace(/[^ -~]/g, '?').slice(0, 80))}): the upload would not be what was reviewed`);
  } catch {
    problems.push('git cannot tell whether the working tree is clean');
  }
  return problems;
}

/** The commit a build recorded in its build-info.json ('' when unreadable). */
function recordedCommit(root) {
  try {
    const commit = JSON.parse(readFileSync(join(root, 'dist', 'build-info.json'), 'utf8')).commit;
    return typeof commit === 'string' ? commit : '';
  } catch {
    return '';
  }
}

/**
 * Check, build, verify, upload. `run`, `verify` and `git` are injectable for tests.
 * Resolves only when wrangler ran; every other outcome throws.
 */
export async function deploy({ argv, env, root = ROOT, run = runCommand, verify = () => distProblems(root), exists = existsSync, log = console.log, git = runGit, recorded = () => recordedCommit(root) }) {
  const { buildEnv, useExisting } = planDeploy(argv, env);
  const overrides = configOverrides(root, exists);
  if (overrides.length > 0) {
    throw new Error(`Refusing to deploy: ${overrides.join(', ')} exists beside wrangler.jsonc and could make wrangler read another configuration (it is git-ignored or untracked, so git status may not show it). Remove it: rm ${overrides.join(' ')}`);
  }
  const steps = useExisting ? [] : [
    ['check', 'npm', ['run', '--silent', 'check'], buildEnv],
    ['build', process.execPath, [join(root, 'scripts/build.mjs'), '--out', 'dist'], buildEnv],
  ];
  for (const [name, command, args, stepEnv] of steps) {
    const status = run(command, args, stepEnv);
    if (status !== 0) throw new Error(`Refusing to deploy: the ${name} step failed (exit ${status})`);
  }
  if (useExisting) {
    const refused = checkoutProblems(recorded(), git);
    if (refused.length > 0) throw new Error(`Refusing to deploy the existing build:\n  ${refused.join('\n  ')}`);
  }
  const problems = await verify();
  if (problems.length > 0) throw new Error(`Refusing to deploy:\n  ${problems.join('\n  ')}`);
  log('dist/ was built from the production indexes.');
  // The configuration and the assets directory are named explicitly, with absolute paths; nothing from our own argv reaches wrangler.
  const status = run(join(root, 'node_modules/.bin/wrangler'), ['deploy', '--config', join(root, 'wrangler.jsonc'), '--assets', join(root, 'dist')], env);
  if (status !== 0) throw new Error(`wrangler deploy failed (exit ${status})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  deploy({ argv: process.argv.slice(2), env: process.env }).catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
