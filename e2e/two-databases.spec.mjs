import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { DIRECTORY_BASE_URL, TWO_PORT } from '../playwright.config.mjs';

// Journey step 9: a second database of the same model appears beside the first
// with no change to the model.
const directory = JSON.parse(readFileSync(new URL('../fixtures/ovdb-directory-index.two-databases.fixture.json', import.meta.url), 'utf8'));
const [first, second] = directory.databases;

test.use({ baseURL: `http://127.0.0.1:${TWO_PORT}` });

const noHorizontalScroll = async page => {
  const [scrollWidth, innerWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
};

test('both databases that name the Chinook model are listed, each with its own links', async ({ page }) => {
  expect(directory.databases).toHaveLength(2);
  await page.goto('/registry/models/chinook/');
  const section = page.locator('#databases');
  await expect(section.getByRole('heading', { level: 2 })).toContainText('Databases using this model');
  await expect(section.locator('.reg-count')).toHaveText('2');
  const rows = section.locator('.reg-row');
  await expect(rows).toHaveCount(2);

  const one = section.locator(`[data-database="${first.recordId}"]`);
  await expect(one.locator('.reg-database-link')).toHaveAttribute('href', `${DIRECTORY_BASE_URL}${first.directoryPath}`);
  await expect(one.locator('.reg-canonical')).toHaveText(first.url);
  await expect(one.locator('.reg-publisher')).toHaveText('datatug/chinookdb');
  await expect(one).toContainText('repository and model file');

  const two = section.locator(`[data-database="${second.recordId}"]`);
  await expect(two.locator('.reg-database-link')).toHaveAttribute('href', `${DIRECTORY_BASE_URL}${second.directoryPath}`);
  await expect(two.locator('.reg-canonical')).toHaveText(second.url);
  await expect(two.locator('.reg-publisher')).toHaveText('git.example.com/second-host/chinook-hosting');
  await expect(two.locator('.reg-publisher')).toHaveAttribute('href', second.repository);
  await expect(two.locator('.reg-pill--status')).toHaveText(second.status);
  await expect(two).toContainText('model address');

  // the model itself is the same page: one graph, the same entities
  await expect(page.locator('#meaning-graphs .reg-row')).toHaveCount(1);
  await expect(page.locator('.reg-entity')).toHaveCount(11);
  await noHorizontalScroll(page);
});

test('the registry page counts both databases', async ({ page }) => {
  await page.goto('/registry/');
  await expect(page.locator('.reg-model')).toContainText('1 meaning graph, 2 databases');
});
