import { readFileSync } from 'node:fs';
import { test, expect, readyMap, chooseFloor, facilityButton, searchData, languages, floors, foodData, facilities, selectEntry, screenshot, mapPath, fixedDate } from './helpers.js';
import { readRegistrationReference, auditRenderedRings, auditSearchOutlines, auditFacilityAreas } from './floor-registration-browser.js';

const pictograms = JSON.parse(readFileSync(new URL('../src/assets/facility-ring-offsets.json', import.meta.url)));
const camera = page => page.locator('#canvas-layer').evaluate(n => ({ width: n.style.width, height: n.style.height, transform: n.style.transform }));
const ordinaryFloors = ['1F', '2F', '3F', '4F', '5F'];
function ringReference(ring, language) {
  const table = pictograms[ring.floorId], color = ring.facilityKey === 'toilet' ? ring.colorVariant : 'red';
  const candidates = table.points[ring.facilityKey][color];
  const nearest = candidates.reduce((a, b) => Math.hypot((b[0] - ring.xRatio) * table.viewBox[2], (b[1] - ring.yRatio) * table.viewBox[3]) < Math.hypot((a[0] - ring.xRatio) * table.viewBox[2], (a[1] - ring.yRatio) * table.viewBox[3]) ? b : a);
  return { id: ring.id, source: [nearest[0] + (language === 'en' ? nearest[2] : 0), nearest[1] + (language === 'en' ? nearest[3] : 0)], diameter: nearest[language === 'en' ? 5 : 4] };
}

async function strokePixels(page, selector) {
  await page.locator(selector).first().evaluate(node => Promise.all(node.ownerSVGElement.getAnimations().map(a => a.finished.catch(() => {}))));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  let probe;
  await expect.poll(async () => {
    probe = await page.evaluate(selector => {
    for (const node of document.querySelectorAll(selector)) {
      if (node.closest('defs')) continue;
      const svg = node.ownerSVGElement, region = node.closest('[data-alignment-region]');
      const first = node.tagName === 'circle' ? { x: node.cx.baseVal.value, y: node.cy.baseVal.value } : node.points.getItem(0);
      const [vx, vy, vw, vh] = svg.getAttribute('viewBox').split(/[ ,]+/).map(Number);
      const clipContains = group => {
        const id = group.querySelector('[clip-path]').getAttribute('clip-path').slice(5, -1);
        const p = [...document.getElementById(id).querySelector('path').getAttribute('d').matchAll(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi)].map(m => Number(m[0]));
        return first.x >= p[0] && first.y >= p[1] && first.x <= p[2] && first.y <= p[3];
      };
      if (region ? !clipContains(region) : [...svg.querySelectorAll('[data-alignment-region]')].some(clipContains)) continue;
      const r = node.getBoundingClientRect(), margin = innerWidth < 720 ? 15 : 170;
      if (r.width < 2 || r.height < 2 || r.x < margin || r.right > innerWidth - (innerWidth < 720 ? 15 : 70) || r.y < (innerWidth < 720 ? 200 : 155) || r.bottom > innerHeight - 45) continue;
      const rgb = getComputedStyle(node).stroke.match(/[\d.]+/g)?.slice(0, 3).map(Number);
      if (!rgb) continue;
      const x = Math.floor(r.x - 5), y = Math.floor(r.y - 5);
      return { rgb, clip: { x, y, width: Math.ceil(r.right + 5) - x, height: Math.ceil(r.bottom + 5) - y } };
    }
    return null;
    }, selector);
    return probe;
  }, { message: 'A directly rendered stroke must be visible in the map viewport' }).not.toBeNull();
  const png = await page.screenshot({ clip: probe.clip, animations: 'disabled' });
  const count = await page.evaluate(async ({ source, rgb }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + source; await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, img.width, img.height).data;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4) if (rgb.every((value, axis) => Math.abs(pixels[i + axis] - value) < 12)) count++;
    return count;
  }, { source: png.toString('base64'), rgb: probe.rgb });
  expect(count, JSON.stringify({ message: 'The native browser screenshot must contain the requested stroke colour', selector, probe, count })).toBeGreaterThan(2);
  return count;
}

