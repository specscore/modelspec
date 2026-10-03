#!/usr/bin/env node
// Manual or notified deploy, step one: is the live site current? Fetches the live /build-info.json and the three
// indexes the site is built from (the ModelSpec registry, the MeaningGraph registry and the OVDB Directory
// index), compares the commit of this repository and each index checksum with what the live build
// recorded (src/freshness.mjs), and prints why when they differ.
//
//   BUILD_COMMIT=<40-digit commit> node scripts/check-fresh.mjs
//
// Under GitHub Actions it also sets BUILD_NEEDED=true|false for the later steps (GITHUB_ENV) and adds a
// line to the job summary. Exit 0 whatever the answer; 1 when an index cannot be read (the build would
// fail the same way) or the configuration is not the production one. Needs no dependencies installed.

import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveBuildConfig, SITE_URL } from '../src/config.mjs';
import { MARKER_PATH, checkFreshness } from '../src/freshness.mjs';
import { planDeploy } from './deploy.mjs';

function note(file, text) {
  if (process.env[file]) appendFileSync(process.env[file], `${text}\n`);
}

async function main() {
  // the same refusals as `npm run deploy`: no override of an index or a base URL
  planDeploy([], process.env);
  const config = resolveBuildConfig([], process.env);
  if (!config.production) throw new Error(`this is a ${config.mode} configuration, not the production one, so there is nothing to compare`);
  const { changed, reasons } = await checkFreshness({
    markerUrl: `${SITE_URL}${MARKER_PATH}`,
    indexUrls: { modelspec: config.sources.modelspec.location, meaninggraph: config.sources.meaninggraph.location, ovdbDirectory: config.sources.directory.location },
    commit: process.env.BUILD_COMMIT,
  });
  const line = changed
    ? `The live site is out of date, a build and deploy follow: ${reasons.join('; ')}.`
    : 'The live site already serves this commit and these index checksums: nothing to build or deploy.';
  console.log(line);
  note('GITHUB_ENV', `BUILD_NEEDED=${changed}`);
  note('GITHUB_STEP_SUMMARY', line);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`::error::${error.message}`);
    process.exit(1);
  });
}
