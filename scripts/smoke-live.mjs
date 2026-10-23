#!/usr/bin/env node
// After a deploy: confirms the live site serves the build just made. The live /build-info.json must
// record this build's commit, index commits and index checksums. The provenance endpoint answers 200;
// public URLs must redirect to MeaningGraph with HTTP 301. Build freshness is
// retried with growing waits (about two and a half minutes in all) while the new version spreads, then fails.
//
//   node scripts/smoke-live.mjs

import { appendFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEPLOY_DIR_NAME, ROOT, SITE_URL } from '../src/config.mjs';
import { verifyCutover } from '../src/cutover.mjs';
import { MARKER_PATH, expectOk, printable, verifyLive } from '../src/freshness.mjs';

/** The live paths that must answer 200 after a deploy. */
export const SMOKE_PATHS = ['/build-info.json'];

async function main() {
  const built = JSON.parse(await readFile(join(ROOT, DEPLOY_DIR_NAME, MARKER_PATH), 'utf8'));
  const { ok, reasons } = await verifyLive({ markerUrl: `${SITE_URL}${MARKER_PATH}`, built });
  if (!ok) throw new Error(`${SITE_URL} does not serve this build: ${reasons.join('; ')}`);
  for (const path of SMOKE_PATHS) {
    const page = await expectOk({ url: `${SITE_URL}${path}` });
    if (!page.ok) throw new Error(page.reason);
  }
  await verifyCutover(SITE_URL);
  for (const url of ['https://meaninggraph.io/', 'https://meaninggraph.io/registry/models/']) {
    const target = await expectOk({url});
    if (!target.ok) throw new Error(target.reason);
  }
  const line = `Deployed and confirmed: ${SITE_URL} serves commit ${built.commit.slice(0, 12)}.`;
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`::error::${printable(error.message)}`);
    process.exit(1);
  });
}
