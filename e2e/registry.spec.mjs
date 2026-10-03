import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { DIRECTORY_BASE_URL, MEANINGGRAPH_BASE_URL } from '../playwright.config.mjs';

// Expected values come from the fixtures the site was built from, not from the test.
const fixture = name => JSON.parse(readFileSync(new URL(`../fixtures/${name}.fixture.json`, import.meta.url), 'utf8'));
const model = fixture('modelspec-registry-index').models.find(m => m.id === 'chinook');
const graph = fixture('meaninggraph-registry-index').graphs.find(g => g.id === 'chinook');
const database = fixture('ovdb-directory-index').databases.find(d => d.id === 'chinook');
const propertyCount = model.entities.reduce((n, e) => n + e.properties.length, 0);

const MODEL_PAGE = '/registry/models/chinook/';
const HIGHLIGHT = 'rgb(255, 246, 201)';

const noHorizontalScroll = async page => {
  const [scrollWidth, innerWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
};

/** On a phone the navigation sits behind the menu button. */
const openNav = async page => {
  const toggle = page.locator('#navToggle');
  if (await toggle.isVisible()) await toggle.click();
};

test('landing, Registry in the header, the registry, the Chinook model page', async ({ page }) => {
  await page.goto('/');
  await openNav(page);
  await page.locator('.site-nav').getByRole('link', { name: 'Registry' }).click();
  await expect(page).toHaveURL(/\/registry\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('The ModelSpec registry');
  await expect(page.locator('.reg-draft')).toContainText('The registry is new');
  await expect(page.locator('.reg-draft').getByRole('link', { name: 'github.com/modelspec-org/registry' })).toHaveAttribute('href', 'https://github.com/modelspec-org/registry');
  const card = page.locator('.reg-model');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText(model.address);
  await expect(card).toContainText(`${model.entities.length} entities, ${propertyCount} properties`);
  await card.getByRole('link', { name: model.title }).click();
  await expect(page).toHaveURL(new RegExp(`${MODEL_PAGE}$`));
  await expect(page.getByRole('heading', { level: 1 })).toContainText(model.title);
  await noHorizontalScroll(page);
});

test('the footer also links the Registry, and the registry page marks it current', async ({ page }) => {
  await page.goto('/');
  await page.locator('.site-foot nav').getByRole('link', { name: 'Registry' }).click();
  await expect(page).toHaveURL(/\/registry\/$/);
  await expect(page.locator('.site-foot nav a[aria-current="page"]')).toHaveText('Registry');
  await noHorizontalScroll(page);
});

test('the model page shows identity, provenance, licence and the model files at the pinned commit', async ({ page }) => {
  await page.goto(MODEL_PAGE);
  const facts = page.locator('.reg-facts');
  await expect(facts.locator('.reg-address')).toHaveText(model.address);
  await expect(facts.locator('.reg-repo')).toHaveAttribute('href', model.repository);
  await expect(facts.locator('.reg-commit')).toHaveAttribute('href', `${model.repository}/commit/${model.commit}`);
  await expect(facts.locator('.reg-commit')).toHaveText(model.commit);
  const files = facts.locator('.reg-file');
  await expect(files).toHaveCount(2);
  await expect(files.nth(0)).toHaveAttribute('href', `${model.repository}/blob/${model.commit}/${model.files.source}`);
  await expect(files.nth(1)).toHaveAttribute('href', `${model.repository}/blob/${model.commit}/${model.files.json}`);
  await expect(facts).toContainText(model.licence);
  await expect(facts).toContainText(model.status);
  await expect(page.locator('.reg-layers-line')).toContainText('Where it is, what shape it has, what it means.');
  await noHorizontalScroll(page);
});

test('every entity and property of the model is on the page', async ({ page }) => {
  await page.goto(MODEL_PAGE);
  await expect(page.locator('.reg-entity')).toHaveCount(model.entities.length);
  await expect(page.locator('.reg-props tbody tr')).toHaveCount(propertyCount);
  const customer = model.entities.find(e => e.name === 'Customer');
  const country = customer.properties.find(p => p.name === 'Country');
  const row = page.locator('#property-Customer-Country');
  await expect(row).toContainText(country.type);
  await expect(page.locator('#entity-Customer .reg-entity-key')).toContainText(customer.key.join(', '));
  await expect(page.locator('#property-Customer-CustomerId .reg-pill--key')).toHaveText('key');
  await noHorizontalScroll(page);
});

test('a link to a property opens on its row, highlighted', async ({ page }) => {
  await page.goto(`${MODEL_PAGE}#property-Customer-Country`);
  const row = page.locator('#property-Customer-Country');
  await expect(row).toBeInViewport({ ratio: 1 });
  await expect(row.locator('th')).toHaveCSS('background-color', HIGHLIGHT);
  expect((await row.boundingBox()).y).toBeGreaterThanOrEqual(0);
});

test('a link to an entity opens on that entity', async ({ page }) => {
  await page.goto(`${MODEL_PAGE}#entity-Album`);
  const entity = page.locator('#entity-Album');
  await expect(entity).toBeInViewport({ ratio: 0.5 });
  await expect(entity).toHaveCSS('border-top-color', 'rgb(194, 116, 26)');
});

test('a reference property links to the entity it references', async ({ page }) => {
  await page.goto(`${MODEL_PAGE}#property-Album-ArtistId`);
  const row = page.locator('#property-Album-ArtistId');
  // the page scrolls smoothly to the anchor: let it settle before clicking inside it
  await expect(row).toBeInViewport({ ratio: 1 });
  const link = row.getByRole('link', { name: 'Artist', exact: true });
  await expect(link).toHaveAttribute('href', '#entity-Artist');
  await link.click();
  await expect(page).toHaveURL(/#entity-Artist$/);
  await expect(page.locator('#entity-Artist')).toBeInViewport({ ratio: 0.5 });
});

test('the entity chips jump to their entity', async ({ page }) => {
  await page.goto(MODEL_PAGE);
  await page.locator('.reg-entity-index').getByRole('link', { name: 'PlaylistTrack' }).click();
  await expect(page).toHaveURL(/#entity-PlaylistTrack$/);
  await expect(page.locator('#entity-PlaylistTrack')).toBeInViewport({ ratio: 0.5 });
});

test('Meaning graphs for this model: the Chinook graph, linked to MeaningGraph', async ({ page }) => {
  await page.goto(MODEL_PAGE);
  const section = page.locator('#meaning-graphs');
  await expect(section.getByRole('heading', { level: 2 })).toContainText('Meaning graphs for this model');
  const rows = section.locator('.reg-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.locator('.reg-graph-link')).toHaveText(graph.title);
  await expect(rows.locator('.reg-graph-link')).toHaveAttribute('href', `${MEANINGGRAPH_BASE_URL}/graphs/chinook/`);
  await expect(section).not.toContainText('Core');
});

test('Databases using this model: the Chinook database, with canonical URL, publisher and status', async ({ page }) => {
  await page.goto(MODEL_PAGE);
  const section = page.locator('#databases');
  await expect(section.getByRole('heading', { level: 2 })).toContainText('Databases using this model');
  const rows = section.locator('.reg-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.locator('.reg-database-link')).toHaveText(database.title);
  await expect(rows.locator('.reg-database-link')).toHaveAttribute('href', `${DIRECTORY_BASE_URL}/databases/chinook/`);
  await expect(rows.locator('.reg-canonical')).toHaveText(database.url);
  await expect(rows.locator('.reg-publisher')).toHaveText('datatug/chinookdb');
  await expect(rows.locator('.reg-publisher')).toHaveAttribute('href', database.repository);
  await expect(rows.locator('.reg-pill--status')).toHaveText(database.status);
  await noHorizontalScroll(page);
});

test('the landing page: the new section with its three links, the Chinook sentence and the three reasons', async ({ page }) => {
  await page.goto('/');
  const layers = page.locator('#layers');
  await layers.scrollIntoViewIfNeeded();
  await expect(layers.getByRole('heading', { level: 2 })).toHaveText('Where it is, what shape it has, what it means.');
  await expect(layers.locator('.layers-grid h3')).toHaveText(['ModelSpec', 'OVDB Directory', 'MeaningGraph']);
  await expect(layers.getByRole('link', { name: 'directory.openvaultdb.com' })).toHaveAttribute('href', DIRECTORY_BASE_URL);
  await expect(layers.getByRole('link', { name: 'meaninggraph.io' })).toHaveAttribute('href', MEANINGGRAPH_BASE_URL);
  const note = layers.locator('.layers-note');
  await expect(note).toContainText('Chinook is in all three');
  await expect(note.getByRole('link', { name: 'listed in the OVDB Directory' })).toHaveAttribute('href', `${DIRECTORY_BASE_URL}/databases/chinook/`);
  await expect(note.getByRole('link', { name: 'modelled in ModelSpec' })).toHaveAttribute('href', MODEL_PAGE);
  await expect(note.getByRole('link', { name: 'explained in MeaningGraph' })).toHaveAttribute('href', `${MEANINGGRAPH_BASE_URL}/graphs/chinook/`);
  await expect(layers.locator('.layers-why li strong')).toHaveText(['Start from a published model.', 'Recognise the same data in different places.', 'Run many databases of one model.']);
  // nothing in the new section reaches past the viewport (the hero above it already does on a phone, as before)
  const overflow = await layers.evaluate(el => [...el.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > window.innerWidth + 0.5).length);
  expect(overflow).toBe(0);
});

test('the landing section opens the Chinook model page', async ({ page }) => {
  await page.goto('/');
  await page.locator('#layers .layers-note').getByRole('link', { name: 'modelled in ModelSpec' }).click();
  await expect(page).toHaveURL(new RegExp(`${MODEL_PAGE}$`));
  await expect(page.locator('#entities')).toBeVisible();
});

test('every page of a fixture build carries the banner at the very top and the source meta tag', async ({ page }) => {
  for (const path of ['/', '/registry/', MODEL_PAGE]) {
    await page.goto(path);
    const banner = page.locator('.build-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Fixture build');
    expect(await page.evaluate(() => document.body.firstElementChild.className)).toBe('build-banner');
    expect((await banner.boundingBox()).y).toBe(0);
    await expect(page.locator('meta[name="modelspec-build-source"]')).toHaveAttribute('content', 'fixture');
  }
});

test('build-info.json marks the build as a non-production fixture build', async ({ request }) => {
  const info = await (await request.get('/build-info.json')).json();
  expect(info.production).toBe(false);
  expect(info.fixture).toBe(true);
  expect(info.outDir).toBe('dist-e2e');
  expect(info.models.map(m => m.id)).toEqual(['chinook']);
});

test('the marker file of the build is not served', async ({ request }) => {
  expect((await request.get('/.modelspec-build-output')).status()).toBe(404);
});

test('unknown models are not found', async ({ request }) => {
  expect((await request.get('/registry/models/nope/')).status()).toBe(404);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the registry pages are static HTML', async ({ page }) => {
    await page.goto('/registry/');
    await expect(page.locator('.reg-model h3 a')).toHaveAttribute('href', MODEL_PAGE);
    await page.goto(`${MODEL_PAGE}#property-Customer-Country`);
    await expect(page.locator('#property-Customer-Country')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('#meaning-graphs .reg-graph-link')).toHaveAttribute('href', `${MEANINGGRAPH_BASE_URL}/graphs/chinook/`);
    await expect(page.locator('#databases .reg-database-link')).toHaveAttribute('href', `${DIRECTORY_BASE_URL}/databases/chinook/`);
    await expect(page.locator('.reg-crumbs').getByRole('link', { name: 'Registry' })).toHaveAttribute('href', '/registry/');
    await noHorizontalScroll(page);
  });
});
