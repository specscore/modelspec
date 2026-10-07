#!/usr/bin/env node
// Builds the site into dist/ (production) or another fixed output directory:
// a copy of public/ plus the registry pages generated from the three indexes.
// See README.md for the variables and flags.
//
//   node scripts/build.mjs [--use-fixture [--fixture-set two-databases]] [--allow-local-index] [--out <name>]

import { resolveBuildConfig, ROOT } from '../src/config.mjs';
import { INDEXES, envWithPins } from '../src/index-commits.mjs';
import { buildSite } from '../src/site.mjs';
import { searchUiConfig } from '../src/registry-search-ui.mjs';

async function main() {
  const argv = process.argv.slice(2);
  // Without commits, URLs or a fixture (a build by hand) the current main of each data repository is resolved first.
  const { env, heads } = await envWithPins({ env: process.env, argv });
  if (heads) console.log(`Reading the indexes at the current commits: ${Object.entries(INDEXES).map(([key, { repo }]) => `${repo}@${heads[key].slice(0, 12)}`).join(', ')}.`);
  const config = resolveBuildConfig(argv, env);
  config.searchUi = searchUiConfig(env, { production: config.production, fixture: config.mode === 'fixture' });
  config.requireSearchPins = config.production;
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
