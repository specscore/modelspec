import { execFileSync } from 'node:child_process';

// Builds the committed fixtures into dist-e2e, the same way playwright.config.mjs does.
export default function globalSetup() {
  execFileSync(process.execPath, ['scripts/build.mjs', '--use-fixture', '--out', 'dist-e2e'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      MEANINGGRAPH_BASE_URL: 'http://127.0.0.1:4010',
      OVDB_DIRECTORY_BASE_URL: 'http://127.0.0.1:4011',
      MODELSPEC_REGISTRY_INDEX_URL: '',
      MEANINGGRAPH_REGISTRY_INDEX_URL: '',
      OVDB_DIRECTORY_INDEX_URL: '',
      REGISTRY_SEARCH_ENDPOINT: 'http://127.0.0.1:8787/v1/registry-search',
      REGISTRY_SEARCH_MODE: 'fixture',
    },
  });
}
