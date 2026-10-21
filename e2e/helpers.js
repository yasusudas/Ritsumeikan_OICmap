import { test as base, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { FACILITY_PLACES } from '../src/facility-places.js';

export const searchData = JSON.parse(readFileSync(new URL('../public/manual-search-index.json', import.meta.url)));
export const foodData = JSON.parse(readFileSync(new URL('../public/food-places.json', import.meta.url)));
export const timetableData = JSON.parse(readFileSync(new URL('../public/timetable/data/manifest.json', import.meta.url)));
export const facilities = FACILITY_PLACES;
export const floors = ['1F', '2F', '3F', '4F', '5F', 'A-6-9F', 'H-6-9F'];
export const languages = ['ja', 'en'];
export const publicRoutes = languages.flatMap(lang => ['', 'access/', 'food/', 'timetable/', 'terms/', 'privacy/', 'sources/'].map(slug => `${lang === 'en' ? '/en/' : '/'}${slug}`));
export const routes = [...publicRoutes, '/editor/', '/editor/login/'];
export const mapPath = lang => lang === 'en' ? '/en/' : '/';
export const patterns = {
  entries: /\/assets\/search-entries-[^/]+\.json/,
  rings: /\/assets\/facility-rings-[^/]+\.json/,
  food: /\/assets\/food-places-[^/]+\.json/,
};
export const fixedDate = '2026-10-19T03:00:00.000Z';
export const trucks = {
  date: '2026-10-19', generatedAt: fixedDate, outOfPeriod: false,
  nextUpdateAt: '2026-10-19T03:30:00.000Z',
  period: { from: '2026-09-28', to: '2026-10-31' },
  hours: { start: '11:00', end: '14:00' },
  trucks: [{ kitchenId: 'e2e-truck', name: 'E2E Kitchen', dish: 'ランチ', spot: 'plaza', sourceUrl: 'https://example.org/e2e-kitchen', image: '/lunch-street/kyo-tacos.webp' }],
};
export const apiPayloads = {
  '/api/food-trucks': trucks,
  '/api/coop-hours': {
    generatedAt: fixedDate, nextUpdateAt: '2099-01-01T00:00:00Z',
    source: { url: 'https://example.org/coop' }, months: [],
    stores: [...new Set(foodData.places.flatMap(p => p.services.map(s => s.coopScheduleName)).filter(Boolean))]
      .map(name => ({ name, days: [{ date: '2026-10-19', closed: false, periods: [{ start: '11:00', end: '14:00' }] }] })),
  },
  '/api/holidays': { holidays: [{ date: '2026-11-03', name: '文化の日' }], generatedAt: fixedDate },
  '/api/rail-status': {
    generatedAt: fixedDate, refreshIntervalSeconds: 900,
    sources: [{ id: 'hankyu', railway: '阪急電鉄', status: 'normal', summary: '平常運転', details: [], sourceUrl: 'https://www.hankyu.co.jp/railinfo/' }],
  },
};

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.clock.setFixedTime(new Date(fixedDate));
    await use(page);
  },
  // Isolated browser contexts never use the user's cookies/storage. External services are
  // intercepted so link clicks and contact dialogs cannot send real submissions/analytics.
  guard: [async ({ context, baseURL }, use, testInfo) => {
    const errors = [];
    const responses = [];
    const expected = { console: [], http: [] };
    const origin = new URL(baseURL).origin;
    context.on('page', page => {
      page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
      page.on('console', message => {
        if (message.type() === 'error') errors.push(`console: ${message.text()}`);
      });
      page.on('response', response => {
        if (response.url().startsWith(origin) && response.status() >= 400) responses.push(`${response.status()} ${response.url()}`);
      });
    });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) {
        const type = route.request().resourceType();
        return route.fulfill({ status: 200, contentType: type === 'stylesheet' ? 'text/css' : type === 'script' ? 'application/javascript' : 'text/html', body: type === 'document' ? '<!doctype html><title>E2E external destination</title><p>External navigation intercepted by the test.</p>' : '' });
      }
      if (apiPayloads[url.pathname]) return route.fulfill({ json: apiPayloads[url.pathname] });
      if (url.pathname.startsWith('/_vercel/')) return route.fulfill({ status: 200, body: '' });
      if (!['GET', 'HEAD'].includes(route.request().method())) {
        errors.push(`Unexpected mutation: ${route.request().method()} ${url.pathname}`);
        return route.abort();
      }
      return route.continue();
    });
    await use(expected);
    const unexpectedErrors = errors.filter(error => !expected.console.some(pattern => pattern.test(error)));
    const unexpectedResponses = responses.filter(error => !expected.http.some(pattern => pattern.test(error)));
    await testInfo.attach('browser-health', { body: JSON.stringify({ errors, responses }, null, 2), contentType: 'application/json' });
    expect.soft(unexpectedErrors, 'Unexpected JavaScript/console errors').toEqual([]);
    expect.soft(unexpectedResponses, 'Unexpected local HTTP failures').toEqual([]);
  }, { auto: true }],
});
export { expect };

export async function goto(page, path) {
  const response = await page.goto(path);
  expect(response?.status(), path).toBe(200);
  await expect(page.locator('h1').first()).toBeVisible();
  await expect(page.locator('body')).not.toHaveText('');
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect(page).not.toHaveTitle('');
}

