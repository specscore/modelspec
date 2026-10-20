import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ORIGIN = 'https://modelspec.test';
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist-e2e');
const GOOGLE = /googletagmanager\.com|google-analytics\.com|analytics\.google\.com/;
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json' };
const KEY = 'modelspec.analytics-consent.v1';

// Serves the build at ORIGIN, stubs gtag.js, blocks everything else (fonts included)
// and records every request URL the page makes.
async function boot(page) {
  const seen = [];
  page.on('request', r => seen.push(r.url()));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'www.googletagmanager.com' && url.pathname === '/gtag/js') {
      return route.fulfill({ contentType: 'text/javascript', body: '/* stub gtag.js */' });
    }
    if (url.origin !== ORIGIN) return route.abort();
    let file = path.join(DIST, url.pathname);
    if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({ contentType: TYPES[path.extname(file)] || 'text/plain', body: readFileSync(file) });
  });
  return seen;
}

const googleHits = seen => seen.filter(u => GOOGLE.test(u));
const banner = page => page.getByRole('region', { name: 'Analytics choice' });
const layer = page => page.evaluate(() => (window.dataLayer || []).map(a => Array.from(a)));
const PAGES = ['/', '/registry/', '/registry/models/chinook/', '/privacy/'];

for (const p of PAGES) {
  test(`${p}: banner and footer button are present; no Google request and no _ga cookie before consent`, async ({ page }) => {
    const seen = await boot(page);
    await page.goto(`${ORIGIN}${p}`);
    await expect(banner(page)).toBeVisible();
    await expect(page.locator('.site-foot').getByRole('button', { name: 'Analytics choices' })).toBeVisible();
    await expect(page.locator('.site-foot').getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy/');
    await page.waitForTimeout(400);
    expect(googleHits(seen)).toEqual([]);
    expect(await page.evaluate(() => document.cookie)).not.toContain('_ga');
    expect(await page.evaluate(() => window.dataLayer)).toBeUndefined();
  });
}

test('Reject: no Google request now or after reload, choice persists', async ({ page }) => {
  const seen = await boot(page);
  await page.goto(`${ORIGIN}/`);
  await banner(page).getByRole('button', { name: 'Reject' }).click();
  await expect(banner(page)).toHaveCount(0);
  await page.reload();
  await expect(banner(page)).toHaveCount(0);
  await page.waitForTimeout(400);
  expect(googleHits(seen)).toEqual([]);
  expect(await page.evaluate(() => document.cookie)).not.toContain('_ga');
  expect(await page.evaluate(k => localStorage.getItem(k), KEY)).toBe('denied');
});

test('Accept: gtag.js for G-1F96L8YS39 requested once; withdrawal removes _ga cookies', async ({ page }) => {
  const seen = await boot(page);
  await page.goto(`${ORIGIN}/`);
  await banner(page).getByRole('button', { name: 'Accept analytics' }).click();
  await expect.poll(() => googleHits(seen)).toEqual(['https://www.googletagmanager.com/gtag/js?id=G-1F96L8YS39']);
  const cfg = (await layer(page)).find(a => a[0] === 'config');
  expect(cfg).toEqual(['config', 'G-1F96L8YS39', {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    page_location: `${ORIGIN}/`,
  }]);

  // The stub sets no cookies, so plant the ones gtag.js would set.
  await page.evaluate(() => {
    document.cookie = '_ga=GA1.1.1.1; path=/';
    document.cookie = '_ga_1F96L8YS39=GS2.1.x; path=/';
    document.cookie = 'keep=1; path=/';
  });
  await page.locator('.site-foot').getByRole('button', { name: 'Analytics choices' }).click();
  await banner(page).getByRole('button', { name: 'Reject' }).click();
  const cookies = await page.evaluate(() => document.cookie);
  expect(cookies).not.toContain('_ga');
  expect(cookies).toContain('keep=1');
  expect((await layer(page)).at(-1)).toEqual(['consent', 'update', { analytics_storage: 'denied' }]);
  expect(await page.evaluate(() => window['ga-disable-G-1F96L8YS39'])).toBe(true);
});

test('a granted choice loads the tag on the next page; query and fragment are scrubbed in config and set', async ({ page }) => {
  const seen = await boot(page);
  await page.goto(`${ORIGIN}/`);
  await banner(page).getByRole('button', { name: 'Accept analytics' }).click();
  await page.goto(`${ORIGIN}/registry/?secret=1&q=chinook#frag`);
  await expect.poll(() => googleHits(seen).length).toBe(2);
  const calls = await layer(page);
  expect(calls.find(a => a[0] === 'config')[2].page_location).toBe(`${ORIGIN}/registry/`);
  expect(calls.find(a => a[0] === 'set')[1].page_location).toBe(`${ORIGIN}/registry/`);
  const all = JSON.stringify(calls);
  for (const v of ['secret', 'chinook', 'frag']) expect(all).not.toContain(v);
});

test('a choice cleared in another tab is treated as withdrawal', async ({ page }) => {
  await boot(page);
  await page.goto(`${ORIGIN}/`);
  await banner(page).getByRole('button', { name: 'Accept analytics' }).click();
  await page.evaluate(() => { document.cookie = '_ga=GA1.1.1.1; path=/'; });
  await page.evaluate(k => { localStorage.removeItem(k); window.dispatchEvent(new StorageEvent('storage', { key: k })); }, KEY);
  await expect(banner(page)).toBeVisible();
  expect(await page.evaluate(() => document.cookie)).not.toContain('_ga');
});

test('banner is keyboard reachable and fits 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await boot(page);
  await page.goto(`${ORIGIN}/privacy/`);
  await expect(banner(page)).toBeVisible();
  const box = await banner(page).boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

  let reached = '';
  for (let i = 0; i < 60 && reached !== 'Accept analytics'; i++) {
    await page.keyboard.press('Tab');
    reached = await page.evaluate(() => document.activeElement?.textContent?.trim() || '');
  }
  expect(reached).toBe('Accept analytics');
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.textContent?.trim())).toBe('Reject');
  await page.keyboard.press('Enter');
  await expect(banner(page)).toHaveCount(0);
});

