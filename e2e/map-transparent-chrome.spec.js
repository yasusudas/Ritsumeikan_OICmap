import { test, expect, languages, readyMap, chooseFloor, searchData, selectEntry, noOverflow } from './helpers.js';

for (const lang of languages) {
  test(`MAP transparent controls/footer retain an opaque title and map gestures ${lang}`, async ({ page, isMobile }) => {
    await readyMap(page, lang);
    const layout = await page.evaluate(() => {
      const title = document.querySelector('.topbar-bar');
      const viewer = document.querySelector('#viewer');
      const image = document.querySelector('#canvas-layer img.floor-svg').getBoundingClientRect();
      const hit = (x, y) => Boolean(document.elementFromPoint(x, y)?.closest('#viewer'));
      return {
        headerBackground: getComputedStyle(document.querySelector('.topbar')).backgroundColor,
        footerBackground: getComputedStyle(document.querySelector('.site-footer')).backgroundColor,
        titleBackground: getComputedStyle(title, '::before').backgroundColor,
        titleBottom: title.getBoundingClientRect().bottom,
        // The existing wide layout reserves the full toolbar and footer;
        // the narrow layout fits below the solid title row.
        fittedCenter: innerWidth <= 900
          ? (title.getBoundingClientRect().bottom + innerHeight) / 2
          : (Math.ceil(document.querySelector('.topbar').getBoundingClientRect().height) + innerHeight - Math.ceil(document.querySelector('.site-footer').getBoundingClientRect().height)) / 2,
        imageCenter: (image.top + image.bottom) / 2,
        mapHeight: viewer.getBoundingClientRect().height,
        height: innerHeight,
        toolbarGapIsMap: hit(2, title.getBoundingClientRect().bottom + 10),
        footerGapIsMap: hit(2, innerHeight - 2),
      };
    });
    const glass = await page.locator('.topbar-tools').evaluate(el => {
      const style = getComputedStyle(el, '::before');
      return { background: style.backgroundColor, filter: style.backdropFilter, content: style.content,
        width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height,
        rect: el.getBoundingClientRect().toJSON(), viewport: innerWidth };
    });
    expect(glass.background).toBe('rgba(0, 0, 0, 0)');
    expect(glass.filter).toBe('none');
    expect(glass.content).toBe('none');
    expect(glass.width).toBe(glass.viewport);
    expect(glass.height).toBe(glass.rect.height);
    expect(glass.rect.top).toBe(layout.titleBottom);
    expect(layout.headerBackground).toBe('rgba(0, 0, 0, 0)');
    expect(layout.footerBackground).toBe('rgba(0, 0, 0, 0)');
    expect(layout.titleBackground).toBe('rgb(255, 255, 255)');
    expect(layout.mapHeight).toBe(layout.height);
    expect(Math.abs(layout.imageCenter - layout.fittedCenter)).toBeLessThan(2);
    expect(layout.toolbarGapIsMap).toBe(true);
    expect(layout.footerGapIsMap).toBe(true);
    await noOverflow(page);
    if (!isMobile) {
      await page.mouse.move(700, 430);
      for (let i = 0; i < 6; i++) {
        await page.mouse.wheel(0, -800);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      }
      await expect.poll(() => page.locator('#canvas-layer').evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(page.viewportSize().width);
      const transform = () => page.locator('#canvas-layer').evaluate(el => el.style.transform);
      for (const y of [layout.titleBottom + 10, layout.height - 2]) {
        const before = await transform();
        await page.mouse.move(2, y);
        await page.mouse.down();
        await page.mouse.move(52, y, { steps: 5 });
        await page.mouse.up();
        await expect.poll(transform).not.toBe(before);
      }
    }
  });

  test(`MAP floating controls, popovers, footer and resize remain usable ${lang}`, async ({ page }) => {
    await readyMap(page, lang);
    await selectEntry(page, searchData.entries.find(entry => entry.label === 'AC130'), lang);
    await chooseFloor(page, '2F');
    await page.locator('#facility-more-toggle').click();
    await expect(page.locator('#facility-more-panel')).toBeVisible();
    await page.locator('[data-facility-key="aed"]').click();
    await expect(page.locator('[data-facility-key="aed"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#facility-more-toggle').click();
    await page.setViewportSize({ width: 844, height: 390 });
    await noOverflow(page);
    await page.setViewportSize({ width: 393, height: 852 });
    await noOverflow(page);
    await page.locator('.site-menu-toggle').click();
    await expect(page.locator('.site-menu-panel')).toBeVisible();
    await page.locator(`.site-menu-panel a[href="${lang === 'en' ? '/en/' : '/'}"]`).click();
    await expect(page.locator('.site-menu-panel')).toBeHidden();
    // The map route has just reloaded; finish decoding before navigating away
    // again so WebKit does not report the intentionally canceled decode.
    await expect(page.locator('#canvas-layer img.floor-svg')).toBeVisible();
    await page.locator('.site-footer-link[href$="/terms/"]').click();
    await expect(page).toHaveURL(lang === 'en' ? /\/en\/terms\/$/ : /\/terms\/$/);
    // Other pages retain their ordinary opaque header and scrolling layout.
    await expect(page.locator('.site-header')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await noOverflow(page);
  });
}

for (const [orientation, viewport] of [
  ['portrait', { width: 834, height: 1194 }],
  ['landscape', { width: 1194, height: 834 }],
]) for (const lang of languages) {
  test(`MAP tablet transparent chrome and controls ${orientation} ${lang}`, async ({ page, context, isMobile, browserName }) => {
    await page.setViewportSize(viewport);
    await readyMap(page, lang);
    await expect(page.locator('.topbar')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.locator('.site-footer')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    expect(await page.locator('.topbar-bar').evaluate(el => getComputedStyle(el, '::before').backgroundColor)).toBe('rgb(255, 255, 255)');
    const edge = await page.locator('.topbar-tools').evaluate(el => {
      const rect = el.getBoundingClientRect(), rim = getComputedStyle(document.querySelector('.floor-tab-stack'), '::before');
      return { isMap: Boolean(document.elementFromPoint(innerWidth / 2, rect.bottom - 2)?.closest('#viewer')),
        pointerEvents: rim.pointerEvents, filter: rim.backdropFilter, animation: rim.animationName };
    });
    expect(edge).toEqual({ isMap: true, pointerEvents: 'none', filter: 'none', animation: 'none' });
    for (const selector of ['.site-footer-link:visible', '.site-footer-copy']) {
      for (const text of await page.locator(selector).all()) {
        await expect(text).toHaveCSS('color', 'rgb(140, 140, 140)');
        await expect(text).toHaveCSS('-webkit-text-stroke-width', '0px');
        await expect(text).toHaveCSS('text-shadow', 'none');
        await expect(text).toHaveCSS('filter', 'none');
      }
    }
    const titleBottom = await page.locator('.topbar-bar').evaluate(el => el.getBoundingClientRect().bottom);
    for (const y of [titleBottom + 10, viewport.height - 2])
      expect(await page.evaluate(y => Boolean(document.elementFromPoint(2, y)?.closest('#viewer')), y)).toBe(true);
    if (isMobile && browserName === 'chromium') {
      const cdp = await context.newCDPSession(page);
      const canvas = page.locator('#canvas-layer');
      const before = await canvas.getAttribute('style');
      const x = viewport.width / 2, y = viewport.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x - 60, y: y - 60 }, { x: x + 60, y: y + 60 }] });
      for (let step = 1; step <= 8; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 60 - step * 15, y: y - 60 - step * 15 }, { x: x + 60 + step * 15, y: y + 60 + step * 15 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect(canvas).not.toHaveAttribute('style', before);
      for (const y of [titleBottom + 10, viewport.height - 2]) {
        const zoomed = await canvas.getAttribute('style');
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 2, y }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 42, y }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await expect(canvas).not.toHaveAttribute('style', zoomed);
      }
      await cdp.detach();
    }
    await chooseFloor(page, '2F');
    await selectEntry(page, searchData.entries.find(entry => entry.label === 'AC130'), lang);
    await page.locator('.search-icon-button[data-facility-key="toilet"]').click();
    await expect(page.locator('.search-icon-button[data-facility-key="toilet"]')).toHaveAttribute('aria-pressed', 'true');
    await noOverflow(page);
    await page.locator('.site-footer-link[href$="/terms/"]').click();
    await expect(page).toHaveURL(lang === 'en' ? /\/en\/terms\/$/ : /\/terms\/$/);
  });
}

