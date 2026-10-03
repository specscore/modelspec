#!/usr/bin/env node
// `npm run deploy`: builds dist/ from the three production indexes and deploys
// exactly that dist/.
//
// Nothing that could change what is uploaded is honoured: no arguments (npm
// appends them to the script, so `npm run deploy -- --assets x` would reach
// wrangler), no fixture or local-index flags, and none of the index or base-URL
// variables unless it is set to the production value. There is no override.
// The build guard in wrangler.jsonc (scripts/check-build.mjs) then checks dist/
// once more when wrangler starts.

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULTS, ROOT } from '../src/config.mjs';
import { distProblems } from './check-build.mjs';

const ENV_DEFAULTS = {
  MODELSPEC_REGISTRY_INDEX_URL: DEFAULTS.modelspecRegistryIndex,
  MEANINGGRAPH_REGISTRY_INDEX_URL: DEFAULTS.meaningGraphRegistryIndex,
  OVDB_DIRECTORY_INDEX_URL: DEFAULTS.ovdbDirectoryIndex,
  MEANINGGRAPH_BASE_URL: DEFAULTS.meaningGraphBaseUrl,
  OVDB_DIRECTORY_BASE_URL: DEFAULTS.ovdbDirectoryBaseUrl,
};

/**
 * Validate a deploy request. Throws with the reason when it must be refused,
 * otherwise returns the environment for the build step (the caller's, minus the
 * variables that select a source or a destination).
 */
export function planDeploy(argv, env) {
  if (argv.length > 0) {
    throw new Error(`Refusing to deploy: npm run deploy takes no arguments (got ${argv.join(' ')}). It deploys exactly the dist/ it builds from the production indexes; use plain wrangler yourself for anything else`);
  }
  const buildEnv = { ...env };
  for (const [name, fallback] of Object.entries(ENV_DEFAULTS)) {
    const value = (env[name] ?? '').trim();
    if (value !== '' && value.replace(/\/+$/, '') !== fallback) {
      throw new Error(`Refusing to deploy while ${name} is set to ${value}: a deploy always uses ${fallback}`);
    }
    delete buildEnv[name];
  }
  return { buildEnv };
}

/** Run a command with inherited output; the exit status (1 when it could not start). */
function runCommand(command, args, env) {
  return spawnSync(command, args, { cwd: ROOT, env, stdio: 'inherit' }).status ?? 1;
}

/**
 * Check, build, verify, upload. `run` and `verify` are injectable for tests.
 * Resolves only when wrangler ran; every other outcome throws.
 */
export async function deploy({ argv, env, run = runCommand, verify = distProblems, log = console.log }) {
  const { buildEnv } = planDeploy(argv, env);
  const steps = [
    ['check', 'npm', ['run', '--silent', 'check'], buildEnv],
    ['build', process.execPath, [join(ROOT, 'scripts/build.mjs'), '--out', 'dist'], buildEnv],
  ];
  for (const [name, command, args, stepEnv] of steps) {
    const status = run(command, args, stepEnv);
    if (status !== 0) throw new Error(`Refusing to deploy: the ${name} step failed (exit ${status})`);
  }
  const problems = await verify();
  if (problems.length > 0) throw new Error(`Refusing to deploy:\n  ${problems.join('\n  ')}`);
  log('dist/ was built from the production indexes.');
  // No arguments: wrangler.jsonc names ./dist, and nothing from our own argv reaches wrangler.
  const status = run(join(ROOT, 'node_modules/.bin/wrangler'), ['deploy'], env);
  if (status !== 0) throw new Error(`wrangler deploy failed (exit ${status})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  deploy({ argv: process.argv.slice(2), env: process.env }).catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
