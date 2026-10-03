import { defineConfig } from '@playwright/test';

// Two built sites, each served the way production serves it (Workers Static
// Assets through `wrangler dev --local`, config from wrangler.jsonc), from the
// committed fixtures so the tests need no network:
//   8791  the fixture copies of the real indexes (one Chinook database)
//   8792  the same, with a second database of the Chinook model in the Directory
// The sibling sites are not served: the tests only assert where links point.
export const MODELSPEC_PORT = 8791;
export const TWO_PORT = 8792;
export const MEANINGGRAPH_BASE_URL = 'http://127.0.0.1:4010';
export const DIRECTORY_BASE_URL = 'http://127.0.0.1:4011';

const env = {
  MEANINGGRAPH_BASE_URL,
  OVDB_DIRECTORY_BASE_URL: DIRECTORY_BASE_URL,
  // an empty value counts as unset, so a stray variable in the shell cannot turn the fixture build into an error
  MODELSPEC_REGISTRY_INDEX_URL: '',
  MEANINGGRAPH_REGISTRY_INDEX_URL: '',
  OVDB_DIRECTORY_INDEX_URL: '',
};

const server = (port, inspector, out, extraBuildArgs = '') => ({
  command: `node scripts/build.mjs --use-fixture ${extraBuildArgs} --out ${out} && npx wrangler dev --local --ip 127.0.0.1 --port ${port} --inspector-port ${inspector} --assets ${out}`,
  url: `http://127.0.0.1:${port}/registry/models/chinook/`,
  env,
  reuseExistingServer: false,
  timeout: 120_000,
});

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${MODELSPEC_PORT}` },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'mobile-375', use: { viewport: { width: 375, height: 812 } } },
  ],
  webServer: [
    server(MODELSPEC_PORT, 9291, 'dist-e2e'),
    server(TWO_PORT, 9292, 'dist-e2e-two', '--fixture-set two-databases'),
  ],
});
