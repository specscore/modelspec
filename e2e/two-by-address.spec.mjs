import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ADDRESS_PORT, DIRECTORY_BASE_URL } from '../playwright.config.mjs';

// Journey step 9 once the Directory carries model.address: both databases name
// the model by its address, and the repository and model path are not needed.
const directory = JSON.parse(readFileSync(new URL('../fixtures/ovdb-directory-index.two-by-address.fixture.json', import.meta.url), 'utf8'));
const withAddress = directory.databases.filter(d => d.model?.address);

test.use({ baseURL: `http://127.0.0.1:${ADDRESS_PORT}` });

test('both databases that name model.address are listed, each found by address', async ({ page }) => {
  expect(withAddress.map(d => d.model.address)).toEqual(Array(2).fill('modelspec://github.com/datatug/chinookdb/chinook'));
  await page.goto('/registry/models/chinook/');
  const rows = page.locator('#databases .reg-row');
  await expect(rows).toHaveCount(2);
  for (const database of withAddress) {
    const row = page.locator(`#databases [data-database="${database.id}"]`);
    await expect(row.locator('.reg-database-link')).toHaveAttribute('href', `${DIRECTORY_BASE_URL}/databases/${database.id}/`);
    await expect(row.locator('.reg-canonical')).toHaveText(database.url);
    await expect(row.locator('.reg-mini')).toContainText('model address');
  }
  await expect(page.locator('#databases .reg-mini dd', { hasText: 'repository and model file' })).toHaveCount(0);
});