for (const language of languages) {
  test(`MAP all floor rings and search outlines register to the served SVG ${language}`, async ({ page }, testInfo) => {
    test.setTimeout(300_000);
    await readyMap(page, language);
    const report = { language, project: testInfo.project.name, floors: [], cameraSwitches: 0 };
    // User search, followed by a full round trip at the settled magnification.
    const ac130 = searchData.entries.find(e => e.label === 'AC130');
    await selectEntry(page, ac130, language);
    await expect.poll(() => page.locator('#canvas-layer').evaluate(n => !n.style.transform.includes('scale('))).toBe(true);
    const initial = await camera(page);
    for (const floor of [...ordinaryFloors.slice(1), '1F', '5F', '2F', '1F']) {
      await chooseFloor(page, floor);
      await expect(page.locator('#canvas-layer')).toHaveAttribute('data-floor-id', floor);
      await expect.poll(() => camera(page)).toEqual(initial);
      report.cameraSwitches++;
    }
    for (const floor of floors) {
      await chooseFloor(page, floor);
      await expect(page.locator('#canvas-layer')).toHaveAttribute('data-floor-id', floor);
      const firstLift = searchData.facilityRings.find(r => r.floorId === floor && r.facilityKey === 'elevator');
      const near = searchData.entries.filter(e => e.floorId === floor && e.outlines?.length).sort((a, b) => Math.hypot(a.rects[0].xRatio - firstLift.xRatio, a.rects[0].yRatio - firstLift.yRatio) - Math.hypot(b.rects[0].xRatio - firstLift.xRatio, b.rects[0].yRatio - firstLift.yRatio))[0];
      await selectEntry(page, near, language);
      const reference = await page.evaluate(readRegistrationReference);
      const row = { floor, rings: [], outlines: null };
      const sourceRings = searchData.facilityRings.filter(r => r.floorId === floor);
      for (const key of [...new Set(sourceRings.map(r => r.facilityKey === 'escalator' ? 'stairs' : r.facilityKey))]) {
        const button = await facilityButton(page, key);
        await button.click();
        const selected = sourceRings.filter(r => r.facilityKey === key || key === 'stairs' && r.facilityKey === 'escalator');
        await expect(page.locator('.facility-ring:not([data-registration-copy])')).toHaveCount(selected.length);
        const audit = await page.evaluate(auditRenderedRings, { reference, rings: selected.map(r => ringReference(r, language)) });
        expect(audit.errors, JSON.stringify({ floor, key, audit })).toEqual([]);
        row.rings.push({ key, ...audit });
        if (key === 'elevator') {
          row.ringInkPixels = await strokePixels(page, '.facility-rings-svg .facility-ring-line');
          await screenshot(page, testInfo, `rings-${language}-${floor}`);
        }
        await (await facilityButton(page, key)).click();
      }
      row.outlines = { entries: 0, polygons: 0, vertices: 0, samples: 0, maxError: 0, maxClipError: 0, errors: [] };
      const entries = searchData.entries.filter(e => e.floorId === floor && e.outlines?.length);
      // WebKit limits repeated same-document navigations. Use bounded batches
      // in fresh documents rather than dropping entries or relaxing precision.
      for (let offset = 0; offset < entries.length; offset += 80) {
        const batch = entries.slice(offset, offset + 80);
        const batchPage = await page.context().newPage();
        try {
          await batchPage.clock.setFixedTime(new Date(fixedDate));
          await batchPage.goto(mapPath(language) + '#' + batch[0].id);
          await expect(batchPage.locator(`.search-highlight-area[data-entry-id="${batch[0].id}"]`)).toBeAttached();
          await expect(batchPage.locator('#canvas-layer')).toHaveAttribute('data-floor-id', floor);
          const audit = await batchPage.evaluate(auditSearchOutlines, { reference: await batchPage.evaluate(readRegistrationReference), entries: batch, language });
          for (const key of ['entries', 'polygons', 'vertices', 'samples']) row.outlines[key] += audit[key];
          for (const key of ['maxError', 'maxClipError']) row.outlines[key] = Math.max(row.outlines[key], audit[key]);
          row.outlines.errors.push(...audit.errors);
          if (!offset) {
            row.outlineInkPixels = await strokePixels(batchPage, '.search-highlight-area-outline');
            await screenshot(batchPage, testInfo, `outline-${language}-${floor}`);
          }
        } finally { await batchPage.close(); }
      }
      expect(row.outlines.errors, JSON.stringify({ floor, audit: row.outlines })).toEqual([]);
      expect(row.outlines.maxClipError).toBeLessThan(1e-8);
      report.floors.push(row);
      console.log(`Registration ${testInfo.project.name}/${language}/${floor}: ${sourceRings.length} rings, ${row.outlines.polygons} polygons; max ${Math.max(row.outlines.maxError, ...row.rings.map(r => r.maxEdge)).toFixed(5)} px`);
      await screenshot(page, testInfo, `registration-${language}-${floor}`);
    }
    await chooseFloor(page, '1F');
    await expect(page.locator('#canvas-layer')).toHaveAttribute('data-floor-id', '1F');
    for (const entry of searchData.entries.filter(e => !e.outlines?.length)) await selectEntry(page, entry, language);
    const areaPlaces = [...foodData.places.filter(p => !p.areaEntryId), ...facilities];
    const areas = areaPlaces.map(place => ({ id: place.entryId,
      polygons: searchData.entries.find(e => e.id === place.entryId).polygons,
      offset: place.areaOffset?.[language] ?? { xRatio: 0, yRatio: 0 } }));
    report.facilityAreas = await page.evaluate(auditFacilityAreas, { reference: await page.evaluate(readRegistrationReference), areas });
    expect(report.facilityAreas.errors, JSON.stringify(report.facilityAreas)).toEqual([]);
    expect(report.facilityAreas.polygons).toBe(searchData.entries.reduce((s, e) => s + (e.polygons?.length ?? 0), 0));
    report.cardSearches = searchData.entries.filter(e => !e.outlines?.length).length;
    const rings = report.floors.flatMap(f => f.rings);
    expect(rings.reduce((s, r) => s + r.count, 0)).toBe(searchData.facilityRings.length);
    expect(report.floors.reduce((s, f) => s + f.outlines.polygons, 0)).toBe(searchData.entries.reduce((s, e) => s + (e.outlines?.length ?? 0), 0));
    await testInfo.attach('registration-audit', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  });
}
