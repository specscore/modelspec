#!/usr/bin/env node
// After a deploy: confirms the live site serves the build just made. The live /build-info.json must
// record this build's commit and index checksums (retried for about a minute while the new version
// spreads), and the landing page and /registry/ must answer 200.
//
//   node scripts/smoke-live.mjs

import { appendFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEPLOY_DIR_NAME, ROOT, SITE_URL } from '../src/config.mjs';
import { MARKER_PATH, verifyLive } from '../src/freshness.mjs';

async function main() {
  const built = JSON.parse(await readFile(join(ROOT, DEPLOY_DIR_NAME, MARKER_PATH), 'utf8'));
  const { ok, reasons } = await verifyLive({ markerUrl: `${SITE_URL}${MARKER_PATH}`, built });
  if (!ok) throw new Error(`${SITE_URL} does not serve this build: ${reasons.join('; ')}`);
  for (const path of ['/', '/registry/']) {
    const response = await fetch(`${SITE_URL}${path}`, { signal: AbortSignal.timeout(20_000) });
    if (response.status !== 200) throw new Error(`${SITE_URL}${path} answered HTTP ${response.status}`);
  }
  const line = `Deployed and confirmed: ${SITE_URL} serves commit ${built.commit.slice(0, 12)}.`;
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`::error::${error.message}`);
    process.exit(1);
  });
}
