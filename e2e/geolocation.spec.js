import { test, expect, chooseFloor, settleMapLayout, noOverflow, screenshot as captureScreenshot } from './helpers.js';

async function screenshot(page, testInfo, label) {
  await expect.poll(() => page.locator('#canvas-layer img.floor-svg').evaluateAll(images => images.length > 0 && images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
  // Wait for the menu close / SVG language transition to finish before visual QA.
  await page.waitForTimeout(400);
  await captureScreenshot(page, testInfo, label);
}

async function toggleLocation(page) {
  if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) await page.locator('#gps-trial-toggle').tap();
  else await page.locator('#gps-trial-toggle').click();
}

async function expectRoundAccuracy(page) {
  // Language/floor changes replace the SVG asynchronously. Assert the painted
  // circles after replacement, rather than sampling a detached/zero-size node.
  await expect.poll(() => page.locator('.gps-location-accuracy').evaluateAll(nodes =>
    nodes.length > 0 && nodes.every(node => {
      const box = node.getBoundingClientRect();
      return box.width > 0 && Math.abs(box.width - box.height) < .1;
    }))).toBe(true);
}

test('GPS does not start on non-map and editor pages', async ({ page }) => {
  await page.addInitScript(() => {
    window.gpsCalls = 0;
    navigator.geolocation.getCurrentPosition = () => window.gpsCalls++;
    navigator.geolocation.watchPosition = () => { window.gpsCalls++; return 1; };
  });
  for (const url of ['/terms/', '/editor/login/']) {
    await page.goto(url);
    expect(await page.evaluate(() => window.gpsCalls)).toBe(0);
    expect(await page.evaluate(() => performance.getEntriesByType('resource').some(resource => resource.name.includes('geolocation-viewer')))).toBe(false);
  }
});

test('GPS starts automatically without a query flag, shows approximate position and error circle, follows map changes and recenters', async ({ page, context, isMobile }, testInfo) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 34.80995, longitude: 135.5612, accuracy: 12 });
  await page.goto('/');
  await expect(page.locator('.food-pin').first()).toBeVisible();
  await expect(page.locator('.gps-location-dot')).toBeAttached();
  await expect(page.locator('#gps-trial-toggle')).toHaveAttribute('data-gps-state', 'position');
  await expect(page.locator('#gps-trial-toggle')).toHaveAttribute('title', /12m/);
  await expect(page.locator('.gps-trial-status')).toHaveCount(0);
  await expectRoundAccuracy(page);
  await noOverflow(page);
  await screenshot(page, testInfo, 'gps-trial-position');
  const locationInFrame = () => page.locator('.gps-location-dot').evaluate(dot => {
    const view = dot.ownerSVGElement.viewBox.baseVal;
    const box = dot.getBoundingClientRect();
    return { x: dot.cx.baseVal.value / view.width, y: dot.cy.baseVal.value / view.height,
      screenX: box.x + box.width / 2, screenY: box.y + box.height / 2 };
  });
  const firstFloor = await locationInFrame();
  for (const floor of ['2F', '3F', '4F', '5F']) {
    await chooseFloor(page, floor);
    await expect(page.locator('.gps-location-layer')).toHaveAttribute('data-floor', floor);
    await expect(page.locator('.gps-location-dot')).toHaveCount(1);
    await expectRoundAccuracy(page);
    await expect.poll(async () => {
      const current = await locationInFrame();
      return Math.hypot(current.screenX - firstFloor.screenX, current.screenY - firstFloor.screenY);
    }).toBeLessThan(0.01);
    const current = await locationInFrame();
    expect(current.x).toBeCloseTo(firstFloor.x, 12);
    expect(current.y).toBeCloseTo(firstFloor.y, 12);
    await expect(page.locator('#gps-trial-toggle')).toHaveAttribute('data-gps-state', 'position');
  }
  await chooseFloor(page, '1F');
  await expect(page.locator('.gps-location-dot')).toBeAttached();
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 787, height: 590 });
  await settleMapLayout(page);
  await expectRoundAccuracy(page);
  if (!isMobile) {
    const before = await page.locator('#canvas-layer').getAttribute('style');
    await page.mouse.move(390, 350);
    await page.mouse.wheel(0, -500);
    await expect(page.locator('#canvas-layer')).not.toHaveAttribute('style', before);
    await page.waitForTimeout(350);
    await expectRoundAccuracy(page);
    await expect.poll(() => page.locator('.gps-location-dot').first().evaluate(dot => dot.getBoundingClientRect().width)).toBeLessThanOrEqual(20.1);
  }
  await page.setViewportSize(viewport);
  await settleMapLayout(page);
  await expectRoundAccuracy(page);
  await expect.poll(() => page.locator('.gps-location-dot').first().evaluate(dot => dot.getBoundingClientRect().width)).toBeGreaterThanOrEqual(12);
  await page.locator('[data-lang-toggle]').click();
  await expect(page.locator('#gps-trial-toggle')).toHaveAttribute('title', /My location/);
  await expect(page.locator('.gps-location-dot')).toBeAttached();
  await toggleLocation(page);
  await expect(page.locator('.gps-location-dot')).toHaveCount(1);
  await expect(page.locator('#gps-trial-toggle')).toHaveAttribute('data-gps-available', 'true');
});

