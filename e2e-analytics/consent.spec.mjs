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

// Scrolls a control to the middle of the viewport and reports whether it is what
// sits at its centre point (not the banner).
async function reachable(page, locator) {
  await locator.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  return atCentre(locator);
}

const atCentre = locator => locator.evaluate(el => {
  const r = el.getBoundingClientRect();
  const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return !!top && (top === el || el.contains(top)) && !top.closest('.consent-banner');
});

// Smooth scrolling moves the page after the event that started it, so wait until it stops.
async function scrollY(page) {
  let last = -1;
  for (let i = 0; i < 40; i++) {
    const y = await page.evaluate(() => Math.round(window.scrollY));
    if (y === last) return y;
    last = y;
    await page.waitForTimeout(120);
  }
  return last;
}
const reservedVar = page => page.evaluate(() => document.documentElement.style.getPropertyValue('--consent-banner-h'));
const VIEWPORTS = [[320, 568], [375, 667], [390, 844], [1280, 800], [1366, 768]];
const MODEL = '/registry/models/chinook/';

for (const [w, h] of VIEWPORTS) {
  test(`banner covers no primary control at ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await boot(page);
    await page.goto(`${ORIGIN}/registry/`);
    await expect(banner(page)).toBeVisible();
    const b = await banner(page).boundingBox();
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(w);
    expect(b.height).toBeLessThanOrEqual(h * 0.35 + 1);
    if (w >= 768) expect(b.width).toBeLessThanOrEqual(448 + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(w);
    expect(await reservedVar(page)).toBe(`${Math.ceil(b.height)}px`);
    expect(await reachable(page, page.locator('#registry-search-query')), 'registry search field').toBe(true);
    expect(await reachable(page, page.locator('[data-registry-search] button').first()), 'search button').toBe(true);

    await page.goto(`${ORIGIN}/`);
    await expect(banner(page)).toBeVisible();
    for (const link of await page.locator('.hero-actions').first().getByRole('link').all()) {
      expect(await reachable(page, link), await link.innerText()).toBe(true);
    }
    if (w >= 768) {
      for (const name of ['Registry', 'Why']) {
        expect(await reachable(page, page.locator('.site-nav').getByRole('link', { name, exact: true })), name).toBe(true);
      }
    } else {
      expect(await reachable(page, page.locator('#navToggle')), 'phone menu button').toBe(true);
    }

    for (const path of ['/', '/registry/', MODEL, '/registry/sources/', '/privacy/']) {
      await page.goto(`${ORIGIN}${path}`);
      await expect(banner(page)).toBeVisible();
      // the true bottom of the page, without re-centring anything
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      const foot = page.locator('.site-foot');
      expect(await atCentre(foot.getByRole('link', { name: 'Privacy' })), `${path} footer Privacy`).toBe(true);
      expect(await atCentre(foot.getByRole('button', { name: 'Analytics choices' })), `${path} footer Analytics choices`).toBe(true);
    }
  });

  test(`a first-visit choice does not scroll the page, and space is released at ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await boot(page);
    for (const label of ['Reject', 'Accept analytics']) {
      await page.goto(`${ORIGIN}/`);
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await expect(banner(page)).toBeVisible();
      const before = await scrollY(page);
      await banner(page).getByRole('button', { name: label }).click();
      await expect(banner(page)).toHaveCount(0);
      expect(await scrollY(page)).toBe(before);
      expect(await page.evaluate(() => document.activeElement?.textContent?.trim())).toBe('Analytics choices');
      expect(await reservedVar(page)).toBe('');
      expect(await page.evaluate(() => getComputedStyle(document.body).paddingBottom)).toBe('0px');
      expect(await page.evaluate(() => document.documentElement.classList.contains('has-consent-banner'))).toBe(false);
    }
  });

  test(`Tab never leaves a focused control under the banner at ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await boot(page);
    for (const path of ['/', '/registry/', MODEL, '/registry/sources/', '/privacy/']) {
      await page.goto(`${ORIGIN}${path}`);
      await expect(banner(page)).toBeVisible();
      // every control on the page, until Tab leaves the document
      for (let i = 0; i < 150; i++) {
        await page.keyboard.press('Tab');
        if (i > 0 && await page.evaluate(() => document.activeElement === document.body)) break;
        const state = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body || el.closest('.consent-banner')) return { skip: true };
          const r = el.getBoundingClientRect();
          const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return { skip: false, name: (el.textContent || el.id || el.tagName).trim().slice(0, 30), ok: !!top && !top.closest('.consent-banner') };
        });
        if (!state.skip) expect(state.ok, `${path} tab ${i + 1}: ${state.name}`).toBe(true);
      }
    }
  });
}

// A pointer press must reach click: focus that follows it may not scroll the page.
async function pressNearBanner(page, locator, gap, tap) {
  const pos = await locator.evaluate((el, gap) => {
    el.scrollIntoView({ block: 'end', behavior: 'instant' });
    const bannerTop = document.querySelector('.consent-banner').getBoundingClientRect().top;
    window.scrollBy({ top: el.getBoundingClientRect().bottom - (bannerTop + gap), behavior: 'instant' });
    window.__clicked = false;
    el.addEventListener('click', e => { window.__clicked = true; e.preventDefault(); }, { once: true });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, gap);
  const before = await scrollY(page);
  if (tap) await page.touchscreen.tap(pos.x, pos.y); else await page.mouse.click(pos.x, pos.y);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__clicked), 'click fired').toBe(true);
  expect(await scrollY(page), 'page did not jump').toBe(before);
}

const NEAR_BANNER = [
  ['/', page => page.locator('.hero-actions').first().getByRole('link').first()],
  ['/', page => page.locator('.site-foot').getByRole('button', { name: 'Analytics choices' })],
  ['/registry/', page => page.locator('#registry-search-query')],
  ['/registry/', page => page.locator('[data-registry-search] button').first()],
];

test.describe('mouse click at 1280x800', () => {
  for (const gap of [-4, 6]) {
    test(`controls whose edge is ${gap} px from the banner still receive the click`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await boot(page);
      for (const [path, pick] of NEAR_BANNER) {
        await page.goto(`${ORIGIN}${path}`);
        await expect(banner(page)).toBeVisible();
        await pressNearBanner(page, pick(page), gap, false);
      }
    });
  }
});

test.describe('touch tap at 375x667', () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 667 } });
  for (const gap of [-4, 6]) {
    test(`controls whose edge is ${gap} px from the banner still receive the tap`, async ({ page }) => {
      await boot(page);
      for (const [path, pick] of NEAR_BANNER) {
        await page.goto(`${ORIGIN}${path}`);
        await expect(banner(page)).toBeVisible();
        await pressNearBanner(page, pick(page), gap, true);
      }
    });
  }
});

for (const [w, h] of [[320, 568], [375, 667]]) {
  test(`the open phone menu stays above the banner and every link is hittable at ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await boot(page);
    await page.goto(`${ORIGIN}/`);
    await expect(banner(page)).toBeVisible();
    // The fixture build puts a notice above the header and production has none; the
    // menu is positioned against the header, so drop the notice to get the production geometry.
    await page.evaluate(() => document.querySelector('.build-banner')?.remove());
    await page.locator('#navToggle').click();
    const nav = page.locator('#siteNav');
    await expect(nav).toHaveClass(/open/);
    const bannerTop = (await banner(page).boundingBox()).y;
    const navBox = await nav.boundingBox();
    expect(navBox.y + navBox.height).toBeLessThanOrEqual(bannerTop);
    for (const link of await nav.getByRole('link').all()) {
      await link.scrollIntoViewIfNeeded();
      expect(await atCentre(link), await link.innerText()).toBe(true);
    }
  });
}

test('reserved space returns when the banner is reopened and follows a resize', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await boot(page);
  await page.goto(`${ORIGIN}/`);
  await banner(page).getByRole('button', { name: 'Reject' }).click();
  expect(await reservedVar(page)).toBe('');
  await page.locator('.site-foot').getByRole('button', { name: 'Analytics choices' }).click();
  await expect(banner(page)).toBeVisible();
  const wide = await reservedVar(page);
  expect(wide).toBe(`${Math.ceil((await banner(page).boundingBox()).height)}px`);
  expect(await page.evaluate(() => getComputedStyle(document.body).paddingBottom)).not.toBe('0px');
  await page.setViewportSize({ width: 320, height: 568 });
  await expect.poll(() => reservedVar(page)).not.toBe(wide);
  expect(await reservedVar(page)).toBe(`${Math.ceil((await banner(page).boundingBox()).height)}px`);
});

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
