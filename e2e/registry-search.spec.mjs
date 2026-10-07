import {expect, test} from '@playwright/test';

const endpoint = '**/v1/registry-search';
const hit = (name, kind = 'model_entity') => ({id: 'a'.repeat(64), title: name, kind, identifier: name,
  qualified_name: `chinook.${name}`, parent_label: 'Chinook', origin: 'public_registry',
  field_preview: ['ArtistId', 'Name', 'CreatedAt', 'UpdatedAt'], field_count: 5,
  canonical_url: 'https://modelspec.org/registry/models/chinook/#entity-Artist'});

test('live search is accessible, bounded to ModelSpec, and leaves browsing available', async ({page}, testInfo) => {
  const bodies = [];
  await page.route(endpoint, async route => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({hits: [hit('Artist')], found: 1, page: 1, generation: 'test'})});
  });
  await page.goto('/registry/');
  const input = page.getByRole('searchbox', {name: 'Name or identifier'});
  await input.fill('Artist');
  await expect(page.locator('.registry-result-title')).toHaveText('Artist');
  await expect(page.locator('.registry-result-origin')).toHaveText('Public registry');
  await expect(page.locator('.registry-result-field')).toHaveText(['ArtistId', 'Name', 'CreatedAt', 'UpdatedAt']);
  await expect(page.locator('.registry-result-field-more')).toHaveText('+1');
  await expect(page.locator('.registry-result-kind-icon--entity')).toHaveCount(1);
  await expect(page.locator('.registry-result-link')).toHaveAttribute('href', hit('Artist').canonical_url);
  await expect(page.locator('#registry-search-status')).toHaveText('1 published result.');
  expect(bodies.at(-1)).toEqual({q: 'Artist', domain: 'modelspec', page: 1});
  await input.press('ArrowDown');
  await expect(page.locator('.registry-search-results a')).toBeFocused();
  await expect(page.locator('.registry-search-fallback a')).toHaveAttribute('href', '/registry/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
  const screenshot = testInfo.outputPath('registry-search.png');
  await page.screenshot({path: screenshot, fullPage: true});
  await testInfo.attach('registry search', {path: screenshot, contentType: 'image/png'});
});

test('newer query wins; empty results and outages have distinct messages', async ({page}) => {
  let sawOld;
  const oldRequested = new Promise(resolve => { sawOld = resolve; });
  let releaseOld;
  const oldReleased = new Promise(resolve => { releaseOld = resolve; });
  await page.route(endpoint, async route => {
    const q = route.request().postDataJSON().q;
    if (q === 'old') { sawOld(); await oldReleased; }
    if (q === 'missing') return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({hits: [], found: 0, page: 1, generation: 'test'})});
    if (q === 'offline') return route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify({error: 'unavailable'})});
    if (q === 'field') return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({
      hits: [{...hit('ArtistId', 'model_field'), canonical_url: 'https://modelspec.org/registry/models/chinook/#property-Artist-ArtistId'}], found: 1, page: 1})});
    return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({hits: [hit(q)], found: 1, page: 1, generation: 'test'})}).catch(() => {});
  });
  await page.goto('/registry/');
  const input = page.getByRole('searchbox', {name: 'Name or identifier'});
  await input.fill('old');
  await oldRequested;
  await input.fill('new');
  await expect(page.locator('.registry-result-title')).toHaveText('new');
  releaseOld();
  await expect(page.locator('.registry-result-title')).toHaveText('new');
  await input.fill('missing');
  await expect(page.locator('#registry-search-status')).toContainText('No published entries match');
  await input.fill('offline');
  await expect(page.locator('#registry-search-status')).toContainText('Search is unavailable');
  await expect(page.locator('.registry-search-fallback a')).toBeVisible();
  await input.fill('field');
  await expect(page.locator('.registry-result-kind-icon--field')).toHaveCount(1);
  await expect(page.locator('.registry-result-fields')).toHaveCount(0);
  await expect(page.locator('.registry-result-link')).toHaveAttribute('href', 'https://modelspec.org/registry/models/chinook/#property-Artist-ArtistId');
});