test('GPS starts on the selected floor, uses blue and white markers, and projects into every upper-floor panel', async ({ page, context }, testInfo) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 34.8104, longitude: 135.5611, accuracy: 12 });
  await page.goto('/?gps=1');
  await chooseFloor(page, '4F');
  await expect(page.locator('.gps-location-layer')).toHaveAttribute('data-floor', '4F');
  const colors = await page.locator('.gps-location-dot').evaluate(dot => {
    const style = getComputedStyle(dot), circle = getComputedStyle(document.querySelector('.gps-location-accuracy'));
    return { fill: style.fill, stroke: style.stroke, circle: circle.fill, opacity: circle.fillOpacity };
  });
  expect(colors).toEqual({ fill: 'rgb(26, 115, 232)', stroke: 'rgb(255, 255, 255)', circle: 'rgb(66, 133, 244)', opacity: '0.16' });
  await screenshot(page, testInfo, 'gps-blue-on-4F');
  await chooseFloor(page, 'A-6-9F');
  await expect(page.locator('.gps-location-layer')).toHaveAttribute('data-floor', 'A-6-9F');
  await expect(page.locator('.gps-location-dot')).toHaveCount(4);
  await page.locator('[data-lang-toggle]').click();
  await expect(page.locator('.gps-location-dot')).toHaveCount(4);
  await expectRoundAccuracy(page);
  await screenshot(page, testInfo, 'gps-A-upper-floors');
  await chooseFloor(page, 'H-6-9F');
  await expect(page.locator('#gps-trial-toggle')).toHaveAttribute('data-gps-state', 'outsideBuilding');
  await expect(page.locator('.gps-location-dot')).toHaveCount(0);
  // A -> H is a >200m teleport in this fixture: one fix must be held.
  // Supply three increasing-time coherent observations to exercise reacquisition.
  for (let observation = 0; observation < 3; observation++) {
    await page.waitForTimeout(30);
    await context.setGeolocation({ latitude: 34.80855, longitude: 135.5616, accuracy: 12 });
    await page.waitForTimeout(30);
  }
  await expect(page.locator('.gps-location-layer')).toHaveAttribute('data-floor', 'H-6-9F');
  await expect(page.locator('.gps-location-dot')).toHaveCount(4);
  await expect(page.locator('.gps-location-accuracy')).toHaveCount(4);
  await noOverflow(page);
  await expectRoundAccuracy(page);
  await screenshot(page, testInfo, 'gps-H-upper-floors');
  await page.locator('[data-lang-toggle]').click();
  await expect(page.locator('.gps-location-dot')).toHaveCount(4);
});