export async function readyMap(page, lang = 'ja') {
  await goto(page, mapPath(lang));
  await expect(page.locator('.food-pin')).toHaveCount(foodData.places.length);
  await expect.poll(() => page.locator('#canvas-layer img.floor-svg').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
}

export async function chooseFloor(page, floor) {
  const desktop = page.locator(`.floor-tab[data-floor="${floor}"]`);
  if (await desktop.isVisible()) await desktop.click();
  else {
    await page.locator('[data-mobile-floor-toggle]').click();
    await page.locator(`[data-mobile-floor-option][data-floor="${floor}"]`).click();
    await expect(page.locator('[data-mobile-floor-toggle]')).toHaveAttribute('aria-expanded', 'false');
  }
  await expect(desktop).toHaveClass(/is-active/);
  await expect.poll(() => page.locator('#canvas-layer img.floor-svg').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
}

export async function facilityButton(page, key) {
  const button = page.locator(`.search-icon-button[data-facility-key="${key}"]`);
  // A closing discrete CSS transition can still have a visible bounding box.
  if (await button.evaluate(node => node.closest('#facility-more-panel')?.hidden === true)) await page.locator('#facility-more-toggle').click();
  return button;
}

export async function openFood(page) {
  if (await page.locator('#facility-more-panel').evaluate(node => node.hidden)) await page.locator('#facility-more-toggle').click();
  await page.locator('.food-action-button').click();
  await expect(page.locator('.food-store-row')).toHaveCount(foodData.places.length);
}

export async function selectEntry(page, entry, lang = 'ja', query = entry.label) {
  await page.locator('#search-input').fill(query);
  const result = page.locator(`.search-result[data-entry-id="${entry.id}"]`);
  await expect(result, `Search ${query} must contain ${entry.id}`).toBeVisible();
  await result.click();
  await expect(page.locator('#search-input')).toHaveValue(lang === 'en' ? entry.labelEn || entry.label : entry.label);
  await expect(page.locator('#search-results')).toBeHidden();
  await expect(page.locator(`.floor-tab[data-floor="${entry.floorId}"]`)).toHaveClass(/is-active/);
  await expect.poll(() => new URL(page.url()).hash).not.toBe('');
  if ([...foodData.places, ...facilities].some(place => place.entryId === entry.id)) {
    await expect(page.locator('.food-card-brand')).toHaveAttribute('data-food-place', entry.id);
    await expect(page.locator('.food-area.is-selected').first()).toBeAttached();
  } else if (entry.outlines?.length) {
    await expect(page.locator('.search-highlight-area-outline')).toHaveCount(entry.outlines.length);
    for (let i = 0; i < entry.outlines.length; i++) {
      const points = await page.locator('.search-highlight-area-outline').nth(i).getAttribute('points');
      const actual = points.trim().split(/[\s,]+/).map(Number);
      const expected = entry.outlines[i].flatMap(p => [p.xRatio * 1000, p.yRatio * 1000]);
      expect(actual.length).toBe(expected.length);
      actual.forEach((value, index) => expect(value, `${entry.id} outline coordinate ${index}`).toBeCloseTo(expected[index], 3));
    }
  } else {
    await expect(page.locator('.search-highlight-pin')).toHaveCount(entry.rects.length);
    for (let i = 0; i < entry.rects.length; i++) {
      const rect = entry.rects[i];
      const point = await page.locator('.search-highlight-pin').nth(i).evaluate(pin => ({ x: parseFloat(pin.style.left), y: parseFloat(pin.style.top) }));
      expect(point.x).toBeCloseTo((rect.xRatio + rect.widthRatio / 2) * 100, 3);
      expect(point.y).toBeCloseTo(Math.max(0, Math.min(1, rect.yRatio + rect.heightRatio / 2 - .01)) * 100, 3);
    }
  }
}

export async function noOverflow(page, soft = false) {
  // Wait for font loading and the responsive layout's requestAnimationFrame to settle.
  await page.evaluate(() => document.fonts.ready);
  await expect.configure({ soft }).poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth), {
    message: `${new URL(page.url()).pathname} horizontal overflow in pixels`, timeout: 3000,
  }).toBeLessThanOrEqual(1);
}

export async function layoutEvidence(page) {
  const layout = await page.evaluate(() => ({
    width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
    overflowing: [...document.querySelectorAll('main *, .site-header *')].filter(element => {
      const r = element.getBoundingClientRect();
      return r.width > 0 && r.right > innerWidth + 1 && getComputedStyle(element).position !== 'fixed';
    }).slice(0, 12).map(element => ({ tag: element.tagName, class: element.className, right: element.getBoundingClientRect().right })),
  }));
  return layout;
}

export async function withinViewport(locator) {
  await expect(locator).toBeVisible();
  await expect.poll(() => locator.evaluate(element => {
    const r = element.getBoundingClientRect();
    return r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
  }), { message: 'Control/panel must fit inside the viewport' }).toBe(true);
}

export async function screenshot(page, testInfo, label) {
  await testInfo.attach(label, { body: await page.screenshot({ fullPage: false }), contentType: 'image/png' });
}

export async function openMenu(page) {
  const toggle = page.locator('.site-menu-toggle');
  await toggle.click();
  await expect(page.locator('.site-menu-panel')).toBeVisible();
}

export async function clickExternal(page, locator) {
  const href = await locator.getAttribute('href');
  expect(href).toMatch(/^https?:\/\//);
  await expect(locator).toHaveAttribute('rel', /noopener/);
  const popupPromise = page.waitForEvent('popup');
  await locator.click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  expect(popup.url()).toBe(new URL(href).href);
  await expect(popup).toHaveTitle('E2E external destination');
  await popup.close();
}
