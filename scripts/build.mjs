#!/usr/bin/env node
// Builds the site into dist/ (production) or another fixed output directory:
// a copy of public/ plus the registry pages generated from the three indexes.
// See README.md for the variables and flags.
//
//   node scripts/build.mjs [--use-fixture [--fixture-set two-databases]] [--allow-local-index] [--out <name>]

import { resolveBuildConfig, ROOT } from '../src/config.mjs';
import { buildSite } from '../src/site.mjs';

async function main() {
  const config = resolveBuildConfig(process.argv.slice(2), process.env);
  if (config.mode !== 'production') {
    console.warn(`WARNING: ${config.mode} build, not made from the three production indexes. It is written to ${config.outName}/ and can not be deployed.`);
  }
  const result = await buildSite({ root: ROOT, config });
  console.log(`Built ${result.pages} pages into ${result.outDir}`);
  console.log(`  models: ${result.models.join(', ') || '(none)'}`);
  console.log(`  mode: ${config.mode}`);
  for (const [name, source] of Object.entries(config.sources)) console.log(`  ${name}: ${source.kind} ${source.location}`);
  console.log(`  MeaningGraph links: ${config.meaningGraphBaseUrl}`);
  console.log(`  OVDB Directory links: ${config.ovdbDirectoryBaseUrl}`);
}

main().catch(error => {
  console.error(`Build failed: ${error.message}`);
  process.exit(1);
});