test('upper-floor markers disappear outdoors and resume when GPS returns to the same building', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 34.8104, longitude: 135.5611, accuracy: 8 });
  await page.goto('/?gps=1');
  await chooseFloor(page, 'A-6-9F');
  await expect(page.locator('.gps-location-dot')).toHaveCount(4);
  await context.setGeolocation({ latitude: 34.8104, longitude: 135.5611, accuracy: 30 });
  await expect(page.locator('#gps-trial-toggle')).toHaveAttribute('data-gps-state', 'uncertainBuilding');
  await expect(page.locator('.gps-location-dot')).toHaveCount(0);
  // The courtyard falls inside A's bounding rectangle, outside its actual walls.
  await context.setGeolocation({ latitude: 34.8106, longitude: 135.5611, accuracy: 8 });
  await expect(page.locator('#gps-trial-toggle')).toHaveAttribute('data-gps-state', 'outsideBuilding');
  await expect(page.locator('.gps-location-dot')).toHaveCount(0);
  await expect(page.locator('.gps-location-accuracy')).toHaveCount(0);
  await context.setGeolocation({ latitude: 34.8104, longitude: 135.5611, accuracy: 8 });
  await expect(page.locator('.gps-location-dot')).toHaveCount(4);
  await chooseFloor(page, 'H-6-9F');
  await expect(page.locator('#gps-trial-toggle')).toHaveAttribute('data-gps-state', 'outsideBuilding');
  // A -> H is a >200m teleport in this fixture: one fix must be held.
  // Supply three increasing-time coherent observations to exercise reacquisition.
  for (let observation = 0; observation < 3; observation++) {
    await page.waitForTimeout(30);
    await context.setGeolocation({ latitude: 34.80855, longitude: 135.5616, accuracy: 8 });
    await page.waitForTimeout(30);
  }
  await expect(page.locator('.gps-location-dot')).toHaveCount(4);
  // H's east-side recess is also inside the former rectangle, outside H itself.
  await context.setGeolocation({ latitude: 34.8088, longitude: 135.5617, accuracy: 8 });
  await expect(page.locator('#gps-trial-toggle')).toHaveAttribute('data-gps-state', 'outsideBuilding');
  await expect(page.locator('.gps-location-dot')).toHaveCount(0);
  await context.setGeolocation({ latitude: 34.80855, longitude: 135.5616, accuracy: 8 });
  await expect(page.locator('.gps-location-dot')).toHaveCount(4);
});

test('GPS outside the map or with poor accuracy explains the condition without placing a false pin', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 35.68, longitude: 139.76, accuracy: 10 });
  await page.goto('/?gps=1');
  await expect(page.locator('#gps-trial-toggle')).toHaveAttribute('data-gps-state', 'outside');
  await expect(page.locator('.gps-location-dot')).toHaveCount(0);
  await context.setGeolocation({ latitude: 34.81, longitude: 135.561, accuracy: 200 });
  await expect(page.locator('#gps-trial-toggle')).toHaveAttribute('data-gps-state', 'imprecise');
  await expect(page.locator('.gps-location-dot')).toHaveCount(0);
});

test('GPS permission denial leaves map and search usable', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_success, error) => { queueMicrotask(() => error({ code: 1 })); };
    navigator.geolocation.watchPosition = (_success, error) => { queueMicrotask(() => error({ code: 1 })); return 1; };
    navigator.geolocation.clearWatch = () => {};
  });
  await page.goto('/?gps=1');
  await expect(page.locator('#gps-trial-toggle')).toHaveAttribute('data-gps-state', 'denied');
  await expect(page.locator('.gps-trial-status')).toHaveCount(0);
  await expect(page.locator('#gps-trial-toggle')).toHaveAttribute('title', /許可/);
  await chooseFloor(page, '2F');
  await expect(page.locator('#search-input')).toBeVisible();
});

test('automatic permission request waits for the initial map but not the GPS module', async ({ page }) => {
  await page.addInitScript(() => {
    window.gpsCalls = [];
    window.gpsClicks = 0;
    document.addEventListener('click', () => window.gpsClicks++, true);
    navigator.geolocation.getCurrentPosition = (success, error) => {
      const image = document.querySelector('#canvas-layer img.floor-svg');
      window.gpsCalls.push({ clicks: window.gpsClicks, mapReady: Boolean(image?.complete && image.naturalWidth) });
      window.finishPermission = () => success({ coords: { latitude: 34.8104, longitude: 135.5611, accuracy: 8 }, timestamp: Date.now() });
      window.denyPermission = () => error({ code: 1 });
    };
    navigator.geolocation.watchPosition = () => 1;
    navigator.geolocation.clearWatch = () => {};
  });
  let releaseMap, releaseModule;
  const mapGate = new Promise(resolve => { releaseMap = resolve; });
  const moduleGate = new Promise(resolve => { releaseModule = resolve; });
  await page.route('**/assets/*.svg', async route => { await mapGate; await route.fallback(); });
  await page.route(/\/assets\/geolocation-viewer.*\.js$/, async route => { await moduleGate; await route.continue(); });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.gpsCalls)).toEqual([]);
  releaseMap();
  await expect.poll(() => page.evaluate(() => window.gpsCalls.length)).toBe(1);
  expect(await page.evaluate(() => window.gpsCalls)).toEqual([{ clicks: 0, mapReady: true }]);
  await expect(page.locator('.gps-trial-status')).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  releaseModule();
  await expect(page.locator('#gps-trial-toggle')).toHaveAttribute('data-gps-state', 'locating');
  await page.clock.install();
  await page.clock.fastForward(30_000);
  expect(await page.evaluate(() => window.gpsCalls.length)).toBe(1);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    window.finishPermission();
  });
  await expect(page.locator('.gps-location-dot')).toHaveCount(1);
});

