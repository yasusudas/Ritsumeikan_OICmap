import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

test('canonical search data distinguishes same-floor names without warnings', async () => {
  const payload = await readCanonicalSearchData();
  const report = validateSearchData(payload);

  assert.deepEqual(report.errors, []);
  assert.equal(report.stats.entries, 652); // 580 + H4001–H4045 faculty research offices + A-building 5F faculty research offices 5301–5315 and 5401–5415 (27 rooms, 2026-10-17)
  assert.equal(report.stats.facilityRings, 514);
  assert.equal(report.stats.sameFloorLabelGroups, 10);
  assert.equal(report.stats.legacyWhiteRings, 0);
  assert.deepEqual(report.warnings, []);
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

test('validator checks search outlines like area polygons', () => {
  const square = [
    { xRatio: 0.1, yRatio: 0.1 },
    { xRatio: 0.2, yRatio: 0.1 },
    { xRatio: 0.2, yRatio: 0.2 },
    { xRatio: 0.1, yRatio: 0.2 }
  ];
  const valid = validateSearchData({
    version: 3,
    entries: [{ ...createEntry({ id: 'entry-a', label: 'Room' }), outlines: [square] }],
    facilityRings: []
  });
  const invalid = validateSearchData({
    version: 3,
    entries: [
      {
        ...createEntry({ id: 'entry-a', label: 'Room' }),
        outlines: [square.slice(0, 2), [...square.slice(0, 3), { xRatio: 1.2, yRatio: 0.1 }]]
      }
    ],
    facilityRings: []
  });

  assert.deepEqual(valid.errors, []);
  assert.deepEqual(
    invalid.errors.map((error) => [error.code, error.path]),
    [
      ['invalid-polygon', 'entries[0].outlines[0]'],
      ['coordinate-out-of-range', 'entries[0].outlines[1][3].xRatio']
    ]
  );
});

test('every first-floor place without a food card has a search outline', async () => {
  const payload = await readCanonicalSearchData();
  const foodPlaces = JSON.parse(await readFile(new URL('../public/food-places.json', import.meta.url), 'utf8'));
  const cardIds = new Set(foodPlaces.places.map((place) => place.entryId));
  const firstFloor = payload.entries.filter((entry) => entry.floorId === '1F');
  const withoutOutline = firstFloor.filter((entry) => !entry.outlines?.length);

  assert.deepEqual(
    withoutOutline.filter((entry) => !cardIds.has(entry.id) && !/^ATM$/.test(entry.label)).map((entry) => entry.label),
    []
  );
  assert.equal(firstFloor.filter((entry) => entry.outlines?.length).length, 96);
});

test('every second-floor place has a search outline', async () => {
  const payload = await readCanonicalSearchData();
  const secondFloor = payload.entries.filter((entry) => entry.floorId === '2F');
  const withoutOutline = secondFloor.filter((entry) => !entry.outlines?.length);

  assert.deepEqual(withoutOutline.map((entry) => entry.label), []);
  assert.equal(secondFloor.filter((entry) => entry.outlines?.length).length, 74);
});

test('every third-floor place has a search outline', async () => {
  const payload = await readCanonicalSearchData();
  const thirdFloor = payload.entries.filter((entry) => entry.floorId === '3F');
  const withoutOutline = thirdFloor.filter((entry) => !entry.outlines?.length);

  assert.deepEqual(withoutOutline.map((entry) => entry.label), []);
  assert.equal(thirdFloor.filter((entry) => entry.outlines?.length).length, 63);
});

test('every fourth-floor place has a search outline', async () => {
  const payload = await readCanonicalSearchData();
  const fourthFloor = payload.entries.filter((entry) => entry.floorId === '4F');
  const withoutOutline = fourthFloor.filter((entry) => !entry.outlines?.length);

  assert.deepEqual(withoutOutline.map((entry) => entry.label), []);
  assert.equal(fourthFloor.filter((entry) => entry.outlines?.length).length, 105);
});

test('every fifth-floor place has a search outline', async () => {
  const payload = await readCanonicalSearchData();
  const fifthFloor = payload.entries.filter((entry) => entry.floorId === '5F');
  const withoutOutline = fifthFloor.filter((entry) => !entry.outlines?.length);

  assert.deepEqual(withoutOutline.map((entry) => entry.label), []);
  assert.equal(fifthFloor.filter((entry) => entry.outlines?.length).length, 100);
});

test('the 5F A-building faculty research offices are searchable, one outline each', async () => {
  const payload = await readCanonicalSearchData();
  const fifthFloor = payload.entries.filter((entry) => entry.floorId === '5F');
  // The map draws no rooms numbered 5309, 5310 or 5409, so they are not entries.
  const numbers = [
    ...[1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 13, 14, 15].map((n) => 5300 + n),
    ...[1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15].map((n) => 5400 + n)
  ].map(String);
  const offices = fifthFloor.filter((entry) => /^5[34]\d\d$/.test(entry.label));

  assert.deepEqual(offices.map((entry) => entry.label).sort(), numbers);
  for (const entry of offices) {
    assert.equal(entry.outlines.length, 1, entry.label);
    assert.deepEqual(entry.aliases, ['教員研究室']);
    assert.equal(entry.labelEn, `${entry.label} Faculty Research Office`);
  }
});
