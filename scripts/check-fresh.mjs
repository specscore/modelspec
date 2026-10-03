#!/usr/bin/env node
// First step of a manual or notified deploy: is the live site current? Fetches the live /build-info.json and the
// three indexes the site is built from (the ModelSpec registry, the MeaningGraph registry and the OVDB Directory
// index), compares the commit of this repository and each index checksum with what the live build recorded
// (src/freshness.mjs), and prints why when they differ.
//
//   BUILD_COMMIT=<40-digit commit> [FORCE=true] [IN_INDEX=<index> IN_CHECKSUM=<sha256:...>] node scripts/check-fresh.mjs
//
// A notification names the index that just changed and its new checksum (IN_INDEX, IN_CHECKSUM: untrusted
// text, checked here). The index is read until it carries that checksum (about ten minutes at most; failing
// after that is deliberate: nothing else would repair a stale read), and AWAIT_INDEX / AWAIT_CHECKSUM are set
// for the build, which refuses an index that does not carry it. FORCE=true skips only the comparison.
//
// Under GitHub Actions it also sets BUILD_NEEDED=true|false for the later steps (GITHUB_ENV) and adds a line to
// the job summary. Exit 0 whatever the answer; 1 when an index cannot be read, the awaited checksum never
// arrives, or the configuration is not the production one. Needs no dependencies installed.

import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveBuildConfig, SITE_URL } from '../src/config.mjs';
import { MARKER_PATH, awaitChecksum, checkFreshness, parseAwaited, printable } from '../src/freshness.mjs';
import { planDeploy } from './deploy.mjs';

// The index names a data repository sends, and this site's names for them.
export const KNOWN_INDEXES = { 'modelspec-registry': 'modelspec', 'meaninggraph-registry': 'meaninggraph', 'ovdb-directory': 'ovdbDirectory' };

function note(file, text) {
  if (process.env[file]) appendFileSync(process.env[file], `${text}\n`);
}

async function main() {
  // the same refusals as `npm run deploy`: no override of an index or a base URL
  planDeploy([], process.env);
  const config = resolveBuildConfig([], process.env);
  if (!config.production) throw new Error(`this is a ${config.mode} configuration, not the production one, so there is nothing to compare`);
  const indexUrls = { modelspec: config.sources.modelspec.location, meaninggraph: config.sources.meaninggraph.location, ovdbDirectory: config.sources.directory.location };
  const awaited = parseAwaited({ index: process.env.IN_INDEX, checksum: process.env.IN_CHECKSUM }, KNOWN_INDEXES);
  if (awaited) {
    const { attempts } = await awaitChecksum({ name: awaited.name, url: indexUrls[awaited.name], expected: awaited.checksum, log: console.log });
    console.log(`The ${awaited.name} index carries the announced checksum (read ${attempts}).`);
    // shape-checked above: safe to hand on to the build
    note('GITHUB_ENV', `AWAIT_INDEX=${awaited.name}\nAWAIT_CHECKSUM=${awaited.checksum}`);
  }
  if (process.env.FORCE === 'true') {
    const line = 'Forced: the comparison is skipped, a build and deploy follow.';
    console.log(line);
    note('GITHUB_STEP_SUMMARY', line);
    return;
  }
  const { changed, reasons } = await checkFreshness({ markerUrl: `${SITE_URL}${MARKER_PATH}`, indexUrls, commit: process.env.BUILD_COMMIT });
  const line = changed
    ? `The live site is out of date, a build and deploy follow: ${printable(reasons.join('; '))}.`
    : 'The live site already serves this commit and these index checksums: nothing to build or deploy.';
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
