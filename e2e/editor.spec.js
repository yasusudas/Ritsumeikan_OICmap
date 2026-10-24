import { test, expect, goto, noOverflow, chooseFloor, floors, screenshot } from './helpers.js';

const authKey = 'rits-oic-map-editor-auth-v1';
const draftKey = 'campus-map-manual-draft-v5';
const publishKey = 'campus-map-manual-published-v5';
const seed = {
  version: 5,
  entries: [{ id: 'e2e-room', floorId: '1F', label: 'E2E ROOM', aliases: [], rects: [{ xRatio: .5, yRatio: .5, widthRatio: .001, heightRatio: .001 }], polygons: [] }],
  // The editor deliberately ignores stored drafts with no rings when deployed rings exist.
  facilityRings: [{ id: 'e2e-seed-ring', floorId: '1F', facilityKey: 'aed', xRatio: .2, yRatio: .2 }],
};

async function authenticatedEditor(page) {
  // Explicit test-only auth fixture. No real password or user storage is used.
  await goto(page, '/editor/login/');
  await page.evaluate(key => sessionStorage.setItem(key, 'granted'), authKey);
  await goto(page, '/editor/');
  await expect(page.locator('#editor-json')).not.toHaveValue('');
  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('#editor-import').click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: 'e2e-fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await expect(page.locator('#editor-list .editor-entry')).toHaveCount(1);
}
async function payload(page) {
  await expect(page.locator('#editor-json')).not.toHaveValue('');
  return JSON.parse(await page.locator('#editor-json').inputValue());
}
async function mapPoint(page, x = .55, y = .55) {
  await page.locator('#viewer').scrollIntoViewIfNeeded();
  await expect(page.locator('#canvas-layer img.floor-svg')).toBeVisible();
  // A focused ring leaves the camera zoomed across floor switches. Click the
  // visible map, rather than an off-screen fraction of the enlarged canvas.
  const box = await page.locator('#canvas-layer').boundingBox();
  const viewer = await page.locator('#viewer').boundingBox();
  const viewport = page.viewportSize();
  const left = Math.max(box.x, viewer.x, 0) + 12;
  const top = Math.max(box.y, viewer.y, 0) + 12;
  const right = Math.min(box.x + box.width, viewer.x + viewer.width, viewport.width) - 12;
  const bottom = Math.min(box.y + box.height, viewer.y + viewer.height, viewport.height) - 12;
  expect(right).toBeGreaterThan(left);
  expect(bottom).toBeGreaterThan(top);
  const point = { x: left + (right - left) * x, y: top + (bottom - top) * y };
  expect(await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('#viewer')), point)).toBe(true);
  await page.mouse.click(point.x, point.y);
}

