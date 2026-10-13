import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import offsets from '../src/assets/facility-ring-offsets.json' with { type: 'json' };
import { getFacilityRingDisplayPoint } from '../src/facility-ring-position.js';
import { readCanonicalSearchData } from '../scripts/search-data-runtime.mjs';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10);

test('English offsets match the current floor SVGs and cover every saved ring', async () => {
  const payload = await readCanonicalSearchData();
  for (const [floorId, floor] of Object.entries(offsets)) {
    for (const lang of ['ja', 'en']) {
      const svg = await readFile(new URL(`../src/assets/floors/${lang}/${floor.file}`, import.meta.url));
      assert.equal(createHash('sha256').update(svg).digest('hex'), floor.svgSha256[lang],
        `${floorId} ${lang}: regenerate pictogram offsets when replacing the SVG`);
    }
    for (const ring of payload.facilityRings.filter((ring) => ring.floorId === floorId)) {
      const candidates = floor.points[ring.facilityKey][ring.colorVariant];
      const point = candidates.find(([x, y]) => Math.abs(x - ring.xRatio) < 0.000002 && Math.abs(y - ring.yRatio) < 0.000002);
      assert.ok(point, `Missing pictogram for ${ring.id}`);
      assert.deepEqual(getFacilityRingDisplayPoint(ring, 'ja'), { xRatio: ring.xRatio, yRatio: ring.yRatio });
      const en = getFacilityRingDisplayPoint(ring, 'en');
      near(en.xRatio, ring.xRatio + point[2]);
      near(en.yRatio, ring.yRatio + point[3]);
      assert.equal(ring.positionEn, undefined);
    }
  }
});

test('new ring IDs and edits to Japanese coordinates automatically keep the English correction', () => {
  const [x, y, dx, dy] = offsets['2F'].points.vendingMachine.red.find((point) => point[2] > 0.001);
  const ring = { id: 'new-ring', floorId: '2F', facilityKey: 'vendingMachine', colorVariant: 'red', xRatio: x, yRatio: y };
  const original = structuredClone(ring);
  const en = getFacilityRingDisplayPoint(ring, 'en');
  near(en.xRatio, x + dx);
  near(en.yRatio, y + dy);
  assert.deepEqual(ring, original);

  const moved = { ...ring, id: 'recreated-ring', xRatio: x + 0.0001, yRatio: y - 0.0001 };
  const movedEn = getFacilityRingDisplayPoint(moved, 'en');
  near(movedEn.xRatio - en.xRatio, 0.0001);
  near(movedEn.yRatio - en.yRatio, -0.0001);
});

test('H building uses viewBox-relative coordinates and keeps toilet variants separate', () => {
  const floor = offsets['H-6-9F'];
  assert.equal(floor.viewBox[0], 8.5);
  for (const colorVariant of ['red', 'blue', 'yellow']) {
    const [xRatio, yRatio, dx, dy] = floor.points.toilet[colorVariant][0];
    const ring = { floorId: 'H-6-9F', facilityKey: 'toilet', colorVariant, xRatio, yRatio };
    const point = getFacilityRingDisplayPoint(ring, 'en');
    near(point.xRatio, xRatio + dx);
    near(point.yRatio, yRatio + dy);
  }
});

test('unknown or distant pictograms retain the Japanese coordinates', () => {
  for (const overrides of [{}, { floorId: 'unknown' }, { facilityKey: 'printer' }]) {
    const ring = { floorId: '1F', facilityKey: 'toilet', colorVariant: 'red', xRatio: 0.01, yRatio: 0.01, ...overrides };
    assert.deepEqual(getFacilityRingDisplayPoint(ring, 'en'), { xRatio: 0.01, yRatio: 0.01 });
  }
});
