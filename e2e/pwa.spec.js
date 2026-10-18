import { test, expect, goto, selectEntry, searchData } from './helpers.js';

test.describe('PWA', () => {
  test.use({ serviceWorkers: 'allow' });
  test('PWA manifest assets, service worker activation and warmed offline map/search', async ({ page, context, request }) => {
    const response = await request.get('/manifest.webmanifest');
    expect(response.status()).toBe(200);
    const manifest = await response.json();
    expect(manifest.display).toBe('standalone');
    for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
    await goto(page, '/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    // Initial modules/data may have loaded before activation; reload under SW control to warm them.
    await page.reload();
    await selectEntry(page, searchData.entries.find(e => e.label === 'AC130'));
    // Verify these requests are actually cached before switching off the network.
    await expect.poll(() => page.evaluate(async () => {
      const keys = (await Promise.all((await caches.keys()).map(async key => (await (await caches.open(key)).keys()).map(r => r.url)))).flat();
      return keys.some(url => /search-entries.*\.json/.test(url)) && keys.some(url => /\/assets\/.*\.svg/.test(url));
    })).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#search-input')).toHaveValue('AC130');
    await expect(page.locator('.search-highlight-area')).toBeAttached();
    await context.setOffline(false);
  });
});
