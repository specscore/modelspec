#!/usr/bin/env node
// After a deploy: confirms the live site serves the build just made. The live /build-info.json must
// record this build's commit, index commits and index checksums, and the landing page and /registry/ must answer 200; each is
// retried with growing waits (about two and a half minutes in all) while the new version spreads, then fails.
//
//   node scripts/smoke-live.mjs

import { appendFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEPLOY_DIR_NAME, ROOT, SITE_URL } from '../src/config.mjs';
import { MARKER_PATH, expectOk, printable, verifyLive } from '../src/freshness.mjs';

async function main() {
  const built = JSON.parse(await readFile(join(ROOT, DEPLOY_DIR_NAME, MARKER_PATH), 'utf8'));
  const { ok, reasons } = await verifyLive({ markerUrl: `${SITE_URL}${MARKER_PATH}`, built });
  if (!ok) throw new Error(`${SITE_URL} does not serve this build: ${reasons.join('; ')}`);
  for (const path of ['/', '/registry/', '/registry/sources/']) {
    const page = await expectOk({ url: `${SITE_URL}${path}` });
    if (!page.ok) throw new Error(page.reason);
  }
  const response = await fetch(`${SITE_URL}/registry/sources/`, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error('Source discoveries page cannot be read');
  const html = await response.text();
  const ids = [...html.matchAll(/data-source-id="([^"]+)"/g)].map(match => match[1]);
  const expected = built.sourceDiscoveries.map(source => source.id);
  if (JSON.stringify(ids.sort()) !== JSON.stringify(expected.sort())) throw new Error('Live source discovery IDs differ from the build');
  const actions = [...html.matchAll(/class="reg-source-action" href="([^"]+)"/g)].map(match => match[1]).sort();
  const destinations = expected.map(id => `${built.ovdbDirectoryBaseUrl}/sources/${id}/`).sort();
  if (JSON.stringify(actions) !== JSON.stringify(destinations)) throw new Error('Live source discovery actions differ from the build');
  if (!html.includes(built.checksums.ovdbDirectorySources ?? 'No source discoveries in this index')) throw new Error('Source provenance is missing');
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
