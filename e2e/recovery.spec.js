import { test, expect, patterns, trucks, goto, readyMap, foodData, facilityButton } from './helpers.js';

function allowFailure(guard, pattern) {
  guard.http.push(pattern);
  // Chromium logs an HTTP resource error; pageerrors remain fatal.
  guard.console.push(/^console: Failed to load resource: the server responded with a status of (500|503)/);
}

test('RECOVERY search data failure and explicit retry', async ({ page, guard }) => {
  allowFailure(guard, /search-entries/);
  let fail = true;
  await page.route(patterns.entries, route => fail ? route.fulfill({ status: 503, body: 'unavailable' }) : route.fallback());
  await goto(page, '/');
  await page.locator('#search-input').fill('AC130');
  await expect(page.locator('[data-search-retry]')).toBeVisible();
  fail = false;
  await page.locator('[data-search-retry]').click();
  await expect(page.locator('.search-result-label').first()).toHaveText('AC130');
  await page.locator('.search-result').first().click();
  await expect(page.locator('.search-highlight-area')).toBeAttached();
});

test('RECOVERY facility rings failure and retry', async ({ page, guard }) => {
  allowFailure(guard, /facility-rings/);
  let fail = true;
  await page.route(patterns.rings, route => fail ? route.fulfill({ status: 503, body: 'unavailable' }) : route.fallback());
  await readyMap(page);
  await (await facilityButton(page, 'toilet')).click();
  await expect(page.locator('.map-load-retry')).toBeVisible();
  fail = false;
  await page.locator('.map-load-retry').click();
  await expect(page.locator('.facility-ring').first()).toBeAttached();
  await expect(page.locator('.map-load-retry')).toHaveCount(0);
});

test('RECOVERY map image failure and retry', async ({ page, guard }) => {
  allowFailure(guard, /\/assets\/.*\.svg/);
  guard.console.push(/^console: EncodingError: The source image cannot be decoded\.$/);
  let fail = true;
  await page.route(/\/assets\/(?:1F|food-map-ja)-.*\.svg/, route => fail ? route.fulfill({ status: 503, body: 'unavailable' }) : route.fallback());
  await goto(page, '/');
  await expect(page.locator('.map-load-retry').first()).toBeVisible();
  fail = false;
  await page.locator('.map-load-retry').first().click();
  await expect.poll(() => page.locator('#canvas-layer .floor-svg').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
});

for (const path of ['/', '/food/']) {
  test(`RECOVERY food data retry ${path}`, async ({ page, guard }) => {
    allowFailure(guard, /food-places/);
    let fail = true;
    await page.route(patterns.food, route => fail ? route.fulfill({ status: 503, body: 'unavailable' }) : route.fallback());
    await goto(page, path);
    const retry = page.locator(path === '/' ? '[data-food-action="retry"]' : '[data-food-places-retry]');
    if (path === '/') {
      if (!await page.locator('.food-action-button').isVisible()) await page.locator('#facility-more-toggle').click();
      await page.locator('.food-action-button').click();
    }
    await expect(retry).toBeVisible();
    fail = false;
    await retry.click();
    await expect(page.locator(path === '/' ? '.food-store-row' : '.food-place')).toHaveCount(foodData.places.length);
  });
}

for (const state of ['normal', 'empty', 'out-of-period', 'error']) {
  test(`RECOVERY food trucks ${state}`, async ({ page, guard }) => {
    allowFailure(guard, /api\/food-trucks/);
    await page.route('**/api/food-trucks', route => state === 'error'
      ? route.fulfill({ status: 503, body: 'unavailable' })
      : route.fulfill({ json: { ...trucks, trucks: state === 'normal' ? trucks.trucks : [], outOfPeriod: state === 'out-of-period' } }));
    await goto(page, '/food/');
    const root = page.locator('[data-food-trucks]');
    if (state === 'normal') await expect(root).toContainText('E2E Kitchen');
    else await expect(root.locator(state === 'error' ? '.is-error' : '.is-empty')).toBeVisible();
    await expect(root).not.toContainText('読み込んでいます');
  });
}

test('RECOVERY rail status failure leaves usable schedule and official fallback links', async ({ page, guard }) => {
  allowFailure(guard, /api\/rail-status/);
  await page.route('**/api/rail-status', route => route.fulfill({ status: 503, body: 'unavailable' }));
  await goto(page, '/timetable/');
  await expect(page.locator('.is-unavailable')).toContainText('運行情報を取得できません');
  await expect(page.locator('.is-unavailable a')).toHaveCount(3);
  await page.locator('.timetable-all-toggle').first().click();
  await expect(page.locator('.timetable-all-sheet').first()).toBeVisible();
});

test('RECOVERY food icon falls back when its primary image is missing', async ({ page, guard }) => {
  const place = foodData.places[0];
  allowFailure(guard, /food-marks/);
  await page.route(`**${place.mark.src}`, route => route.fulfill({ status: 503, body: '' }));
  await goto(page, '/food/');
  const image = page.locator(`.food-place[data-food-place="${place.entryId}"] img`);
  await expect(image).toHaveAttribute('src', place.mark.fallbackSrc);
  expect(await image.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
});

test('RECOVERY coop hours unavailable keeps food information usable', async ({ page, guard }) => {
  allowFailure(guard, /api\/coop-hours/);
  await page.route('**/api/coop-hours', route => route.fulfill({ status: 503, body: '' }));
  await goto(page, '/food/');
  await expect(page.locator('.food-place')).toHaveCount(foodData.places.length);
  await expect(page.locator('.food-status.is-unknown').first()).toBeVisible();
  await expect(page.locator('[data-food-places]')).not.toContainText('営業時間を確認中');
});

test('RECOVERY sources food and timetable failures show readable errors', async ({ page, guard }) => {
  allowFailure(guard, /food-places|timetable\/data\/manifest/);
  await page.route(patterns.food, route => route.fulfill({ status: 503, body: '' }));
  await page.route('**/timetable/data/manifest.json', route => route.fulfill({ status: 503, body: '' }));
  await goto(page, '/sources/');
  await expect(page.locator('[data-sources-food]')).toContainText('出典を読み込めませんでした');
  await expect(page.locator('[data-sources-timetable]')).toContainText('出典を読み込めませんでした');
});
