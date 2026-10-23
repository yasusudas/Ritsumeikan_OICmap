import { test, expect, languages, readyMap, selectEntry, chooseFloor, searchData } from './helpers.js';

const view = page => page.locator('#canvas-layer').evaluate(node => ({
  width: node.style.width,
  height: node.style.height,
  transform: node.style.transform,
}));
const floorImage = page => page.locator('#canvas-layer img.floor-svg');

async function zoomedMap(page, lang) {
  await readyMap(page, lang);
  await selectEntry(page, searchData.entries.find(entry => entry.label === 'AC130'), lang);
  await expect.poll(() => page.locator('#canvas-layer').evaluate(node => node.style.transform.includes('scale('))).toBe(false);
  // Chrome updates width/height throughout the search camera animation, even
  // when there is no CSS scale(). Capture the settled view for the retry test.
  let previous = '';
  let unchangedSince = Date.now();
  await expect.poll(async () => {
    const next = JSON.stringify(await view(page));
    if (next !== previous) { previous = next; unchangedSince = Date.now(); }
    return Date.now() - unchangedSince;
  }, { intervals: [50, 100, 100] }).toBeGreaterThanOrEqual(200);
  return view(page);
}

async function requestFloor(page, floor) {
  const tab = page.locator(`.floor-tab[data-floor="${floor}"]`);
  if (await tab.isVisible()) await tab.click();
  else {
    await page.locator('[data-mobile-floor-toggle]').click();
    await page.locator(`[data-mobile-floor-option][data-floor="${floor}"]`).click();
  }
  await expect(tab).toHaveClass(/is-active/);
}

for (const lang of languages) {
  test(`MAP floor retry after DNS failure keeps the view ${lang}`, async ({ page, guard }) => {
    const initialView = await zoomedMap(page, lang);
    guard.console.push(
      /^console: Failed to load resource: net::ERR_NAME_NOT_RESOLVED$/,
      /^console: EncodingError: (?:The source image cannot be decoded\.|Decoding failed\.|Loading error\.)$/,
    );
    let fail = true;
    await page.route(/\/2F-[^/]+\.svg(?:\?|$)/, route => fail ? route.abort('namenotresolved') : route.fallback());
    await requestFloor(page, '2F');
    await expect(page.locator('.map-load-retry')).toBeVisible();
    fail = false;
    await page.locator('.map-load-retry').click();
    await expect(floorImage(page)).toHaveAttribute('src', /\/2F-[^/]+\.svg\?retry=/);
    await expect.poll(() => floorImage(page).evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(page.locator('.map-load-retry')).toHaveCount(0);
    await expect.poll(() => view(page)).toEqual(initialView);
  });

  test(`MAP a delayed floor failure cannot replace the latest floor ${lang}`, async ({ page, guard }) => {
    const initialView = await zoomedMap(page, lang);
    guard.http.push(/503 .*\/2F-/);
    guard.console.push(/^console: Failed to load resource: the server responded with a status of 503 /);
    let release;
    let requested = false;
    const delayed = new Promise(resolve => { release = resolve; });
    await page.route(/\/2F-[^/]+\.svg(?:\?|$)/, async route => {
      requested = true;
      await delayed;
      await route.fulfill({ status: 503, body: 'delayed failure' });
    });
    try {
      await requestFloor(page, '2F');
      await expect.poll(() => requested).toBe(true);
      await chooseFloor(page, '3F');
      await expect(floorImage(page)).toHaveAttribute('src', /\/3F-[^/]+\.svg/);
      await expect.poll(() => view(page)).toEqual(initialView);
      const failedResponse = page.waitForResponse(response => /\/2F-[^/]+\.svg/.test(response.url()));
      release();
      await (await failedResponse).finished();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await expect(page.locator('.map-load-retry')).toHaveCount(0);
      await expect(floorImage(page)).toHaveAttribute('src', /\/3F-[^/]+\.svg/);
      await expect.poll(() => view(page)).toEqual(initialView);
    } finally {
      release();
    }
  });
}
