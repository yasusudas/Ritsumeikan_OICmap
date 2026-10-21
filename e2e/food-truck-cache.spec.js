import { test, expect, trucks, fixedDate, foodData, goto, readyMap, openFood, mapPath } from './helpers.js';

const plaza = foodData.places.find(place => place.todayTrucks === 'plaza');
const terrace = foodData.places.find(place => place.todayTrucks === 'terrace');
const now = Date.parse(fixedDate);
const stale = { ...trucks, generatedAt: new Date(now - 31 * 60_000).toISOString(), nextUpdateAt: new Date(now - 60_000).toISOString() };

async function openSurface(page, lang, surface) {
  if (surface === 'map') {
    await readyMap(page, lang);
    await openFood(page);
    await page.locator(`[data-food-select="${plaza.entryId}"]`).click();
  } else await goto(page, `${mapPath(lang)}food/`);
}

function lead(page, surface, place = plaza) {
  return surface === 'map' ? page.locator('.food-panel [data-food-lead-status]')
    : page.locator(`[data-food-lead-status="${place.entryId}"]`);
}

for (const lang of ['ja', 'en']) for (const surface of ['map', 'food']) {
  test(`TRUCK CACHE current-day stale HTTP200, bounded retries and recovery ${lang} ${surface}`, async ({ page, guard }) => {
    await page.clock.install({ time: new Date(fixedDate) });
    let count = 0, fail = false, payload = stale;
    guard.http.push(/api\/food-trucks/);
    guard.console.push(/^console: Failed to load resource: the server responded with a status of 503/);
    await page.route('**/api/food-trucks', route => {
      count++;
      return fail ? route.fulfill({ status: 503, body: 'unavailable' }) : route.fulfill({ json: payload });
    });
    await openSurface(page, lang, surface);
    const root = page.locator('[data-food-trucks]');
    await expect(root).toContainText('E2E Kitchen');
    await expect(lead(page, surface).locator('.is-within')).toBeVisible();
    if (surface === 'food') await expect(lead(page, surface, terrace).locator('.is-outside')).toBeVisible();
    expect(count).toBe(1);
    // SWR success must not recursively fetch in finally/scheduleHours.
    await page.clock.runFor(59_000);
    expect(count).toBe(1);
    fail = true;
    await page.clock.runFor(2_000);
    await expect.poll(() => count).toBe(2);
    await expect(root).toContainText('E2E Kitchen');
    await expect(lead(page, surface).locator('.is-within')).toBeVisible();
    // Failure cannot preserve stale names/status indefinitely (hard limit + timer tick).
    await page.clock.runFor(4 * 60_000);
    await expect(root).not.toContainText('E2E Kitchen');
    await expect(lead(page, surface).locator('.food-open-state.is-unknown')).toBeVisible();
    expect(count).toBeLessThanOrEqual(6);
    fail = false;
    const freshNow = await page.evaluate(() => Date.now());
    payload = { ...trucks, generatedAt: new Date(freshNow).toISOString(), nextUpdateAt: new Date(freshNow + 30 * 60_000).toISOString() };
    await page.clock.runFor(61_000);
    await expect(root).toContainText('E2E Kitchen');
    await expect(lead(page, surface).locator('.is-within')).toBeVisible();
  });

  for (const state of ['fresh', 'previous-day', 'invalid', 'expired', 'out-of-period', 'error']) {
    test(`TRUCK CACHE ${state} ${lang} ${surface}`, async ({ page, guard }) => {
      const payload = { ...trucks };
      if (state === 'previous-day') payload.date = '2026-10-18';
      if (state === 'invalid') payload.nextUpdateAt = 'invalid';
      if (state === 'expired') Object.assign(payload, { generatedAt: new Date(now - 35 * 60_000).toISOString(), nextUpdateAt: new Date(now - 5 * 60_000).toISOString() });
      if (state === 'out-of-period') Object.assign(payload, { trucks: [], outOfPeriod: true, period: { from: '2026-09-01', to: '2026-09-30' } });
      guard.http.push(/api\/food-trucks/);
      guard.console.push(/^console: Failed to load resource: the server responded with a status of 503/);
      await page.route('**/api/food-trucks', route => state === 'error' ? route.fulfill({ status: 503, body: 'unavailable' }) : route.fulfill({ json: payload }));
      await openSurface(page, lang, surface);
      const root = page.locator('[data-food-trucks]');
      if (state === 'fresh') {
        await expect(root).toContainText('E2E Kitchen');
        await expect(lead(page, surface).locator('.is-within')).toBeVisible();
      } else {
        await expect(root).not.toContainText('E2E Kitchen');
        await expect(lead(page, surface).locator('.food-open-state.is-unknown')).toBeVisible();
        await expect(root).not.toContainText(lang === 'ja' ? '読み込んでいます' : 'Loading');
      }
    });
  }
}