for (const [device, viewport] of [
  ['phone', { width: 393, height: 852 }],
  ['tablet portrait', { width: 834, height: 1194 }],
  ['tablet landscape', { width: 1194, height: 834 }],
  ['short landscape', { width: 844, height: 390 }],
  ['desktop', { width: 1440, height: 900 }],
]) for (const lang of languages) {
  test(`MAP floor switcher layout and keyboard ${device} ${lang}`, async ({ page, isMobile }) => {
    await page.setViewportSize(viewport);
    await readyMap(page, lang);
    const phone = device === 'phone' || device === 'short landscape';
    const dropdown = await page.locator('[data-mobile-floor-toggle]').isVisible();
    const grouped = device.startsWith('tablet');
    const connected = viewport.width >= 1240 && viewport.height >= 700;
    const settleList = async () => {
      await expect(page.locator('[data-mobile-floor-toggle]')).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('[data-mobile-floor-list]')).toHaveCSS('opacity', '1');
      await expect(page.locator('[data-mobile-floor-list]')).toHaveCSS('transform', 'none');
    };
    if (phone) await expect(page.locator('[data-mobile-floor-toggle]')).toHaveCSS('background-color', 'rgb(249, 233, 236)');
    if (dropdown) {
      await page.locator('[data-mobile-floor-toggle]').click();
      await settleList();
      await expect(page.locator('[data-mobile-floor-toggle]')).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('[data-mobile-floor-toggle]')).toHaveCSS('background-color', 'rgb(155, 27, 48)');
      await expect(page.locator('[data-mobile-floor-toggle]')).toHaveCSS('color', 'rgb(255, 255, 255)');
      await expect(page.locator('[data-mobile-floor-list]')).toHaveCSS('display', 'block');
      await expect(page.locator('[data-mobile-floor-list]')).toHaveCSS('border-radius', '22px');
    }
    const buttons = page.locator(dropdown ? '[data-mobile-floor-option]' : '.floor-tab');
    await expect(buttons).toHaveCount(7);
    for (const button of await buttons.all()) {
      await expect(button).toBeVisible();
      await expect(button).toHaveCSS('background-color', phone || grouped || connected ? 'rgba(0, 0, 0, 0)' : 'rgb(255, 255, 255)');
      const geometry = await button.evaluate(el => ({ height: el.getBoundingClientRect().height, radius: parseFloat(getComputedStyle(el).borderRadius) }));
      expect(geometry.height).toBeGreaterThanOrEqual(44);
      expect(geometry.radius).toBeGreaterThan(0);
      expect(geometry.radius).toBeLessThan(geometry.height / 2);
    }
    for (const group of await page.locator(dropdown ? '.mobile-floor-list' : '.floor-tabs').all())
      await expect(group).toHaveCSS('background-color', phone ? 'rgb(243, 243, 241)' : connected ? 'rgb(255, 255, 255)' : 'rgba(0, 0, 0, 0)');
    await expect(page.locator('.floor-tab-stack')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    if (connected) {
      const plate = await page.locator('.floor-tab-stack').evaluate(el => getComputedStyle(el, '::before').backgroundColor);
      expect(plate).toBe('rgb(255, 255, 255)');
    }
    if (grouped) {
      const row = await page.locator('.floor-tab-stack').evaluate(el => {
        const panel = el.getBoundingClientRect(), buttons = [...el.querySelectorAll('.floor-tab')].map(button => button.getBoundingClientRect());
        const style = getComputedStyle(el), plate = getComputedStyle(el, '::before'), search = document.querySelector('.search-input');
        return { plateBackground: plate.backgroundColor, plateHeight: parseFloat(plate.height), plateRadius: plate.borderRadius, searchBackground: getComputedStyle(search).backgroundColor,
          text: getComputedStyle(el.querySelector('.floor-tab:not(.is-active)')).color, placeholder: getComputedStyle(search, '::placeholder').color,
          containsAll: buttons.every(button => button.left >= panel.left && button.right <= panel.right && button.top >= panel.top && button.bottom <= panel.bottom), sameRow: Math.max(...buttons.map(button => button.top)) - Math.min(...buttons.map(button => button.top)), panelHeight: panel.height,
          paddingTop: style.paddingTop, paddingBottom: style.paddingBottom, fontSize: getComputedStyle(el.querySelector('.floor-tab')).fontSize };
      });
      expect(row.containsAll).toBe(true);
      expect(row.sameRow).toBeLessThan(1);
      expect(row.panelHeight).toBe(44);
      expect(row.plateHeight).toBe(36);
      expect(row.plateRadius).toBe('8px');
      expect(row.plateBackground).toBe('rgb(255, 255, 255)');
      expect(row.searchBackground).toBe('rgb(243, 243, 241)');
      expect(row.text).toBe(row.placeholder);
      expect(row.text).toBe('rgb(140, 140, 140)');
      expect(row.paddingTop).toBe('0px');
      expect(row.paddingBottom).toBe('0px');
      expect(row.fontSize).toBe('20px');
    }
    const boxes = await buttons.evaluateAll(nodes => nodes.slice(0, 2).map(el => el.getBoundingClientRect().toJSON()));
    expect(Math.max(boxes[1].left - boxes[0].right, boxes[1].top - boxes[0].bottom)).toBeGreaterThanOrEqual(phone ? 0 : 7);
    const floor = id => page.locator(`${dropdown ? '[data-mobile-floor-option]' : '.floor-tab'}[data-floor="${id}"]`);
    await floor('2F').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.floor-tab[data-floor="2F"]')).toHaveAttribute('aria-pressed', 'true');
    if (dropdown) { await page.locator('[data-mobile-floor-toggle]').press('Enter'); await settleList(); }
    await floor('3F').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('.floor-tab[data-floor="3F"]')).toHaveAttribute('aria-pressed', 'true');
    if (dropdown) { await page.locator('[data-mobile-floor-toggle]').click(); await settleList(); }
    if (isMobile) await floor('1F').tap();
    else await floor('1F').click();
    await expect(page.locator('.floor-tab[data-floor="1F"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator(dropdown ? '[data-mobile-floor-toggle]' : '.floor-tab[data-floor="1F"]')).toHaveCSS('color', 'rgb(155, 27, 48)');
    if (dropdown) {
      await page.locator('[data-mobile-floor-toggle]').press('Enter');
      await settleList();
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-mobile-floor-toggle]')).toBeFocused();
      await expect(page.locator('[data-mobile-floor-list]')).toBeHidden();
      await page.locator('[data-mobile-floor-toggle]').click();
      await settleList();
      const lastOption = page.locator('[data-mobile-floor-option]').last();
      const lastId = await lastOption.getAttribute('data-floor');
      if (isMobile) {
        // The existing document touch guard intentionally suppresses taps
        // within 320ms. This case verifies ordinary selection, not double taps.
        await page.waitForTimeout(350);
        await lastOption.tap();
      } else await lastOption.click();
      await expect(page.locator(`.floor-tab[data-floor="${lastId}"]`)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('[data-mobile-floor-toggle]')).toHaveAttribute('aria-expanded', 'false');
      await page.locator('[data-mobile-floor-toggle]').click();
      await settleList();
      await page.locator('#viewer').click({ position: { x: 2, y: page.viewportSize().height - 10 } });
      await expect(page.locator('[data-mobile-floor-list]')).toBeHidden();
    }
    await noOverflow(page);
  });
}

