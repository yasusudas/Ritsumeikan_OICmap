import { test, expect, languages, foodData, facilities, searchData, readyMap, openFood, selectEntry, goto, noOverflow, withinViewport, screenshot, clickExternal, mapPath } from './helpers.js';

async function closeFood(page) {
  await page.locator('[data-food-action="close"]').click();
  await expect(page.locator('.food-panel')).toBeHidden();
}

async function dragFoodHandle(page, dy) {
  await page.locator('.food-sheet-handle').hover();
  const r = await page.locator('.food-sheet-handle').boundingBox();
  const x = r.x + r.width / 2, y = r.y + r.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + dy, { steps: 15 });
  await page.mouse.up();
}

for (const lang of languages) {
  test(`FOOD every store list, overview/details and map link ${lang}`, async ({ page, isMobile, guard }, testInfo) => {
    test.setTimeout(180_000);
    // Navigating away can cancel a WebKit image decode in the old document.
    // Verify the destination map below; actual loading errors remain fatal.
    guard.console.push(/^console: EncodingError: Loading was canceled\.$/);
    await readyMap(page, lang);
    await openFood(page);
    for (const place of foodData.places) {
      await test.step(place.name[lang], async () => {
        await page.locator(`[data-food-select="${place.entryId}"]`).click();
        await expect(page.locator('#food-panel-title')).toHaveText(place.name[lang]);
        await expect(page.locator('.food-area.is-selected').first()).toBeAttached();
        await withinViewport(page.locator('.food-panel'));
        if (isMobile) {
          await expect(page.locator('.food-panel')).toHaveClass(/is-compact/);
          if (place.todayTrucks) await dragFoodHandle(page, -230);
          else await page.locator('[data-food-action="expand"]').click();
          await expect(page.locator('.food-panel')).not.toHaveClass(/is-compact/);
          await withinViewport(page.locator('.food-panel'));
          if (place.todayTrucks) await dragFoodHandle(page, 160);
          else await page.locator('[data-food-action="collapse"]').click();
          await expect(page.locator('.food-panel')).toHaveClass(/is-compact/);
          // Lunch Street expands by dragging; other compact sheets expose Details.
          // List is in the expanded footer for both.
          if (place.todayTrucks) await dragFoodHandle(page, -230);
          else await page.locator('[data-food-action="expand"]').click();
        }
        await page.locator('[data-food-action="list"]').click();
        await expect(page.locator('.food-store-row')).toHaveCount(foodData.places.length);
      });
    }
    await closeFood(page);
    await expect(page.locator('.food-panel')).toBeHidden();
    for (const place of foodData.places) {
      await goto(page, `${mapPath(lang)}food/`);
      const card = page.locator(`.food-place[data-food-place="${place.entryId}"]`);
      await expect(card.locator('h3')).toHaveText(place.name[lang]);
      await card.locator(`a[href^="${mapPath(lang)}#"]`).click();
      await expect(page.locator('#food-panel-title')).toHaveText(place.name[lang]);
      await expect.poll(() => page.locator('#canvas-layer img.floor-svg').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
      await page.reload();
      await expect(page.locator('#food-panel-title')).toHaveText(place.name[lang]);
      await expect.poll(() => page.locator('#canvas-layer img.floor-svg').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    }
    await screenshot(page, testInfo, `food-${lang}`);
  });

  test(`FOOD every pin, area, hover and facility card ${lang}`, async ({ page, isMobile }, testInfo) => {
    test.setTimeout(180_000);
    await readyMap(page, lang);
    for (const place of [...foodData.places, ...facilities]) {
      await test.step(place.entryId, async () => {
        // Center via the real search first, so even small polygon targets are on screen.
        const entry = searchData.entries.find(e => e.id === place.entryId);
        await selectEntry(page, entry, lang);
        await closeFood(page);
        // WebKit can restore focus to the search field when the card closes,
        // reopening its suggestions. Dismiss them before testing a map hit.
        const suggestions = page.locator('#search-results');
        if (await suggestions.isVisible()) {
          await page.locator('#search-input').press('Escape');
          await expect(suggestions).toBeHidden();
        }
        const areaTarget = place.areaEntryId && !Number.isInteger(place.areaPolygon) ? place.areaEntryId : place.entryId;
        const areaPlace = [...foodData.places, ...facilities].find(p => p.entryId === areaTarget);
        const group = page.locator(`.food-area[data-food-place="${areaTarget}"]`).first();
        const hit = group.locator('.food-area-hit');
        // Prefer the centre, then search concave/overlapping areas. Use actual
        // integer mouse coordinates: rounding a subpixel ATM edge can hit 7-Eleven.
        const point = await hit.evaluate(element => {
          const r = element.getBoundingClientRect();
          const fractions = [.5, .4, .6, .3, .7, .2, .8, .1, .9];
          for (const y of fractions) for (const x of fractions) {
            const p = { x: Math.round(r.left + r.width * x), y: Math.round(r.top + r.height * y) };
            if (document.elementFromPoint(p.x, p.y) === element) return p;
          }
          return null;
        });
        expect(point, `Reachable area for ${place.entryId}`).not.toBeNull();
        if (!isMobile) {
          await page.mouse.move(point.x, point.y);
          await expect(page.locator('#food-hover-tip')).toBeVisible();
          await expect(page.locator('#food-hover-tip')).toContainText(areaPlace.name[lang]);
          // The overview itself is an interactive overlay; dismiss it before clicking
          // the map pixel underneath, and verify its keyboard dismissal as well.
          await page.keyboard.press('Escape');
          await expect(page.locator('#food-hover-tip')).toBeHidden();
        }
        await page.mouse.click(point.x, point.y);
        await expect(page.locator('.food-panel')).toBeVisible();
        await expect(page.locator('.food-card-brand')).toHaveAttribute('data-food-place', areaTarget);
        await closeFood(page);
        if (foodData.places.includes(place)) {
          const pin = page.locator(`.food-pin[data-food-place="${place.entryId}"]`);
          if (isMobile) {
            // The 48px button includes transparent space and a clipped hit area.
            // Its box centre can be outside this pin, so tap the visible badge.
            await expect(pin).toBeVisible();
            const badge = pin.locator('.food-badge');
            const box = await badge.boundingBox();
            const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
            const hitId = await page.evaluate(({ x, y }) =>
              document.elementFromPoint(x, y)?.closest('.food-pin')?.dataset.foodPlace,
            point);
            expect(hitId, `Visible pin ${place.name[lang]} must receive its own tap`).toBe(place.entryId);
            await page.touchscreen.tap(point.x, point.y);
          } else await pin.click();
          await expect(page.locator('.food-panel')).toBeVisible();
          await expect.soft(page.locator('.food-card-brand'), `Pin ${place.name[lang]} must select its own card`).toHaveAttribute('data-food-place', place.entryId);
          if (await page.locator('.food-card-brand').getAttribute('data-food-place') !== place.entryId) {
            await screenshot(page, testInfo, `wrong-pin-${place.entryId}`);
          }
          if (isMobile && ['GARDEN TERRACE LION', 'OIC Meal Shop'].includes(place.name.en)) {
            await screenshot(page, testInfo, `verified-pin-${place.entryId}-${lang}`);
          }
          await closeFood(page);
          await pin.press('Enter');
          await expect(page.locator('.food-card-brand')).toHaveAttribute('data-food-place', place.entryId);
          await page.keyboard.press('Escape');
          await expect(page.locator('.food-panel')).toBeHidden();
        }
      });
    }
  });
}

test('FOOD mobile sheet drag expand, collapse, dismiss and rotate', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Touch-layout sheet only.');
  await readyMap(page);
  await openFood(page);
  await page.locator('.food-store-row').first().click();
  const panel = page.locator('.food-panel');
  await dragFoodHandle(page, -230);
  await expect(panel).not.toHaveClass(/is-compact/);
  await dragFoodHandle(page, 160);
  await expect(panel).toHaveClass(/is-compact/);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(panel).not.toHaveClass(/is-compact/);
  await noOverflow(page);
  await withinViewport(panel);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel).toHaveClass(/is-compact/);
  await dragFoodHandle(page, 280);
  await expect(panel).toBeHidden();
});

test('FOOD every external store link and source opens the intended URL', async ({ page }) => {
  test.setTimeout(180_000);
  for (const lang of languages) {
    await goto(page, `${mapPath(lang)}food/`);
    await expect(page.locator('.food-place')).toHaveCount(foodData.places.length);
    const links = page.locator('.food-place a[target="_blank"]');
    expect(await links.count()).toBeGreaterThan(0);
    for (let i = 0; i < await links.count(); i++) await clickExternal(page, links.nth(i));
    await readyMap(page, lang);
    for (const place of [...foodData.places, ...facilities]) {
      await selectEntry(page, searchData.entries.find(entry => entry.id === place.entryId), lang);
      const expand = page.locator('[data-food-action="expand"]');
      if (await expand.isVisible()) await expand.click();
      const cardLinks = page.locator('.food-panel a[target="_blank"]');
      for (let i = 0; i < await cardLinks.count(); i++) await clickExternal(page, cardLinks.nth(i));
      await closeFood(page);
    }
  }
});
