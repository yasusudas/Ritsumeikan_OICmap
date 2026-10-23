import { test, expect, searchData, languages, floors, readyMap, selectEntry, chooseFloor, facilityButton, screenshot } from './helpers.js';

// Small independent batches continue after a failed batch and identify the exact entry in steps.
for (const lang of languages) {
  for (let offset = 0; offset < searchData.entries.length; offset += 40) {
    const batch = searchData.entries.slice(offset, offset + 40);
    test(`SEARCH all entries ${lang} ${offset + 1}-${offset + batch.length}`, async ({ page }) => {
      test.setTimeout(180_000);
      await readyMap(page, lang);
      for (const entry of batch) {
        await test.step(`${entry.floorId} ${entry.label} [${entry.id}]`, async () => {
          await selectEntry(page, entry, lang, lang === 'en' ? entry.labelEn || entry.label : entry.label);
          // Clearing first also verifies the selection/hash does not leak into the next search.
          await page.locator('#search-clear').click();
          await expect(page.locator('#search-input')).toHaveValue('');
          await expect(page.locator('.search-highlight-pin, .search-highlight-area')).toHaveCount(0);
          await expect.poll(() => new URL(page.url()).hash).toBe('');
        });
      }
    });
  }

  const aliases = searchData.entries.flatMap(entry => (entry.aliases || []).map(alias => ({ entry, alias })));
  for (let offset = 0; offset < aliases.length; offset += 80) {
    test(`SEARCH aliases ${lang} ${offset + 1}-${Math.min(offset + 80, aliases.length)}`, async ({ page }) => {
      test.setTimeout(180_000);
      await readyMap(page, lang);
      for (const { entry, alias } of aliases.slice(offset, offset + 80)) {
        await test.step(`${alias} -> ${entry.id}`, async () => {
          await page.locator('#search-input').fill(alias);
          const normalize = value => String(value || '').normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]+/gu, '');
          const owners = searchData.entries.filter(candidate => [candidate.label, candidate.labelEn, ...(candidate.aliases || []), candidate.locationHint, candidate.locationHintEn].some(value => normalize(value) === normalize(alias)));
          if (owners.length <= 18) await expect(page.locator(`.search-result[data-entry-id="${entry.id}"]`)).toBeVisible();
          else {
            // Generic aliases such as 教員研究室 intentionally have more than the 18-result cap.
            await expect(page.locator('.search-result')).toHaveCount(18);
            const ids = await page.locator('.search-result').evaluateAll(nodes => nodes.map(node => node.dataset.entryId));
            expect(ids.every(id => owners.some(owner => owner.id === id))).toBe(true);
          }
        });
      }
    });
  }

  test(`SEARCH keyboard, normalization, IME, empty and hash ${lang}`, async ({ page }, testInfo) => {
    await readyMap(page, lang);
    const input = page.locator('#search-input');
    await input.fill('ac 130');
    await expect(page.locator('.search-result').first()).toContainText('AC130');
    await input.fill('ＡＣ１３０');
    await input.press('Enter');
    await expect(input).toHaveValue('AC130');
    const deepLink = page.url();
    await page.reload();
    await expect(input).toHaveValue('AC130');
    await expect(page.locator('.search-highlight-area')).toBeAttached();
    expect(page.url()).toBe(deepLink);
    await input.fill('A');
    const first = await page.locator('.search-result.is-active').getAttribute('data-entry-id');
    await input.press('ArrowDown');
    await expect(page.locator('.search-result.is-active')).not.toHaveAttribute('data-entry-id', first);
    await input.press('ArrowUp');
    await expect(page.locator('.search-result.is-active')).toHaveAttribute('data-entry-id', first);
    // Synthetic IME events are intentional: Playwright has no real OS IME composition API.
    await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true, keyCode: 229 });
    await expect(input).toHaveValue('A');
    await expect(page.locator('#search-results')).toBeVisible();
    await input.press('Escape');
    await expect(page.locator('#search-results')).toBeHidden();
    await input.fill('NO_SUCH_ROOM_987654321');
    await expect(page.locator('.search-result-empty')).toBeVisible();
    await expect(page.locator('.search-result')).toHaveCount(0);
    await input.fill('!!!');
    await expect(page.locator('.search-result-empty')).toBeVisible();
    await page.locator('#search-clear').click();
    await expect(page.locator('#search-clear')).toBeHidden();
    await expect(input).toBeFocused();
    await screenshot(page, testInfo, `map-${lang}`);
  });

  test(`MAP every floor and every facility ${lang}`, async ({ page }) => {
    test.setTimeout(180_000);
    await readyMap(page, lang);
    for (const floor of floors) {
      await chooseFloor(page, floor);
      for (const key of ['toilet', 'waterServer', 'vendingMachine', 'stairs', 'elevator', 'aed']) {
        await test.step(`${floor} ${key}`, async () => {
          await (await facilityButton(page, key)).click();
          await expect(page.locator(`.search-icon-button[data-facility-key="${key}"]`)).toHaveAttribute('aria-pressed', 'true');
          const expected = searchData.facilityRings.filter(r => r.floorId === floor && (r.facilityKey === key || key === 'stairs' && r.facilityKey === 'escalator'));
          await expect(page.locator('.facility-ring:not([data-registration-copy])')).toHaveCount(expected.length);
          if (key === 'toilet') await expect(page.locator('#toilet-ring-legend')).toBeVisible();
          await (await facilityButton(page, key)).click();
          await expect(page.locator('.facility-ring:not([data-registration-copy])')).toHaveCount(0);
        });
      }
    }
    for (const [key, target] of [['atm', '1F'], ['nursingRoom', '2F']]) {
      await chooseFloor(page, '3F');
      await (await facilityButton(page, key)).click();
      await expect(page.locator(`.floor-tab[data-floor="${target}"]`)).toHaveClass(/is-active/);
      await expect(page.locator('.facility-ring:not([data-registration-copy])')).toHaveCount(searchData.facilityRings.filter(r => r.facilityKey === key && r.floorId === target).length);
      await (await facilityButton(page, key)).click();
      await expect(page.locator('.floor-tab[data-floor="3F"]')).toHaveClass(/is-active/);
    }
    await (await facilityButton(page, 'printer')).click();
    await expect(page.locator('#canvas-layer .floor-svg')).toHaveAttribute('src', /print-station/);
    await chooseFloor(page, '1F');
    await expect(page.locator('.search-icon-button[data-facility-key="printer"]')).toHaveAttribute('aria-pressed', 'false');
    await (await facilityButton(page, 'toilet')).click();
    await (await facilityButton(page, 'elevator')).click();
    await expect(page.locator('.search-icon-button[aria-pressed="true"]')).toHaveCount(1);
  });
}