test('EDITOR login guard, invalid/empty password, return and logout', async ({ page }) => {
  await page.goto('/editor/?e2e=1#AC130');
  await expect(page).toHaveURL(/\/editor\/login\/\?next=/);
  expect(new URL(page.url()).searchParams.get('next')).toBe('/editor/?e2e=1#AC130');
  await page.locator('#editor-login-submit').click();
  expect(await page.locator('#editor-login-password').evaluate(input => input.validity.valueMissing)).toBe(true);
  await page.locator('#editor-login-password').fill('invalid-e2e-password');
  await page.locator('#editor-login-submit').click();
  await expect(page.locator('#editor-login-error')).not.toBeEmpty();
  await expect(page.locator('#editor-login-submit')).toBeEnabled();
  await page.locator('a[href="/"]').click();
  await expect(page.locator('#viewer')).toBeVisible();
  await expect(page.locator('#canvas-layer img.floor-svg')).toBeVisible();
  await authenticatedEditor(page);
  await page.locator('#editor-logout-button').click();
  await expect(page).toHaveURL(/\/editor\/login\//);
  expect(await page.evaluate(key => sessionStorage.getItem(key), authKey)).toBeNull();
});

test('EDITOR login language toggle preserves the login route', async ({ page }, testInfo) => {
  const route = '/editor/login/?next=%2Feditor%2F#AC130';
  await goto(page, route);
  await page.locator('[data-lang-toggle]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page).toHaveURL(new URL(route, page.url()).href);
  await expect(page.locator('#editor-login-password')).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#editor-login-password')).toBeVisible();
  await noOverflow(page);
  await screenshot(page, testInfo, 'verified-editor-login-en');
  await page.locator('[data-lang-toggle]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page).toHaveURL(new URL(route, page.url()).href);
});

test('EDITOR authenticated language toggle preserves the editor and draft', async ({ page, isMobile }, testInfo) => {
  await authenticatedEditor(page);
  const before = await payload(page);
  await page.locator('[data-lang-toggle]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page).toHaveURL(/\/editor\/$/);
  expect(await payload(page)).toEqual(before);
  await expect(page.locator('#editor-label')).toBeVisible();
  const viewport = page.viewportSize();
  for (const width of isMobile ? [320, viewport.width] : [viewport.width]) {
    await page.setViewportSize({ ...viewport, width });
    await noOverflow(page);
  }
  await screenshot(page, testInfo, 'verified-editor-session-en');
  await page.locator('[data-lang-toggle]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page).toHaveURL(/\/editor\/$/);
  expect(await payload(page)).toEqual(before);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect.poll(() => payload(page)).toEqual(before);
  await noOverflow(page);
});

test('EDITOR real password login when explicitly configured', async ({ page }) => {
  test.skip(!process.env.E2E_EDITOR_PASSWORD, 'Set E2E_EDITOR_PASSWORD to verify real credentials; other editor tests use an isolated session fixture.');
  await goto(page, '/editor/login/?next=/editor/');
  await page.locator('#editor-login-password').fill(process.env.E2E_EDITOR_PASSWORD);
  await page.locator('#editor-login-submit').click();
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('#editor-json')).not.toHaveValue('');
});

test('EDITOR add, focus, delete, clear, JSON import/export/copy and local publish', async ({ page }) => {
  test.setTimeout(120_000);
  await authenticatedEditor(page);
  // Clipboard writes use a test double so the user's macOS clipboard is preserved.
  await page.evaluate(() => {
    window.__e2eClipboard = '';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__e2eClipboard = value; } } });
  });
  await page.locator('#editor-save').click();
  await expect(page.locator('#editor-label')).toBeFocused();
  await page.locator('#editor-label').fill('E2E ADDED');
  await mapPoint(page);
  await expect(page.locator('.editor-pending-dot')).toBeAttached();
  await page.locator('#editor-clear-point').click();
  await expect(page.locator('.editor-pending-dot')).toHaveCount(0);
  await mapPoint(page);
  await page.locator('#editor-save').click();
  expect((await payload(page)).entries.map(e => e.label)).toContain('E2E ADDED');
  await page.reload();
  await expect(page.locator('#editor-json')).not.toHaveValue('');
  await expect.poll(async () => (await payload(page)).entries.length).toBe(2);
  const added = (await payload(page)).entries.find(e => e.label === 'E2E ADDED');
  await page.locator(`#editor-list [data-action="focus"][data-entry-id="${added.id}"]`).click();
  await expect(page.locator('.search-highlight-pin')).toBeAttached();
  // Reapply after reload; clipboard API mock is per document.
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__e2eClipboard = value; } } }));
  await page.locator('#editor-copy').click();
  expect(JSON.parse(await page.evaluate(() => window.__e2eClipboard)).entries).toHaveLength(2);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#editor-export').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('manual-search-index.json');
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  expect(JSON.parse(Buffer.concat(chunks).toString()).entries).toHaveLength(2);
  await page.locator('#editor-publish').click();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).entries.length, publishKey)).toBe(2);
  await page.locator(`#editor-list [data-action="delete"][data-entry-id="${added.id}"]`).click();
  expect((await payload(page)).entries).toHaveLength(1);
  // A malformed import must leave the existing data intact.
  await page.locator('#editor-import-input').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{bad json') });
  await expect(page.locator('#editor-feedback')).toContainText(/失敗|Failed/i);
  expect((await payload(page)).entries).toHaveLength(1);
  await noOverflow(page);
});

