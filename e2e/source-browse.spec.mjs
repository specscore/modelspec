import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { validateDirectoryIndex, validateModelspecIndex, validateMeaningGraphIndex } from '../src/indexes.mjs';
import { extractShell, renderSourcesPage } from '../src/render.mjs';
import { resolveBuildConfig } from '../src/config.mjs';
import { checksumOf } from '../tools/make-fixtures.mjs';
import { DIRECTORY_BASE_URL } from '../playwright.config.mjs';

const fixture = name => JSON.parse(readFileSync(new URL(`../fixtures/${name}.fixture.json`, import.meta.url), 'utf8'));
const directory = fixture('ovdb-directory-index');
const modelRegistry = fixture('modelspec-registry-index');
const graphRegistry = fixture('meaninggraph-registry-index');
const sources = validateDirectoryIndex(directory, { allowFixture: true, requireFixture: true }).sources;
const modelById = new Map(modelRegistry.models.map(model => [model.id, model]));
const localAssets = new Set(['/', '/registry/', '/registry/sources/', '/script.js', '/style.css', '/registry.css', '/favicon.svg', ...modelRegistry.models.map(model => `/registry/models/${model.id}/`)]);
const forbiddenPayloads = new Set(directory.sources.map(source => source.resource_url).filter(Boolean));
const noOverflow = async page => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
const ids = page => page.locator('[data-source-id]:visible').evaluateAll(cards => cards.map(card => card.dataset.sourceId).sort());
const expectedIds = query => sources.filter(source => [source.title, source.id, source.publisher, source.access_mode].join(' ').toLowerCase().includes(query.toLowerCase())).map(source => source.id).sort();

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
    if (url.origin === DIRECTORY_BASE_URL && sources.some(source => url.pathname === `/sources/${source.id}/`)) {
      const source = sources.find(source => url.pathname === `/sources/${source.id}/`);
      return route.fulfill({ contentType: 'text/html', body: `<html lang="en"><title>Directory metadata</title><h1>${source.id}</h1><p>Inactive source discovery metadata</p></html>` });
    }
    throw new Error(`Unlisted URL/path requested: ${url.href}`);
  });
});

test('homepage Sources, Registry count, all source cards and exact metadata-generated actions', async ({ page }) => {
  await page.goto('/');
  const toggle = page.locator('#navToggle');
  if (await toggle.isVisible()) { await toggle.click(); await expect(toggle).toHaveAttribute('aria-expanded', 'true'); }
  await page.locator('.site-nav').getByRole('link', { name: 'Sources', exact: true }).click();
  await expect(page).toHaveURL(/\/registry\/sources\/$/);
  if (await toggle.isVisible()) await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Source discoveries');
  await expect(page.locator('[data-source-id]')).toHaveCount(sources.length);
  expect(await ids(page)).toEqual(sources.map(source => source.id).sort());
  await expect(page.getByRole('link', { name: 'View source in OVDB Directory', exact: true })).toHaveCount(sources.length);
  for (const source of sources) {
    const card = page.locator(`[data-source-id="${source.id}"]`);
    await expect(card.getByRole('heading')).toHaveText(source.title);
    await expect(card).toContainText(source.publisher);
    await expect(card.locator('.reg-pill--status').first()).toHaveText('Inactive');
    const action = card.getByRole('link', { name: 'View source in OVDB Directory', exact: true });
    await expect(action).toHaveAttribute('href', `${DIRECTORY_BASE_URL}/sources/${source.id}/`);
    expect(await action.getAttribute('target')).toBeNull();
    await action.focus(); await expect(action).toBeFocused();
    const model = modelById.get(source.modelId);
    if (model) {
      await expect(card.locator('.reg-source-model')).toHaveAttribute('href', `/registry/models/${model.id}/`);
      await expect(card.locator('.reg-source-model')).toHaveText(model.title);
      await expect(card.locator('.reg-pill--status').last()).toHaveText(model.status);
    } else await expect(card).toContainText('No ModelSpec link declared');
    await expect(card).toContainText(source.access_mode === 'bigquery-native' ? 'BigQuery native access · queries blocked' : 'Proposed access: HTTP through OVDB');
  }
  await noOverflow(page);
  await page.goto('/registry/');
  await page.getByRole('link', { name: `Source discoveries (${sources.length})`, exact: true }).click();
  await expect(page).toHaveURL(/\/registry\/sources\/$/);
  await expect(page.locator('.site-nav a[aria-current="page"]')).toHaveText('Sources');
  await page.getByRole('searchbox', { name: 'Search sources' }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Proposed access', { exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Reset', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('.reg-source-action').first()).toBeFocused();
});