test('last location survives time, temporary errors, backgrounding and bfcache including recentering', async ({ page }) => {
  await page.addInitScript(() => {
    const position = { coords: { latitude: 34.8104, longitude: 135.5611, accuracy: 8 }, timestamp: Date.now() };
    navigator.geolocation.getCurrentPosition = success => queueMicrotask(() => success(position));
    navigator.geolocation.watchPosition = (success, error) => { window.gpsSuccess = success; window.gpsError = error; return 1; };
    navigator.geolocation.clearWatch = () => {};
  });
  await page.goto('/?gps=1');
  await expect(page.locator('.gps-location-dot')).toHaveCount(1);
  await page.clock.install();
  await page.clock.fastForward(10 * 60_000);
  await expect(page.locator('.gps-location-dot')).toHaveCount(1);
  await expect(page.locator('.gps-location-layer')).toHaveAttribute('data-timestamp', /[0-9]+/);
  for (const code of [3, 2]) {
    await page.evaluate(code => window.gpsError({ code }), code);
    await expect(page.locator('#gps-trial-toggle')).toHaveAttribute('data-gps-available', 'false');
    await expect(page.locator('#gps-trial-toggle')).toHaveCSS('color','rgb(128, 134, 139)');
    await expect(page.locator('.gps-location-dot')).toHaveCount(1);
  }
  for (const visibility of ['hidden', 'visible']) {
    await page.evaluate(value => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value });
      document.dispatchEvent(new Event('visibilitychange'));
    }, visibility);
    await expect(page.locator('.gps-location-dot')).toHaveCount(1);
  }
  await page.evaluate(() => { window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
  await expect(page.locator('.gps-location-dot')).toHaveCount(1);
  await chooseFloor(page, 'A-6-9F');
  await expect(page.locator('.gps-location-dot')).toHaveCount(4);
  await page.evaluate(() => window.gpsSuccess({ coords: { latitude: 34.8106, longitude: 135.5611, accuracy: 8 }, timestamp: Date.now() }));
  await expect(page.locator('.gps-location-dot')).toHaveCount(0);
  await expect(page.locator('#gps-trial-toggle')).toHaveAttribute('data-gps-state', 'outsideBuilding');
  await toggleLocation(page);
  await expect(page.locator('#gps-trial-toggle')).toHaveAttribute('data-gps-available', 'true');
});

test('permission denial can be retried directly from a tap after the setting is changed', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_success, error) => queueMicrotask(() => error({ code: 1 }));
    navigator.geolocation.watchPosition = success => {
      window.retryWasActive = navigator.userActivation.isActive;
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      queueMicrotask(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
        document.dispatchEvent(new Event('visibilitychange'));
        success({ coords: { latitude: 34.8104, longitude: 135.5611, accuracy: 8 }, timestamp: Date.now() });
      });
      return 1;
    };
    navigator.geolocation.clearWatch = () => {};
  });
  await page.goto('/?gps=1');
  await expect(page.locator('#gps-trial-toggle')).toHaveAttribute('data-gps-state', 'denied');
  await noOverflow(page);
  await screenshot(page, testInfo, 'gps-permission-help');
  await toggleLocation(page);
  await expect(page.locator('.gps-location-dot')).toHaveCount(1);
  await expect(page.locator('#gps-trial-toggle')).toHaveAttribute('data-gps-state', 'position');
  expect(await page.evaluate(() => window.retryWasActive)).toBe(true);
});