test('privacy link lands on the analytics section', async ({ page }) => {
  await boot(page);
  await page.goto(`${ORIGIN}/`);
  await banner(page).getByRole('link', { name: 'Privacy notice' }).click();
  await expect(page).toHaveURL(`${ORIGIN}/privacy/#analytics`);
  await expect(page.locator('#analytics')).toBeVisible();
});

test('privacy page discloses Google Fonts', async ({ page }) => {
  await boot(page);
  await page.goto(`${ORIGIN}/privacy/`);
  const text = await page.locator('main').innerText();
  expect(text).toContain('fonts.googleapis.com');
  expect(text).toContain('fonts.gstatic.com');
});

const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

for (const [w, h] of [[1366, 768], [1280, 800], [390, 844], [320, 640]]) {
  test(`banner covers no primary action at ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await boot(page);
    await page.goto(`${ORIGIN}/registry/`);
    await expect(banner(page)).toBeVisible();
    let b = await banner(page).boundingBox();
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(w);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(w);
    const field = page.locator('#registry-search-query');
    await field.scrollIntoViewIfNeeded();
    const search = await field.boundingBox();
    expect(overlaps(b, search), 'registry search field').toBe(false);
    expect(search.y + search.height, 'search field is above the banner').toBeLessThanOrEqual(b.y);

    await page.goto(`${ORIGIN}/`);
    await expect(banner(page)).toBeVisible();
    const b2 = await banner(page).boundingBox();
    for (const link of await page.locator('.hero-actions').first().getByRole('link').all()) {
      await link.scrollIntoViewIfNeeded();
      const lb = await link.boundingBox();
      expect(overlaps(b2, lb), await link.innerText()).toBe(false);
      expect(lb.y + lb.height).toBeLessThanOrEqual(b2.y);
    }
  });
}

test('keyboard: the banner is a few Tab presses away, and focus returns to the footer control after a choice', async ({ page }) => {
  await boot(page);
  await page.goto(`${ORIGIN}/registry/`);
  await expect(banner(page)).toBeVisible();
  let n = 0;
  let reached = '';
  while (n < 6 && reached !== 'Accept analytics') {
    await page.keyboard.press('Tab');
    n++;
    reached = await page.evaluate(() => document.activeElement?.textContent?.trim() || '');
  }
  expect(reached).toBe('Accept analytics');
  expect(n).toBeLessThanOrEqual(3);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(banner(page)).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.textContent?.trim())).toBe('Analytics choices');
});

test('privacy page says registry search goes to search.openvaultdb.com', async ({ page }) => {
  await boot(page);
  await page.goto(`${ORIGIN}/privacy/`);
  expect(await page.locator('main').innerText()).toContain('search.openvaultdb.com');
});