test('search cases generated for every source ID, publishers/access values, unmatched/reset/access filters', async ({ page }) => {
  await page.goto('/registry/sources/');
  const search = page.getByRole('searchbox', { name: 'Search sources' });
  for (const query of [...sources.map(source => source.id), ...new Set(sources.map(source => source.publisher)), ...new Set(sources.map(source => source.access_mode))]) {
    await search.fill(query);
    expect(await ids(page)).toEqual(expectedIds(query));
  }
  await search.fill('no-source-matches-this');
  await expect(page.locator('#source-empty')).toBeVisible();
  await expect(page.locator('#source-result-count')).toHaveText(`0 of ${sources.length} source discoveries`);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.locator('[data-source-id]:visible')).toHaveCount(sources.length);
  for (const access of new Set(sources.map(source => source.access_mode))) {
    await page.getByLabel('Proposed access', { exact: true }).selectOption({ value: access });
    expect(await ids(page)).toEqual(sources.filter(source => source.access_mode === access).map(source => source.id).sort());
  }
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.locator('[data-source-id]:visible')).toHaveCount(sources.length);
  await noOverflow(page);
});

test('same-tab Directory action and Browser Back, explicit model navigation preserves related-only counts', async ({ page }) => {
  await page.goto('/registry/sources/');
  const source = sources.find(source => source.modelId === 'geonames');
  const card = page.locator(`[data-source-id="${source.id}"]`);
  await card.getByRole('link', { name: 'View source in OVDB Directory', exact: true }).click();
  await expect(page).toHaveURL(`${DIRECTORY_BASE_URL}/sources/${source.id}/`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(source.id);
  await page.goBack();
  await card.locator('.reg-source-model').click();
  const related = sources.filter(source => source.modelId === 'geonames');
  await expect(page.locator('.reg-source-link')).toHaveCount(related.length);
  expect((await page.locator('.reg-source-link').evaluateAll(links => links.map(link => link.getAttribute('href')))).sort()).toEqual(related.map(source => `${DIRECTORY_BASE_URL}/sources/${source.id}/`).sort());
  await expect(page.locator('#databases .reg-database-link')).toHaveCount(0);
  await expect(page.locator('#meaning-graphs .reg-graph-link')).toHaveCount(1);
  await noOverflow(page);
});

test('static source page has every action with JavaScript disabled', async ({ page, baseURL }) => {
  await page.context().addInitScript(() => {});
  const response = await page.request.get('/registry/sources/');
  const html = await response.text();
  expect((html.match(/class="reg-source-action"/g) ?? []).length).toBe(sources.length);
  const context = await page.context().browser().newContext({ javaScriptEnabled: false, viewport: page.viewportSize() });
  const staticPage = await context.newPage();
  await staticPage.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  await staticPage.goto(new URL('/registry/sources/', baseURL).href);
  await expect(staticPage.locator('[data-source-id]')).toHaveCount(sources.length);
  await expect(staticPage.getByRole('link', { name: 'View source in OVDB Directory', exact: true })).toHaveCount(sources.length);
  await expect(staticPage.locator('[data-source-controls]')).toBeHidden();
  await noOverflow(staticPage);
  await context.close();
});

test('long/unbroken/Unicode/escaped valid metadata wraps and retains visible keyboard actions', async ({ page }) => {
  const adversarial = structuredClone(directory);
  const long = 'LongUnbrokenMetadata'.repeat(25) + ' 雪 & <script>untrusted</script>';
  adversarial.sources[0].title = long; adversarial.sources[0].publisher = long; adversarial.sources[0].description = long;
  adversarial.sources[0].id = 's'.repeat(80); adversarial.sourcesChecksum = checksumOf(adversarial.sources);
  const data = { directory: validateDirectoryIndex(adversarial, { allowFixture: true, requireFixture: true }), modelspec: validateModelspecIndex(modelRegistry, { allowFixture: true, requireFixture: true }), meaninggraph: validateMeaningGraphIndex(graphRegistry, { allowFixture: true, requireFixture: true }) };
  const shell = extractShell(readFileSync(new URL('../public/index.html', import.meta.url), 'utf8'));
  const html = renderSourcesPage(data, resolveBuildConfig(['--use-fixture'], { OVDB_DIRECTORY_BASE_URL: DIRECTORY_BASE_URL }), shell);
  await page.route('**/registry/sources/', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('/registry/sources/');
  const card = page.locator(`[data-source-id="${'s'.repeat(80)}"]`);
  await expect(card.getByRole('heading')).toHaveText(long);
  await expect(card.locator('script')).toHaveCount(0);
  const action = card.getByRole('link', { name: 'View source in OVDB Directory', exact: true });
  await action.focus(); await expect(action).toBeFocused(); await expect(action).toBeVisible();
  await noOverflow(page);
});