async function mockContinuousLocation(page) {
  await page.addInitScript(() => {
    window.locationRequests = []; window.locationWatches = []; window.clearedWatches = [];
    window.makePosition = (latitude = 34.8104) => ({ coords: { latitude, longitude: 135.5611, accuracy: 8 }, timestamp: Date.now() });
    navigator.geolocation.getCurrentPosition = (success, error, options) => {
      window.locationRequests.push({ success, error, options });
      if (window.locationRequests.length === 1) queueMicrotask(() => success(window.makePosition()));
    };
    navigator.geolocation.watchPosition = (success, error, options) => {
      window.locationWatches.push({ success, error, options });
      return window.locationWatches.length;
    };
    navigator.geolocation.clearWatch = id => window.clearedWatches.push(id);
    window.setLocationVisibility = value => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value });
      document.dispatchEvent(new Event('visibilitychange'));
    };
  });
  await page.goto('/?gps=1');
  await expect(page.locator('.gps-location-dot')).toHaveCount(1);
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 100));
}

test('continuous fixes render immediately; a quiet watch gets one bounded fresh request without rewinding', async ({ page }) => {
  await mockContinuousLocation(page);
  for (let i = 1; i <= 5; i++) {
    await page.clock.runFor(1_000);
    const before = await page.locator('.gps-location-dot').getAttribute('cx');
    await page.evaluate(i => window.locationWatches[0].success(window.makePosition(34.8104 + i * .00001)), i);
    await page.clock.runFor(20);
    expect(await page.locator('.gps-location-dot').getAttribute('cx')).not.toBe(before);
    expect(await page.evaluate(() => window.locationRequests.length)).toBe(1);
  }
  await page.clock.runFor(9_000);
  expect(await page.evaluate(() => window.locationRequests.length)).toBe(1);
  await page.clock.runFor(1_100);
  expect(await page.evaluate(() => window.locationRequests.length)).toBe(2);
  expect(await page.evaluate(() => window.locationRequests[1].options)).toEqual({ enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 });
  expect(await page.evaluate(() => window.locationWatches[0].options)).toEqual({ enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 });
  // Even a browser request that fails to settle must not cause overlapping polls.
  await page.clock.fastForward(60_000);
  expect(await page.evaluate(() => window.locationRequests.length)).toBe(2);
  await page.evaluate(() => {
    window.olderFix = window.makePosition(34.8105);
    window.locationWatches[0].success({ ...window.makePosition(34.81055), timestamp: Date.now() + 1 });
  });
  await page.clock.runFor(300);
  const newerX = await page.locator('.gps-location-dot').getAttribute('cx');
  await page.evaluate(() => window.locationRequests[1].success(window.olderFix));
  await page.clock.runFor(20);
  expect(await page.locator('.gps-location-dot').getAttribute('cx')).toBe(newerX);
  await page.clock.runFor(10_100);
  expect(await page.evaluate(() => window.locationRequests.length)).toBe(3);
  await page.evaluate(() => window.locationRequests[2].error({ code: 3 }));
  await page.clock.runFor(20);
  await expect(page.locator('#gps-trial-toggle')).toHaveAttribute('data-gps-state', 'timeout');
  await expect(page.locator('.gps-location-dot')).toHaveCount(1);
  await page.clock.runFor(9_000);
  expect(await page.evaluate(() => window.locationRequests.length)).toBe(3);
  await page.clock.runFor(1_100);
  expect(await page.evaluate(() => window.locationRequests.length)).toBe(4);
  await page.evaluate(() => window.locationRequests[3].success(window.makePosition(34.8106)));
  await page.clock.runFor(20);
  await expect(page.locator('#gps-trial-toggle')).toHaveAttribute('data-gps-state', 'position');
  expect(await page.evaluate(() => window.locationWatches.length)).toBe(1);
});

