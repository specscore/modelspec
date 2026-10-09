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
  await expect(page.locator('.results-label')).toHaveText('1 matching published entry');
  expect(await page.locator('.registry-result-link').evaluate(link => getComputedStyle(link).textDecorationLine)).toBe('none');
  await expect(page.locator('.registry-result-origin')).toHaveText('Public registry');
  await expect(page.locator('.registry-result-field')).toHaveText(['ArtistId', 'Name', 'CreatedAt', 'UpdatedAt']);
  await expect(page.locator('.registry-result-field-more')).toHaveText('+1');
  await expect(page.locator('.registry-result-kind-icon--entity')).toHaveCount(1);
  await expect(page.locator('.registry-result-link')).toHaveAttribute('href', hit('Artist').canonical_url);
  await expect(page.locator('#registry-search-status')).toHaveText('1 published result.');
  expect(bodies.at(-1)).toEqual({q: 'Artist', domain: 'modelspec', page: 1});
  await input.press('ArrowDown');
  await expect(page.locator('.registry-search-results a')).toBeFocused();
  expect(await page.locator('.registry-result-link').evaluate(link => getComputedStyle(link).outlineStyle)).not.toBe('none');
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

// The service will hold record types as `model_record` once the site exports them under that name; until then it holds
// `model_entity`. A hit of either kind must look and link the same, and a kind the page does not know is still dropped.
test('a model_record hit renders exactly as a model_entity hit does, and an unknown kind is still dropped', async ({page}) => {
  const rendered = {};
  await page.route(endpoint, async route => {
    const q = route.request().postDataJSON().q;
    const hits = q === 'unknown' ? [hit('Artist', 'model_widget')]
      : [{...hit('Artist', q), canonical_url: q === 'model_record'
        ? 'https://modelspec.org/registry/models/chinook/#record-Artist' : 'https://modelspec.org/registry/models/chinook/#entity-Artist'}];
    await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({hits, found: 1, page: 1, generation: 'test'})});
  });
  await page.goto('/registry/');
  const input = page.getByRole('searchbox', {name: 'Name or identifier'});
  for (const kind of ['model_entity', 'model_record']) {
    await input.fill(kind);
    await expect(page.locator('.registry-result-title')).toHaveText('Artist');
    await expect(page.locator('.registry-result-kind')).toHaveText('Record type');
    await expect(page.locator('.registry-result-kind-icon--entity')).toHaveCount(1);
    await expect(page.locator('.registry-result-link')).toHaveAttribute('href', `https://modelspec.org/registry/models/chinook/#${kind === 'model_record' ? 'record' : 'entity'}-Artist`);
    rendered[kind] = await page.locator('.registry-result-link').innerHTML();
  }
  expect(rendered.model_record).toBe(rendered.model_entity);
  await input.fill('unknown');
  await expect(page.locator('#registry-search-status')).toContainText('Search is unavailable');
  await expect(page.locator('.registry-result-link')).toHaveCount(0);
});

// What the page sends for each filter. The request carries the kind's value, never its label, so the words in the panel can
// change while the service is sent exactly what it has always been sent, and nothing that names the removed collection.
test('the kind filter shows the current words and sends the same request for each kind as before', async ({page}) => {
  const bodies = [];
  await page.route(endpoint, async route => {
    bodies.push(route.request().postData());
    await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({hits: [], found: 0, page: 1, generation: 'test'})});
  });
  await page.goto('/registry/');
  const options = await page.locator('#registry-search-kind option').evaluateAll(list => list.map(option => [option.value, option.textContent]));
  expect(options).toEqual([['', 'All kinds'], ['model', 'Models'], ['model_entity', 'Record types'], ['model_field', 'Fields']]);
  await expect(page.getByRole('searchbox', {name: 'Name or identifier'})).toHaveAttribute('placeholder', 'Search a record type or field…');
  const input = page.getByRole('searchbox', {name: 'Name or identifier'});
  // byte for byte what the page sent before this change: the key order q, domain, page, then kind when one is chosen
  const expected = {'': '{"q":"Artist","domain":"modelspec","page":1}',
    model: '{"q":"Artist","domain":"modelspec","page":1,"kind":"model"}',
    model_entity: '{"q":"Artist","domain":"modelspec","page":1,"kind":"model_entity"}',
    model_field: '{"q":"Artist","domain":"modelspec","page":1,"kind":"model_field"}'};
  for (const [value] of options) {
    await page.locator('#registry-search-kind').selectOption(value);
    bodies.length = 0;
    await input.fill('');
    await input.fill('Artist');
    await expect.poll(() => bodies.length).toBeGreaterThan(0);
    expect(bodies.at(-1), `kind ${JSON.stringify(value)}`).toBe(expected[value]);
  }
  expect(bodies.concat(Object.values(expected)).join('')).not.toContain('model_collection');
});
