#!/usr/bin/env node
// First step of a manual or notified deploy: is the live site current? Fetches the live /build-info.json, compares
// the commit of this repository and the commit of each data repository the site is built from (the ModelSpec
// registry, the MeaningGraph registry and the OVDB Directory; resolved by scripts/resolve-index-commits.mjs and
// passed in the environment) with what the live build recorded (src/freshness.mjs), and prints why when they differ.
//
//   BUILD_COMMIT=<40-digit commit> MODELSPEC_REGISTRY_INDEX_COMMIT=... MEANINGGRAPH_REGISTRY_INDEX_COMMIT=... \
//   OVDB_DIRECTORY_INDEX_COMMIT=... [FORCE=true] node scripts/check-fresh.mjs
//
// FORCE=true skips only the comparison. Under GitHub Actions it also sets BUILD_NEEDED=true|false for the later
// steps (GITHUB_ENV) and adds a line to the job summary. Exit 0 whatever the answer; 1 when a commit is missing
// or malformed, or the configuration is not the production one. Needs no dependencies installed.

import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveBuildConfig, SITE_URL } from '../src/config.mjs';
import { MARKER_PATH, checkFreshness, printable } from '../src/freshness.mjs';
import { INDEXES, pinsFromEnv } from '../src/index-commits.mjs';
import { planDeploy } from './deploy.mjs';

function note(file, text) {
  if (process.env[file]) appendFileSync(process.env[file], `${text}\n`);
}

async function main() {
  // the same refusals as `npm run deploy`: no override of an index or a base URL
  planDeploy([], process.env);
  const config = resolveBuildConfig([], process.env);
  if (!config.production) throw new Error(`this is a ${config.mode} configuration, not the production one, so there is nothing to compare`);
  if (process.env.FORCE === 'true') {
    const line = 'Forced: the comparison is skipped, a build and deploy follow.';
    console.log(line);
    note('GITHUB_STEP_SUMMARY', line);
    return;
  }
  const pins = pinsFromEnv(process.env);
  if (!pins) throw new Error(`the data repositories' commits are not set (${Object.values(INDEXES).map(index => index.commitEnv).join(', ')}): run scripts/resolve-index-commits.mjs first`);
  const { changed, reasons } = await checkFreshness({ markerUrl: `${SITE_URL}${MARKER_PATH}`, indexCommits: pins, commit: process.env.BUILD_COMMIT });
  const line = changed
    ? `The live site is out of date, a build and deploy follow: ${printable(reasons.join('; '))}.`
    : 'The live site already serves this commit and these data repository commits: nothing to build or deploy.';
  console.log(line);
  note('GITHUB_ENV', `BUILD_NEEDED=${changed}`);
  note('GITHUB_STEP_SUMMARY', line);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`::error::${printable(error.message)}`);
    process.exit(1);
  });
}