test('recovery pauses when hidden, ignores old requests after resume, and stops on denial and keeps tracking after recenter', async ({ page }) => {
  await mockContinuousLocation(page);
  await page.clock.runFor(11_000);
  expect(await page.evaluate(() => window.locationRequests.length)).toBe(2);
  await page.evaluate(() => window.setLocationVisibility('hidden'));
  await page.clock.runFor(30_000);
  expect(await page.evaluate(() => window.locationRequests.length)).toBe(2);
  expect(await page.evaluate(() => window.clearedWatches)).toEqual([1]);
  await expect(page.locator('.gps-location-dot')).toHaveCount(1);
  await page.evaluate(() => window.setLocationVisibility('visible'));
  expect(await page.evaluate(() => window.locationWatches.length)).toBe(2);
  await page.evaluate(() => window.locationWatches[1].success(window.makePosition(34.8105)));
  await page.clock.runFor(11_000);
  expect(await page.evaluate(() => window.locationRequests.length)).toBe(2);
  // The pre-hide request cannot change the resumed watch's state or marker.
  await page.evaluate(() => window.locationRequests[1].error({ code: 1 }));
  await page.clock.runFor(20);
  await expect(page.locator('#gps-trial-toggle')).toHaveAttribute('data-gps-state', 'position');
  await page.clock.runFor(10_100);
  expect(await page.evaluate(() => window.locationRequests.length)).toBe(3);
  await page.evaluate(() => window.locationRequests[2].error({ code: 1 }));
  await page.clock.runFor(30_000);
  await expect(page.locator('#gps-trial-toggle')).toHaveAttribute('data-gps-state', 'denied');
  expect(await page.evaluate(() => window.locationRequests.length)).toBe(3);
  expect(await page.evaluate(() => window.clearedWatches)).toEqual([1, 2]);
  await expect(page.locator('.gps-location-dot')).toHaveCount(1);
  await page.clock.resume();
  await toggleLocation(page);
  await page.evaluate(() => window.locationWatches[2].success(window.makePosition()));
  await expect(page.locator('#gps-trial-toggle')).toHaveAttribute('data-gps-state', 'position');
  await page.clock.fastForward(11_000);
  expect(await page.evaluate(() => window.locationRequests.length)).toBe(4);
  await toggleLocation(page);
  await page.evaluate(() => window.locationRequests[3].success(window.makePosition()));
  await page.clock.fastForward(30_000);
  await expect(page.locator('.gps-location-dot')).toHaveCount(1);
  expect(await page.evaluate(() => window.locationRequests.length)).toBeGreaterThanOrEqual(4);
  expect(await page.evaluate(() => window.clearedWatches)).toEqual([1, 2]);
});

 test('location action is compact, centers without stopping, and reflects errors and recovery', async ({page,context}) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({latitude:34.8104,longitude:135.5611,accuracy:8});
  await page.goto('/');
  const button=page.locator('#gps-trial-toggle');
  await expect(button).toHaveAttribute('data-gps-available','true');
  const sizes=await page.evaluate(()=>({gps:document.querySelector('#gps-trial-toggle').getBoundingClientRect().width,facility:document.querySelector('.search-icon-actions > .search-icon-button').getBoundingClientRect().width}));
  expect(sizes.gps).toBeLessThanOrEqual(sizes.facility+.1);
  const before=await page.locator('#canvas-layer').getAttribute('style');
  await toggleLocation(page);
  await expect(page.locator('#canvas-layer')).not.toHaveAttribute('style',before);
  await expect(page.locator('.gps-location-dot')).toHaveCount(1);
  await expect(button).not.toHaveAttribute('aria-pressed');
  await context.setGeolocation({latitude:34.8105,longitude:135.5611,accuracy:8});
  await expect(button).toHaveCSS('color','rgb(26, 115, 232)');
 });

test('filtered and animated marker uncertainty encloses the newest raw fix at every frame', async ({ page }) => {
  await mockContinuousLocation(page);
  await page.clock.runFor(1000);
  await page.evaluate(() => window.locationWatches[0].success(window.makePosition(34.81048)));
  for (const elapsed of [20, 80, 150, 300]) {
    await page.clock.runFor(elapsed);
    const result = await page.locator('.gps-location-dot').evaluate(dot => {
      const svg = dot.ownerSVGElement, view = svg.viewBox.baseVal;
      const east=(135.5611-135.561)*111320*Math.cos(34.81*Math.PI/180), north=(34.81048-34.81)*111320;
      const rawX=(-.16174776354784548*east+2.475697136757557*north+560.3918069950691)*view.width/1190.55;
      const rawY=(2.470851803394357*east+.05321661547903411*north+305.0175306020657)*view.height/841.89;
      // Check the projected boundary itself, not the same radius formula as implementation.
      const radius=svg.querySelector('.gps-location-accuracy').r.baseVal.value;
      let max=0;
      for(let a=0;a<360;a++) {
        const e=8*Math.cos(a*Math.PI/180), n=8*Math.sin(a*Math.PI/180);
        const x=rawX+(-.16174776354784548*e+2.475697136757557*n)*view.width/1190.55;
        const y=rawY+(2.470851803394357*e+.05321661547903411*n)*view.height/841.89;
        max=Math.max(max,Math.hypot(x-dot.cx.baseVal.value,y-dot.cy.baseVal.value));
      }
      return { radius,max };
    });
    expect(result.radius+0.001).toBeGreaterThanOrEqual(result.max);
  }
});
