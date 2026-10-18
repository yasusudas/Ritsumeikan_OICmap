import { readFileSync } from 'node:fs';
import { test, expect, publicRoutes, routes, goto, noOverflow, withinViewport, openMenu, screenshot, clickExternal, layoutEvidence } from './helpers.js';

for (const path of publicRoutes) {
  test(`PAGES access, dialogs, language and links ${path}`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await goto(page, path);
    await expect(page).toHaveURL(new RegExp(`${path.replaceAll('/', '\\/')}$`));
    await expect(page.locator('html')).toHaveAttribute('lang', path.startsWith('/en/') ? 'en' : 'ja');
    if (/sources\//.test(path)) {
      await expect(page.locator('[data-sources-food] .sources-place').first()).toBeVisible();
      await expect(page.locator('[data-sources-timetable] a').first()).toBeVisible();
    }
    if (/access\//.test(path)) {
      await expect(page.locator('.access-map img')).toBeVisible();
      expect(await page.locator('.access-map img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
      await expect(page.locator('a[href^="tel:"]')).toHaveAttribute('href', path.startsWith('/en/') ? 'tel:+81-72-665-2020' : 'tel:072-665-2020');
    }
    await noOverflow(page);
    const hasMenu = await page.locator('.site-menu-toggle').isVisible();
    if (hasMenu) {
      await openMenu(page);
      await page.keyboard.press('Escape');
      await expect(page.locator('.site-menu-panel')).toBeHidden();
      await openMenu(page);
      const menuBox = await page.locator('.site-menu-panel').boundingBox();
      await page.mouse.click(5, Math.min(page.viewportSize().height - 5, menuBox.y + menuBox.height + 15));
      await expect(page.locator('.site-menu-panel')).toBeHidden();
    }
    for (const kind of ['about', 'contact']) {
      for (const source of ['menu', 'footer']) {
        if (source === 'menu' && !hasMenu) continue;
        if (source === 'footer' && ['/', '/en/'].includes(path) && page.viewportSize().width <= 820) {
          // The map deliberately moves footer actions into the menu at this breakpoint.
          await expect(page.locator('.site-footer')).toBeHidden();
          continue;
        }
        if (source === 'menu') await openMenu(page);
        const opener = source === 'menu'
          ? page.locator(`.site-menu-panel [data-dialog="${kind}"], #${kind === 'about' ? 'about' : 'contact-form'}-menu-button`)
          : page.locator(`.site-footer [data-dialog="${kind}"]`);
        await opener.click();
        const id = kind === 'about' ? 'about' : 'contact-form';
        await expect(page.locator(`#${id}-dialog`)).toBeVisible();
        await withinViewport(page.locator(`#${id}-dialog .about-dialog`));
        if (kind === 'contact') await expect(page.locator('#contact-form-frame')).toHaveAttribute('src', /embedded=true/);
        if (source === 'menu') await page.locator(`#${id}-dialog-close`).click();
        else await page.keyboard.press('Escape');
        await expect(page.locator(`#${id}-dialog`)).toBeHidden();
      }
    }
    // Follow every global menu route, then return, so responsive hidden desktop navigation
    // does not accidentally replace testing the mobile menu.
    const nav = hasMenu ? '.site-menu-panel' : '.site-nav';
    const links = await page.locator(`${nav} a[href^="/"]`).evaluateAll(nodes => [...new Set(nodes.map(n => n.getAttribute('href')))]);
    for (const href of links) {
      if (hasMenu) await openMenu(page);
      await page.locator(`${nav} a[href="${href}"]`).first().click();
      await expect(page).toHaveURL(new RegExp(`${href.replaceAll('/', '\\/')}$`));
      await expect(page.locator('h1').first()).toBeVisible();
      await goto(page, path);
    }
    const otherLang = path.startsWith('/en/') ? 'ja' : 'en';
    const option = page.locator(`[data-legal-lang-option="${otherLang}"], [data-lang-option="${otherLang}"]`);
    await option.click();
    const nextPath = otherLang === 'en' ? `/en${path}` : path.replace(/^\/en/, '');
    await expect(page).toHaveURL(new RegExp(`${nextPath.replaceAll('/', '\\/')}$`));
    await expect(page.locator('html')).toHaveAttribute('lang', otherLang);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', otherLang);
    await screenshot(page, testInfo, `page-${path.replaceAll('/', '-')}`);
  });
}

// Catch a newly added page that would otherwise silently be omitted from this suite.
test('INVENTORY every build entry has an explicit route test', async () => {
  const config = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');
  const discovered = [...config.matchAll(/resolve\(__dirname, '([^']*index\.html)'\)/g)]
    .map(([, file]) => `/${file.replace(/index\.html$/, '')}`);
  expect(discovered.sort()).toEqual([...routes].sort());
});

for (const width of [320, 375, 390, 720, 721, 768, 820, 821, 1024, 1239, 1240, 1440, 1920]) {
  test(`RESPONSIVE all public pages width ${width}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Viewport matrix runs once; all behavior tests also run in a touch context.');
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: width <= 720 ? 844 : 900 });
    for (const path of publicRoutes) {
      await test.step(path, async () => {
        await goto(page, path);
        await noOverflow(page, true);
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) {
          await testInfo.attach(`overflow-${path.replaceAll('/', '-')}`, { body: JSON.stringify(await layoutEvidence(page)), contentType: 'application/json' });
          await screenshot(page, testInfo, `overflow-${path.replaceAll('/', '-')}`);
        }
        await withinViewport(page.locator('[data-lang-toggle], [data-legal-lang-toggle]'));
        if (await page.locator('.site-menu-toggle').isVisible()) {
          await withinViewport(page.locator('.site-menu-toggle'));
          await openMenu(page);
          await withinViewport(page.locator('.site-menu-panel'));
          await page.keyboard.press('Escape');
        } else await withinViewport(page.locator('.site-nav'));
        if (path === '/' || path === '/en/') {
          await withinViewport(page.locator('#search-input'));
          if (width <= 720) await expect(page.locator('[data-mobile-floor-toggle]')).toBeVisible();
          else await expect(page.locator('.floor-tabs-primary')).toBeVisible();
        }
      });
    }
    await screenshot(page, testInfo, `responsive-${width}`);
  });
}

test('LINKS external footer destination opens an isolated new tab', async ({ page }) => {
  await goto(page, '/access/');
  await clickExternal(page, page.locator('.site-footer a[target="_blank"]'));
});

test('PAGES legacy migration notice preserves query/hash and opens the fixed new origin', async ({ page }) => {
  await goto(page, '/legacy-moved.html?from=e2e#AC130');
  const link = page.locator('#migration-link');
  await expect(link).toHaveAttribute('href', 'https://rits-oic-map.app/?from=e2e&oicmap_migrated=1#AC130');
  await noOverflow(page);
  await link.click();
  await expect(page).toHaveURL('https://rits-oic-map.app/?from=e2e&oicmap_migrated=1#AC130');
  await expect(page).toHaveTitle('E2E external destination');
});

test('LINKS all legal, access and source body links and dialog backgrounds', async ({ page }) => {
  test.setTimeout(180_000);
  for (const path of publicRoutes.filter(path => /\/(sources|terms|privacy|access)\/$/.test(path))) {
    await goto(page, path);
    if (path.includes('sources')) await expect(page.locator('[data-sources-food] a').first()).toBeAttached();
    const external = page.locator('main a[target="_blank"]');
    for (let i = 0; i < await external.count(); i++) await clickExternal(page, external.nth(i));
    for (const kind of ['about', 'contact']) {
      await page.locator(`.site-footer [data-dialog="${kind}"]`).click();
      const backdrop = page.locator(kind === 'about' ? '#about-dialog' : '#contact-form-dialog');
      await expect(backdrop).toBeVisible();
      await backdrop.click({ position: { x: 2, y: 2 } });
      await expect(backdrop).toBeHidden();
    }
  }
});

test('PAGES legal anchors, footer links and skip links', async ({ page }) => {
  for (const path of ['/access/', '/food/', '/timetable/', '/terms/', '/privacy/', '/sources/']) {
    await goto(page, path);
    // Keyboard entry exercises the normally off-screen skip link.
    await page.keyboard.press('Tab');
    await expect(page.locator('.skip-link')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main$/);
    const anchors = await page.locator('main a[href^="#"]').evaluateAll(nodes => nodes.map(n => n.getAttribute('href')));
    for (const href of anchors) {
      await page.locator(`main a[href="${href}"]`).first().click();
      await expect(page.locator(href)).toBeAttached();
      expect(new URL(page.url()).hash).toBe(href);
    }
    const footer = await page.locator('.site-footer a[href^="/"]').evaluateAll(nodes => nodes.map(n => n.getAttribute('href')));
    for (const href of footer) {
      await page.locator(`.site-footer a[href="${href}"]`).first().click();
      expect(new URL(page.url()).pathname).toBe(href);
      await goto(page, path);
    }
  }
});
