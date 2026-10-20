import { defineConfig } from '@playwright/test';

// Self-contained consent tests: the fixture build (dist-e2e) is served from disk
// through request interception on a non-localhost host (analytics is disabled on
// localhost), so no web server, emulator or network is needed.
// Run: npm run e2e:analytics
export default defineConfig({
  testDir: './e2e-analytics',
  globalSetup: './e2e-analytics/build.mjs',
  timeout: 30_000,
  retries: 0,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
});
