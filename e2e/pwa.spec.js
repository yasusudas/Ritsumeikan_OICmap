import { test, expect, goto, readyMap, chooseFloor, selectEntry, searchData, floors, facilityButton, openFood, screenshot } from './helpers.js';

async function goOffline(context, baseURL, browserName) {
  // WebKit's network override rejects navigation before a SW can answer.
  // Closing this context's server connections tests a genuine failed fetch.
  if (browserName === 'webkit') await context.addCookies([{ name: '__oic_e2e_offline', value: '1', url: baseURL }]);
  else await context.setOffline(true);
}

async function restoreNetwork(context) {
  await context.clearCookies({ name: '__oic_e2e_offline' });
  await context.setOffline(false);
}

test.describe('PWA', () => {
  test.use({ serviceWorkers: 'allow' });
  for (const firstLanguage of ['ja', 'en']) {
    test(`first visit ${firstLanguage} saves unseen floors and both languages for offline restart`, async ({ page, context, request, baseURL, browserName, guard }, testInfo) => {
      test.setTimeout(90_000);
      const manifest = await (await request.get('/manifest.webmanifest')).json();
      expect(manifest.display).toBe('standalone');
      for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
      // No warming reload, no visiting other floors, no manual search before saving.
      await readyMap(page, firstLanguage);
      await page.evaluate(() => navigator.serviceWorker.ready);
      await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
      await expect(page.locator('#offline-map-status')).toHaveAttribute('data-offline-state', 'ready');
      const cached = await page.evaluate(async () => {
        const name = (await caches.keys()).find(name => name.startsWith('rits-oic-map-static-v25-'));
        return (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname);
      });
      expect(cached).toEqual(expect.arrayContaining(['/index.html', '/en/index.html']));
      expect(cached.filter(url => /\.svg$/.test(url) && url.startsWith('/assets/')).length).toBeGreaterThanOrEqual(18);
      expect(cached.some(url => /search-entries.*\.json/.test(url))).toBe(true);
      expect(cached.some(url => /facility-rings.*\.json/.test(url))).toBe(true);
      expect(cached.some(url => /food-places.*\.json/.test(url))).toBe(true);
      expect(cached.some(url => /\/api\/|\/editor\/|DS_Store/.test(url))).toBe(false);
      await goOffline(context, baseURL, browserName);
      // The deliberately closed connection also rejects live API requests.
      if (browserName === 'webkit') guard.console.push(/^console: Failed to load resource: The network connection was lost\.$/);
      try {
        // Reopen the app offline; HTTP cache alone cannot provide unseen floors.
        await page.close();
        const offlinePage = await context.newPage();
        await goto(offlinePage, firstLanguage === 'en' ? '/en/?source=pwa' : '/?source=pwa');
        for (const lang of ['ja', 'en']) {
          await goto(offlinePage, lang === 'en' ? '/en/?source=offline' : '/?source=offline');
          for (const floor of floors) await chooseFloor(offlinePage, floor);
          const entry = searchData.entries.find(entry => entry.floorId === 'H-6-9F' && entry.outlines?.length);
          await selectEntry(offlinePage, entry, lang);
          await offlinePage.reload();
          await expect(offlinePage.locator('.search-highlight-area')).toBeAttached();
          await chooseFloor(offlinePage, '1F');
          await (await facilityButton(offlinePage, 'toilet')).click();
          await expect(offlinePage.locator('.facility-ring:not([data-registration-copy])')).toHaveCount(searchData.facilityRings.filter(ring => ring.floorId === '1F' && ring.facilityKey === 'toilet').length);
          await (await facilityButton(offlinePage, 'printer')).click();
          await expect.poll(() => offlinePage.locator('#canvas-layer img.floor-svg').getAttribute('src')).toMatch(/print-station/);
          await chooseFloor(offlinePage, '1F');
          await openFood(offlinePage);
          await expect(offlinePage.locator('.food-store-row img').first()).toBeVisible();
          await screenshot(offlinePage, testInfo, `offline-${lang}-${firstLanguage}`);
        }
        guard.http.push(/503 .*\/timetable\//);
        guard.console.push(/^console: Failed to load resource: the server responded with a status of 503 /);
        const unavailable = await offlinePage.goto('/timetable/');
        expect(unavailable.status()).toBe(503);
        await expect(offlinePage.locator('h1')).toHaveText('オンライン接続が必要です');
        await offlinePage.getByRole('link', { name: '地図を開く' }).click();
        await expect(offlinePage.locator('#search-input')).toBeVisible();
      } finally { await restoreNetwork(context); }
    });
  }

  test('background saving starts after idle, and interaction postpones it without blocking map controls', async ({ page }) => {
    let releaseMap;
    const initialMap = new Promise(resolve => { releaseMap = resolve; });
    let blocked = false;
    await page.route('**/assets/*.svg', async route => {
      if (!blocked) { blocked = true; await initialMap; }
      await route.fallback();
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#offline-map-status')).toHaveAttribute('data-offline-state', 'pending');
    await page.waitForTimeout(3500);
    expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(items => items.length))).toBe(0);
    releaseMap();
    await expect.poll(() => page.locator('#canvas-layer img.floor-svg').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    await chooseFloor(page, '2F');
    await page.waitForTimeout(2200);
    expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(items => items.length))).toBe(0);
    await expect(page.locator('.floor-tab[data-floor="2F"]')).toHaveClass(/is-active/);
    await expect(page.locator('#offline-map-status')).toHaveAttribute('data-offline-state', 'ready', { timeout: 30_000 });
  });
});