test('MAP wheel zoom and mouse pan change the rendered transform', async ({ page, isMobile, browserName }) => {
  test.skip(isMobile && browserName === 'webkit', 'Playwright does not support mouse wheels in mobile WebKit.');
  await readyMap(page);
  const canvas = page.locator('#canvas-layer');
  const before = await canvas.getAttribute('style');
  await page.mouse.move(300, 300);
  await page.mouse.wheel(0, -450);
  await expect(canvas).not.toHaveAttribute('style', before);
  const zoomed = await canvas.getAttribute('style');
  await page.mouse.move(300, 350);
  await page.mouse.down();
  await page.mouse.move(390, 410, { steps: 10 });
  await page.mouse.up();
  await expect(canvas).not.toHaveAttribute('style', zoomed);
});

for (const lang of languages) {
  test(`MAP floor controls keep zoom and position ${lang}`, async ({ page }, testInfo) => {
    await readyMap(page, lang);
    const entry = searchData.entries.find(item => item.floorId === '1F' && item.label === 'AC130');
    await selectEntry(page, entry, lang);
    const canvas = page.locator('#canvas-layer');
    await expect.poll(() => canvas.evaluate(node => node.style.transform.includes('scale('))).toBe(false);
    const initialView = await canvas.evaluate(node => ({
      width: node.style.width,
      height: node.style.height,
      transform: node.style.transform,
    }));

    for (const [floor, file] of [
      ['2F', /\/2F-[^/]+\.svg/],
      ['3F', /\/3F-[^/]+\.svg/],
      ['4F', /\/4F-[^/]+\.svg/],
      ['5F', /\/5F-[^/]+\.svg/],
      ['A-6-9F', /6F7F8F9F_BldgA-[^/]+\.svg/],
      ['H-6-9F', /6F7F8F9F_BldgH-[^/]+\.svg/],
      ['1F', /\/(?:food-map-[^/]+|1F-[^/]+)\.svg/],
    ]) {
      await chooseFloor(page, floor);
      await expect(page.locator('#canvas-layer img.floor-svg')).toHaveAttribute('src', file);
      await expect.poll(() => canvas.evaluate(node => ({
        width: node.style.width,
        height: node.style.height,
        transform: node.style.transform,
      }))).toEqual(initialView);
      if (floor === '2F') await screenshot(page, testInfo, `floor-2f-${lang}`);
    }
    if (await page.locator('#site-menu-toggle').isVisible()) {
      await page.locator('#site-menu-toggle').click();
      await page.locator('#about-menu-button').click();
    } else {
      await page.locator('.site-footer [data-dialog="about"]').click();
    }
    await expect(page.locator('#about-dialog .about-dialog-version')).toHaveText('Ver3.2');
  });
}

