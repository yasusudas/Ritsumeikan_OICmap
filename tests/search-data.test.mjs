import assert from 'node:assert/strict';
import test from 'node:test';
import { createSearchRuntimePayloads, readCanonicalSearchData } from '../scripts/search-data-runtime.mjs';
import { validateSearchData } from '../scripts/search-data-validation.mjs';

function createEntry({ id, label, floorId = '1F', xRatio = 0.1 } = {}) {
  return {
    id,
    floorId,
    label,
    labelEn: '',
    aliases: [],
    rects: [{ xRatio, yRatio: 0.1, widthRatio: 0.01, heightRatio: 0.01 }],
    polygons: []
  };
}

function createRing(overrides = {}) {
  return {
    id: 'ring-1',
    floorId: '1F',
    facilityKey: 'toilet',
    colorVariant: 'red',
    xRatio: 0.2,
    yRatio: 0.2,
    ...overrides
  };
}

test('canonical search data passes fatal validation with the known warnings', async () => {
  const payload = await readCanonicalSearchData();
  const report = validateSearchData(payload);

  assert.deepEqual(report.errors, []);
  assert.equal(report.stats.entries, 548);
  assert.equal(report.stats.facilityRings, 470);
  assert.equal(report.stats.sameFloorLabelGroups, 8);
  assert.equal(report.stats.legacyWhiteRings, 0);
  assert.equal(report.warnings.filter((warning) => warning.code === 'same-floor-label').length, 8);
  assert.equal(report.warnings.filter((warning) => warning.code === 'legacy-color-white').length, 0);
});

test('runtime payloads preserve every canonical entry and facility ring', async () => {
  const payload = await readCanonicalSearchData();
  const runtime = createSearchRuntimePayloads(payload);

  assert.equal(runtime.entries.version, payload.version);
  assert.equal(runtime.facilityRings.version, payload.version);
  assert.deepEqual(runtime.entries.entries, payload.entries);
  assert.deepEqual(runtime.facilityRings.facilityRings, payload.facilityRings);
});

test('validator rejects duplicate IDs, invalid coordinates, unknown values, and hash collisions', () => {
  const payload = {
    version: 3,
    entries: [
      createEntry({ id: 'entry-a', label: 'Room' }),
      createEntry({ id: 'entry-a', label: 'Other', floorId: '99F', xRatio: 1.1 }),
      createEntry({ id: '1f-room', label: 'Third', xRatio: 0.3 })
    ],
    facilityRings: [
      createRing({ id: 'entry-a', facilityKey: 'unknown', colorVariant: 'purple', xRatio: -0.1 })
    ]
  };
  const report = validateSearchData(payload);
  const codes = new Set(report.errors.map((error) => error.code));

  assert.ok(codes.has('duplicate-id'));
  assert.ok(codes.has('unknown-floor'));
  assert.ok(codes.has('coordinate-out-of-range'));
  assert.ok(codes.has('unknown-facility'));
  assert.ok(codes.has('unknown-color-variant'));
  assert.ok(codes.has('hash-route-collision'));
});

test('validator reports existing cleanup candidates as warnings', () => {
  const payload = {
    version: 3,
    entries: [
      createEntry({ id: 'entry-a', label: 'Same', xRatio: 0.1 }),
      createEntry({ id: 'entry-b', label: 'Same', xRatio: 0.2 })
    ],
    facilityRings: [createRing({ colorVariant: 'white' })]
  };
  const report = validateSearchData(payload);

  assert.deepEqual(report.errors, []);
  assert.equal(report.stats.sameFloorLabelGroups, 1);
  assert.equal(report.stats.legacyWhiteRings, 1);
  assert.deepEqual(
    report.warnings.map((warning) => warning.code).sort(),
    ['legacy-color-white', 'same-floor-label']
  );
});
