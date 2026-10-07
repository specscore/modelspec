import {expect, test} from '@playwright/test';

const endpoint = '**/v1/registry-search';
const hit = (name, kind = 'model_entity') => ({id: 'a'.repeat(64), title: name, kind, identifier: name,
  qualified_name: `chinook.${name}`, parent_label: 'Chinook', canonical_url: 'https://modelspec.org/registry/models/chinook/#entity-Artist'});

test('live search is accessible, bounded to ModelSpec, and leaves browsing available', async ({page}, testInfo) => {
  const bodies = [];
  await page.route(endpoint, async route => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({hits: [hit('Artist')], found: 1, page: 1, generation: 'test'})});
  });
  await page.goto('/registry/');
  const input = page.getByRole('searchbox', {name: 'Name or identifier'});
  await input.fill('Artist');
  await expect(page.locator('.registry-search-results a')).toHaveText('Artist');
  await expect(page.locator('#registry-search-status')).toHaveText('1 published result.');
  expect(bodies.at(-1)).toEqual({q: 'Artist', domain: 'modelspec', page: 1});
  await input.press('ArrowDown');
  await expect(page.locator('.registry-search-results a')).toBeFocused();
  await expect(page.locator('.registry-search-fallback a')).toHaveAttribute('href', '/registry/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
  await page.screenshot({path: `/private/tmp/registry-search-modelspec-${testInfo.project.name}.png`, fullPage: true});
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
    return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({hits: [hit(q)], found: 1, page: 1, generation: 'test'})}).catch(() => {});
  });
  await page.goto('/registry/');
  const input = page.getByRole('searchbox', {name: 'Name or identifier'});
  await input.fill('old');
  await oldRequested;
  await input.fill('new');
  await expect(page.locator('.registry-search-results a')).toHaveText('new');
  releaseOld();
  await expect(page.locator('.registry-search-results a')).toHaveText('new');
  await input.fill('missing');
  await expect(page.locator('#registry-search-status')).toContainText('No published entries match');
  await input.fill('offline');
  await expect(page.locator('#registry-search-status')).toContainText('Search is unavailable');
  await expect(page.locator('.registry-search-fallback a')).toBeVisible();
});