test('EDITOR every ring type/color and polygon create/edit/undo/cancel/delete', async ({ page }) => {
  test.setTimeout(120_000);
  await authenticatedEditor(page);
  const buttons = page.locator('.editor-ring-mode-button');
  const keys = await buttons.evaluateAll(nodes => nodes.map(n => n.dataset.facilityKey));
  for (const key of keys) {
    await page.locator(`.editor-ring-mode-button[data-facility-key="${key}"]`).click();
    await expect(page.locator(`.editor-ring-mode-button[data-facility-key="${key}"]`)).toHaveAttribute('aria-pressed', 'true');
    if (key === 'toilet') {
      for (const color of ['red', 'blue', 'yellow']) {
        await page.locator(`[data-ring-color-variant="${color}"]`).click();
        await mapPoint(page, .4 + ['red', 'blue', 'yellow'].indexOf(color) * .08, .4);
        expect((await payload(page)).facilityRings.some(r => r.facilityKey === 'toilet' && r.colorVariant === color)).toBe(true);
      }
    } else {
      await mapPoint(page, .6, .6);
      expect((await payload(page)).facilityRings.some(r => r.facilityKey === key && r.id !== 'e2e-seed-ring')).toBe(true);
    }
    const ring = (await payload(page)).facilityRings.find(r => r.facilityKey === key && r.id !== 'e2e-seed-ring');
    await page.locator(`#editor-ring-list [data-action="focus-ring"][data-ring-id="${ring.id}"]`).click();
    await expect(page.locator('.editor-ring-button.is-active')).toBeAttached();
    await page.locator(`#editor-ring-list [data-action="delete-ring"][data-ring-id="${ring.id}"]`).click();
    expect((await payload(page)).facilityRings.some(r => r.id === ring.id)).toBe(false);
    await page.locator(`.editor-ring-mode-button[data-facility-key="${key}"]`).click();
    // The mobile chooser deliberately ignores selecting the already-active floor.
    await chooseFloor(page, '2F');
    await chooseFloor(page, '1F');
  }
  await page.locator('#editor-area-entry').selectOption('e2e-room');
  await page.locator('#editor-area-new').click();
  await expect(page.locator('#editor-area-cancel')).toBeEnabled();
  await expect(page.locator('#editor-area-save')).toBeDisabled();
  await mapPoint(page, .45, .45);
  await mapPoint(page, .55, .45);
  await page.locator('#editor-area-undo').click();
  await expect(page.locator('#editor-area-save')).toBeDisabled();
  await mapPoint(page, .55, .45);
  await mapPoint(page, .55, .50);
  await mapPoint(page, .50, .50);
  await mapPoint(page, .50, .55);
  await mapPoint(page, .45, .55);
  await expect(page.locator('.editor-area-vertex')).toHaveCount(6);
  await page.locator('#editor-area-save').click();
  expect((await payload(page)).entries[0].polygons).toHaveLength(1);
  const beforeDrag = (await payload(page)).entries[0].polygons[0];
  await page.locator('[data-action="edit-area"]').click();
  await expect(page.locator('#editor-area-cancel')).toBeEnabled();
  const vertex = page.locator('.editor-area-vertex').first();
  // Scrolling the stable viewer avoids holding a vertex that is replaced on resize.
  await page.locator('#viewer').scrollIntoViewIfNeeded();
  await vertex.hover();
  const box = await vertex.boundingBox();
  const canvas = await page.locator('#canvas-layer').boundingBox();
  // Vertices snap to one of the two intersections formed by their neighbours.
  // Cross the midpoint to the other intersection, beyond the snap-back region.
  const alternate = { x: beforeDrag[1].xRatio, y: beforeDrag.at(-1).yRatio };
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * alternate.x, canvas.y + canvas.height * alternate.y, { steps: 6 });
  await page.mouse.up();
  await page.locator('#editor-area-save').click();
  expect((await payload(page)).entries[0].polygons).toHaveLength(1);
  expect((await payload(page)).entries[0].polygons[0]).not.toEqual(beforeDrag);
  await page.locator('[data-action="edit-area"]').click();
  await page.locator('#editor-area-cancel').click();
  expect((await payload(page)).entries[0].polygons).toHaveLength(1);
  await page.locator('[data-action="delete-area"]').click();
  expect((await payload(page)).entries[0].polygons || []).toHaveLength(0);
});

test('EDITOR controls floors, search, facility toolbar and hidden placeholders', async ({ page }) => {
  await authenticatedEditor(page);
  for (const floor of floors) await chooseFloor(page, floor);
  await chooseFloor(page, '1F');
  await page.locator('#search-input').fill('E2E ROOM');
  await page.locator('.search-result').click();
  await expect(page.locator('.search-highlight-pin')).toBeAttached();
  await page.locator('#search-clear').click();
  await expect(page.locator('.search-highlight-pin')).toHaveCount(0);
  const filters = page.locator('.search-icon-button');
  for (let i = 0; i < await filters.count(); i++) {
    await filters.nth(i).click();
    await expect(filters.nth(i)).toHaveAttribute('aria-pressed', 'true');
    await filters.nth(i).click();
    await expect(filters.nth(i)).toHaveAttribute('aria-pressed', 'false');
  }
  for (const button of await page.locator('.mobile-quick-action').all()) await expect(button).toBeHidden();
  await noOverflow(page);
});
