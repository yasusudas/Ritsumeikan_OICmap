import { test, expect, timetableData, goto, clickExternal, screenshot, noOverflow } from './helpers.js';

test('TIMETABLE every train card expands, cancels hide, hides and restores', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await goto(page, '/timetable/');
  await expect(page.locator('.timetable-card')).toHaveCount(timetableData.cards.length);
  for (const item of timetableData.cards) {
    await test.step(item.id, async () => {
      const card = page.locator(`[data-card-id="${item.id}"]`);
      await expect(card.locator('[data-next-departure-time]')).toHaveText(/\d{1,2}:\d{2}/);
      await expect(card.locator('[data-next-countdown]')).not.toBeEmpty();
      await card.locator('.timetable-all-toggle').click();
      await expect(card.locator('.timetable-all-toggle')).toHaveAttribute('aria-expanded', 'true');
      await expect(card.locator('.timetable-all-sheet')).toBeVisible();
      await expect(card.locator('.timetable-hour-list')).not.toBeEmpty();
      await card.locator('.timetable-all-toggle').click();
      await expect(card.locator('.timetable-all-sheet')).toBeHidden();
      await card.locator('[data-hide-card]').click();
      await expect(page.locator('[data-hide-dialog]')).toBeVisible();
      await page.locator('[data-hide-dialog] [value="cancel"]').click();
      await expect(card).toBeVisible();
      await card.locator('[data-hide-card]').click();
      await page.locator('[data-hide-dialog] [value="hide"]').click();
      await expect(card).toHaveCount(0);
      await expect(page.locator('[data-hidden-count]')).toHaveText('1件');
      await page.reload();
      await expect(card).toHaveCount(0);
      await expect(page.locator(`[data-restore-card="${item.id}"]`)).toBeVisible();
      await page.locator(`[data-restore-card="${item.id}"]`).click();
      await expect(card).toBeVisible();
      await expect(page.locator('[data-hidden-count]')).toHaveText('0件');
    });
  }
  await screenshot(page, testInfo, 'timetable-restored');
});

test('TIMETABLE hide all, empty state, show all, drag order and reset persist', async ({ page }) => {
  test.setTimeout(120_000);
  await goto(page, '/timetable/');
  const cards = page.locator('.timetable-card');
  await expect(cards).toHaveCount(timetableData.cards.length);
  const first = timetableData.cards[0].id;
  const second = timetableData.cards[1].id;
  const from = page.locator(`[data-card-id="${first}"] .timetable-card-header`);
  const to = page.locator(`[data-card-id="${second}"]`);
  await from.scrollIntoViewIfNeeded();
  const a = await from.boundingBox(), b = await to.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * .8, b.y + b.height * .8, { steps: 20 });
  await page.mouse.up();
  await expect(cards.first()).toHaveAttribute('data-card-id', second);
  await page.reload();
  await expect(cards.first()).toHaveAttribute('data-card-id', second);
  await page.locator('[data-reset-layout]').click();
  await expect(cards.first()).toHaveAttribute('data-card-id', first);
  for (const item of timetableData.cards) {
    await page.locator(`[data-hide-card="${item.id}"]`).click();
    await page.locator('[data-hide-dialog] [value="hide"]').click();
    await expect(page.locator(`[data-card-id="${item.id}"]`)).toHaveCount(0);
  }
  await expect(cards).toHaveCount(0);
  await expect(page.locator('[data-card-grid]')).toContainText('非表示');
  await page.locator('[data-show-all]').click();
  await expect(cards).toHaveCount(timetableData.cards.length);
  await expect(page.locator('[data-show-all]')).toBeDisabled();
  await page.reload();
  await expect(cards.first()).toHaveAttribute('data-card-id', first);
});

for (const date of ['2026-10-19T03:00:00Z', '2026-10-18T03:00:00Z', '2026-11-03T03:00:00Z', '2026-10-19T14:59:50Z']) {
  test(`TIMETABLE weekday/weekend/holiday/midnight ${date}`, async ({ page }) => {
    await page.clock.setFixedTime(new Date(date));
    await goto(page, '/timetable/');
    await expect(page.locator('.timetable-card')).toHaveCount(timetableData.cards.length);
    const holiday = date.startsWith('2026-10-18') || date.startsWith('2026-11-03');
    for (const card of timetableData.cards) {
      await expect(page.locator(`[data-card-id="${card.id}"]`)).toHaveAttribute('data-active-schedule-id', new RegExp(holiday ? 'holiday' : 'weekday'));
    }
    await expect(page.locator('[data-shuttle-next]').first()).not.toBeEmpty();
    await noOverflow(page);
  });
}

test('TIMETABLE English official cards and all rail/shuttle reference links', async ({ page }) => {
  test.setTimeout(180_000);
  for (const path of ['/en/timetable/', '/timetable/']) {
    await goto(page, path);
    await expect(page.locator('[data-shuttle-next]').first()).not.toBeEmpty();
    if (path.startsWith('/en')) await expect(page.locator('[data-official-card-grid]')).not.toBeEmpty();
    const links = page.locator('main a[target="_blank"]');
    expect(await links.count()).toBeGreaterThan(5);
    for (let i = 0; i < await links.count(); i++) await clickExternal(page, links.nth(i));
  }
});
