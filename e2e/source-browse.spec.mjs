import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { validateDirectoryIndex } from '../src/indexes.mjs';
import { DIRECTORY_BASE_URL } from '../playwright.config.mjs';

const fixture = name => JSON.parse(readFileSync(new URL(`../fixtures/${name}.fixture.json`, import.meta.url), 'utf8'));
const directory = fixture('ovdb-directory-index');
const modelRegistry = fixture('modelspec-registry-index');
const sources = validateDirectoryIndex(directory, { allowFixture: true, requireFixture: true }).sources;
const localAssets = new Set(['/', '/registry/', '/registry/sources/', '/script.js', '/style.css', '/registry.css', '/registry-search-ui.css', '/registry-search-ui.js', '/favicon.svg', ...modelRegistry.models.map(model => `/registry/models/${model.id}/`)]);
const forbiddenPayloads = new Set(directory.sources.map(source => source.resource_url).filter(Boolean));
const noOverflow = async page => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

// No provider paths or execution endpoints are admitted. Fonts are fulfilled locally.
test.beforeEach(async ({ page, baseURL }) => {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    expect(forbiddenPayloads.has(url.href), `provider resource requested: ${url.href}`).toBe(false);
    expect(/bigquery.*(?:jobs|queries)/.test(url.href)).toBe(false);
    if (url.origin === new URL(baseURL).origin && localAssets.has(url.pathname) && !url.search) return route.continue();
    if (url.href === 'https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&display=swap') return route.fulfill({ contentType: 'text/css', body: '' });
    // Any Google font CSS URL from the shared shell is metadata-free static styling.
    if (url.origin === 'https://fonts.googleapis.com' && url.pathname === '/css2') return route.fulfill({ contentType: 'text/css', body: '' });
    if (url.origin === DIRECTORY_BASE_URL && url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<html lang="en"><title>Directory</title><h1 id="explore">Explore sources</h1></html>' });
    if (url.origin === DIRECTORY_BASE_URL && sources.some(source => url.pathname === `/sources/${source.id}/`)) {
      const source = sources.find(source => url.pathname === `/sources/${source.id}/`);
      return route.fulfill({ contentType: 'text/html', body: `<html lang="en"><title>Directory metadata</title><h1>${source.id}</h1><p>Inactive source discovery metadata</p></html>` });
    }
    throw new Error(`Unlisted URL/path requested: ${url.href}`);
  });
});

test('homepage and Registry navigate directly to canonical Directory discovery', async ({ page }) => {
  await page.goto('/');
  const toggle = page.locator('#navToggle');
  if (await toggle.isVisible()) await toggle.click();
  await page.locator('.site-nav').getByRole('link', { name: 'OVDB Directory', exact: true }).click();
  await expect(page).toHaveURL(`${DIRECTORY_BASE_URL}/#explore`);
  await page.goBack();
  await page.goto('/registry/');
  await expect(page.locator('a[href="/registry/sources/"]')).toHaveCount(0);
  await page.locator('main').getByRole('link', { name: 'OVDB Directory', exact: true }).first().click();
  await expect(page).toHaveURL(`${DIRECTORY_BASE_URL}/#explore`);
});

test('legacy bookmark is a static migration notice with no catalogue or source controls', async ({ page }) => {
  await page.goto('/registry/sources/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Find sources in the OVDB Directory');
  await expect(page.locator('[data-source-id], [data-source-controls], #source-search')).toHaveCount(0);
  const action = page.getByRole('link', { name: 'Explore sources in the OVDB Directory', exact: true });
  await expect(action).toHaveAttribute('href', `${DIRECTORY_BASE_URL}/#explore`);
  expect(await action.getAttribute('target')).toBeNull();
  await action.focus(); await expect(action).toBeFocused();
  await noOverflow(page);
  await action.click();
  await expect(page).toHaveURL(`${DIRECTORY_BASE_URL}/#explore`);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Find sources in the OVDB Directory');
});

test('model-specific evidence keeps exact related source links and same-tab navigation', async ({ page }) => {
  await page.goto('/registry/models/geonames/');
  const related = sources.filter(source => source.modelId === 'geonames');
  await expect(page.locator('.reg-source-link')).toHaveCount(related.length);
  expect((await page.locator('.reg-source-link').evaluateAll(links => links.map(link => link.getAttribute('href')))).sort()).toEqual(related.map(source => `${DIRECTORY_BASE_URL}/sources/${source.id}/`).sort());
  await expect(page.locator('#databases .reg-database-link')).toHaveCount(0);
  await noOverflow(page);
  const href = await page.locator('.reg-source-link').first().getAttribute('href');
  await page.locator('.reg-source-link').first().click();
  await expect(page).toHaveURL(href);
  await page.goBack();
  await expect(page.locator('.reg-source-link')).toHaveCount(related.length);
});

test('bookmark migration remains usable with JavaScript disabled', async ({ page, baseURL }) => {
  const context = await page.context().browser().newContext({ javaScriptEnabled: false, viewport: page.viewportSize() });
  const staticPage = await context.newPage();
  await staticPage.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  await staticPage.goto(new URL('/registry/sources/', baseURL).href);
  await expect(staticPage.locator('[data-source-id], [data-source-controls]')).toHaveCount(0);
  await expect(staticPage.getByRole('link', { name: 'Explore sources in the OVDB Directory', exact: true })).toHaveAttribute('href', `${DIRECTORY_BASE_URL}/#explore`);
  await noOverflow(staticPage);
  await context.close();
});