test('MAP menus close on Escape/outside and keyboard enters facility menu', async ({ page }) => {
  await readyMap(page);
  const more = page.locator('#facility-more-toggle');
  await more.press('ArrowDown');
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#facility-more-panel button').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await expect(more).toBeFocused();
  await more.click();
  await page.locator('#search-input').click();
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  const floor = page.locator('[data-mobile-floor-toggle]');
  if (await floor.isVisible()) {
    await floor.click();
    await page.keyboard.press('Escape');
    await expect(floor).toHaveAttribute('aria-expanded', 'false');
    await expect(floor).toBeFocused();
    await floor.click();
    await page.locator('#search-input').click();
    await expect(floor).toHaveAttribute('aria-expanded', 'false');
  }
});

test('MAP deep links, unknown hash, language preserves selection, dialog background', async ({ page }) => {
  await readyMap(page);
  await selectEntry(page, searchData.entries.find(entry => entry.label === 'AC130'));
  const hash = new URL(page.url()).hash;
  await page.locator('[data-lang-option="en"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(new URL(page.url()).hash).toBe(hash);
  await expect(page.locator('.search-highlight-area')).toBeAttached();
  for (const kind of ['about', 'contact']) {
    await page.goto(`/en/#${kind}`);
    const backdrop = page.locator(kind === 'about' ? '#about-dialog' : '#contact-form-dialog');
    await expect(backdrop).toBeVisible();
    await backdrop.click({ position: { x: 2, y: 2 } });
    await expect(backdrop).toBeHidden();
  }
  await page.goto('/#unknown-e2e-location');
  await expect(page.locator('#viewer')).toBeVisible();
  await expect(page.locator('.search-highlight-area, .search-highlight-pin')).toHaveCount(0);
});

test('MAP mobile touch pan and pinch zoom', async ({ page, context, isMobile, browserName }) => {
  test.skip(!isMobile || browserName !== 'chromium', 'Chromium CDP generates actual touch input; mouse pan is tested separately.');
  await readyMap(page);
  const cdp = await context.newCDPSession(page);
  const canvas = page.locator('#canvas-layer');
  const before = await canvas.getAttribute('style');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 140, y: 380 }, { x: 240, y: 480 }] });
  for (let step = 1; step <= 6; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 140 - step * 10, y: 380 - step * 10 }, { x: 240 + step * 10, y: 480 + step * 10 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(canvas).not.toHaveAttribute('style', before);
  const zoomed = await canvas.getAttribute('style');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 160, y: 400 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 210, y: 440 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(canvas).not.toHaveAttribute('style', zoomed);
});