for (const lang of languages) {
  test(`MAP toolbar stays clear and floor panel follows orientation and breakpoint boundaries ${lang}`, async ({ page }) => {
    await readyMap(page, lang);
    for (const [width, height, grouped] of [
      [393, 852, false], [852, 393, false], [932, 430, false],
      [720, 900, false], [721, 900, true],
      [844, 520, false], [844, 521, true],
      [834, 1194, true], [1194, 834, true],
    ]) {
      await page.setViewportSize({ width, height });
      const surface = () => page.locator('.topbar-tools').evaluate(el => {
        const style = getComputedStyle(el, '::before'), rim = getComputedStyle(el, '::after');
        return { background: style.backgroundColor, blur: style.backdropFilter,
          shadow: style.boxShadow, mask: style.maskImage, rim: rim.content };
      });
      // Resize/media-query updates can land after setViewportSize resolves.
      await expect.poll(surface, { message: `${width}x${height}` }).toMatchObject({
        background: 'rgba(0, 0, 0, 0)', blur: 'none',
        shadow: 'none', rim: 'none', mask: 'none',
      });
      const floorPanel = () => page.locator('.floor-tab-stack').evaluate(el => { const style = getComputedStyle(el, '::before'); return { content: style.content, background: style.backgroundColor, blur: style.backdropFilter }; });
      await expect.poll(floorPanel).toMatchObject({ content: grouped ? '""' : 'none', background: grouped ? 'rgb(255, 255, 255)' : 'rgba(0, 0, 0, 0)', blur: 'none' });
      if (!grouped) await expect(page.locator('[data-mobile-floor-toggle]')).toHaveCSS('background-color', 'rgb(249, 233, 236)');
      expect(await page.locator('.topbar-bar').evaluate(el => getComputedStyle(el, '::before').backgroundColor)).toBe('rgb(255, 255, 255)');
      await expect(page.locator('.site-footer')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await noOverflow(page);
    }
  });
}
