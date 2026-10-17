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
  assert.equal(report.stats.entries, 1029); // 1021 + the 8 places picked from the unregistered list (2026-10-17)
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
  assert.equal(firstFloor.filter((entry) => entry.outlines?.length).length, 97);
});

test('every second-floor place has a search outline', async () => {
  const payload = await readCanonicalSearchData();
  const secondFloor = payload.entries.filter((entry) => entry.floorId === '2F');
  const withoutOutline = secondFloor.filter((entry) => !entry.outlines?.length);

  assert.deepEqual(withoutOutline.map((entry) => entry.label), []);
  assert.equal(secondFloor.filter((entry) => entry.outlines?.length).length, 75);
});

test('every third-floor place has a search outline', async () => {
  const payload = await readCanonicalSearchData();
  const thirdFloor = payload.entries.filter((entry) => entry.floorId === '3F');
  const withoutOutline = thirdFloor.filter((entry) => !entry.outlines?.length);

  assert.deepEqual(withoutOutline.map((entry) => entry.label), []);
  assert.equal(thirdFloor.filter((entry) => entry.outlines?.length).length, 64);
});

test('every fourth-floor place has a search outline', async () => {
  const payload = await readCanonicalSearchData();
  const fourthFloor = payload.entries.filter((entry) => entry.floorId === '4F');
  const withoutOutline = fourthFloor.filter((entry) => !entry.outlines?.length);

  assert.deepEqual(withoutOutline.map((entry) => entry.label), []);
  assert.equal(fourthFloor.filter((entry) => entry.outlines?.length).length, 108);
});

test('every fifth-floor place has a search outline', async () => {
  const payload = await readCanonicalSearchData();
  const fifthFloor = payload.entries.filter((entry) => entry.floorId === '5F');
  const withoutOutline = fifthFloor.filter((entry) => !entry.outlines?.length);

  assert.deepEqual(withoutOutline.map((entry) => entry.label), []);
  assert.equal(fifthFloor.filter((entry) => entry.outlines?.length).length, 163);
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

test('the 5F H-building faculty research offices are searchable, one outline each', async () => {
  const payload = await readCanonicalSearchData();
  const fifthFloor = payload.entries.filter((entry) => entry.floorId === '5F');
  // The map draws H5001-H5006 and H5011-H5020 only; there are no rooms numbered H5007-H5010.
  const labels = [
    ...[1, 2, 3, 4, 5, 6].map((n) => `H50${String(n).padStart(2, '0')}`),
    ...[11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((n) => `H50${n}`)
  ];
  const offices = fifthFloor.filter((entry) => /^H50\d\d$/.test(entry.label));

  assert.deepEqual(offices.map((entry) => entry.label).sort(), labels);
  for (const entry of offices) {
    assert.equal(entry.outlines.length, 1, entry.label);
    assert.deepEqual(entry.aliases, ['教員研究室']);
    assert.equal(entry.labelEn, `${entry.label} Faculty Research Office`);
  }
});

test('the 5F OIC Seminar House rooms are searchable by number, one outline each', async () => {
  const payload = await readCanonicalSearchData();
  const fifthFloor = payload.entries.filter((entry) => entry.floorId === '5F');
  const labels = [...Array.from({ length: 45 }, (_, i) => String(5001 + i)), '5101', '5102'];
  const rooms = fifthFloor.filter((entry) => /^5[01]\d\d$/.test(entry.label));

  assert.deepEqual(rooms.map((entry) => entry.label).sort(), labels);
  for (const entry of rooms) {
    assert.equal(entry.outlines.length, 1, entry.label);
    assert.equal(entry.floorId, '5F');
  }
});

test('the A-building 7F, 8F and 9F faculty research offices are searchable, one outline each', async () => {
  const payload = await readCanonicalSearchData();
  const rooms = payload.entries.filter((entry) => entry.floorId === 'A-6-9F' && /^\d{4}$/.test(entry.label));
  const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
  // The map skips the numbers that sit on toilets, lounges and stairs (x09, x10, 7411-7412, 9301, 9401).
  const numbers = [
    ...range(7101, 7109), ...range(7111, 7115), ...range(7201, 7208), ...range(7210, 7215),
    7410, ...range(7413, 7415), ...range(7501, 7509), ...range(7511, 7515), ...range(7601, 7608), ...range(7610, 7615),
    ...range(8101, 8109), ...range(8111, 8115), ...range(8201, 8208), ...range(8210, 8215),
    8410, ...range(8501, 8509), ...range(8511, 8515), ...range(8601, 8608), ...range(8610, 8615),
    ...range(9001, 9028), ...range(9101, 9109), ...range(9111, 9115), ...range(9201, 9208), ...range(9210, 9215),
    ...range(9302, 9309), ...range(9311, 9315), ...range(9402, 9408), ...range(9410, 9415),
    ...range(9501, 9509), ...range(9511, 9515), ...range(9601, 9608), ...range(9610, 9615)
  ].map(String);

  assert.equal(numbers.length, 227);
  assert.deepEqual(rooms.map((entry) => entry.label).sort(), numbers);
  for (const entry of rooms) {
    assert.equal(entry.outlines.length, 1, entry.label);
    assert.deepEqual(entry.aliases, ['教員研究室']);
    assert.equal(entry.labelEn, `${entry.label} Faculty Research Office`);
  }
});

test('every A-building 6F-9F place has a search outline', async () => {
  const payload = await readCanonicalSearchData();
  const buildingA = payload.entries.filter((entry) => entry.floorId === 'A-6-9F');
  const withoutOutline = buildingA.filter((entry) => !entry.outlines?.length);

  assert.deepEqual(withoutOutline.map((entry) => entry.label), []);
  assert.equal(buildingA.filter((entry) => entry.outlines?.length).length, 331);
});

test('the H-building 6F-9F faculty research offices are searchable, one outline each', async () => {
  const payload = await readCanonicalSearchData();
  const rooms = payload.entries.filter((entry) => entry.floorId === 'H-6-9F' && /^H[6-9]0\d\d$/.test(entry.label));
  const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
  // Right column x001-x009 on every floor; left column x010-x020, except 8F where the grey
  // block under the column replaces H8010.
  const numbers = [
    ...range(6001, 6020), ...range(7001, 7020), ...range(8001, 8009), ...range(8011, 8020), ...range(9001, 9020)
  ].map((n) => `H${n}`);

  assert.equal(numbers.length, 79);
  assert.deepEqual(rooms.map((entry) => entry.label).sort(), numbers);
  for (const entry of rooms) {
    assert.equal(entry.outlines.length, 1, entry.label);
    assert.deepEqual(entry.aliases, ['教員研究室']);
    assert.equal(entry.labelEn, `${entry.label} Faculty Research Office`);
  }
});

test('every H-building 6F-9F place has a search outline', async () => {
  const payload = await readCanonicalSearchData();
  const buildingH = payload.entries.filter((entry) => entry.floorId === 'H-6-9F');
  const withoutOutline = buildingH.filter((entry) => !entry.outlines?.length);

  assert.deepEqual(withoutOutline.map((entry) => entry.label), []);
  assert.equal(buildingH.filter((entry) => entry.outlines?.length).length, 178);
});

test('the places picked from the unregistered list are searchable by their map names', async () => {
  const payload = await readCanonicalSearchData();
  const find = (floorId, label) => {
    const hits = payload.entries.filter((entry) => entry.floorId === floorId && entry.label === label);
    assert.equal(hits.length, 1, `${floorId} ${label}`);
    return hits[0];
  };
  // [floor, label, English label (if any), number of outline polygons]
  const places = [
    ['1F', '空のプラザ', 'SORA-NO-Plaza', 1],
    ['2F', '音響マシンルーム', 'Audio Machine Room', 1],
    ['2F', 'H238 フォーリールーム', 'H238 Foley Room', 1],
    ['2F', 'H228 アフレコルーム', 'H228 Recording Room', 1],
    ['2F', 'Connected Learning Commons(2F)', undefined, 5],
    ['3F', 'OICライブラリー(3F)', 'OIC Library (3F)', 1],
    ['3F', 'Connected Learning Commons(3F)', undefined, 6],
    ['4F', '映像学会学生委員会室', 'Student Association', 1],
    ['4F', 'プロジェクトルーム', 'Project Room', 4],
    ['4F', 'OICライブラリー(4F)', 'OIC Library (4F)', 1],
    ['5F', 'プロジェクトルーム', 'Project Room', 6],
    ['A-6-9F', '教材作成室', 'Teaching Material Preparation Room', 1],
    ['A-6-9F', '行動実験室', 'Behavior Laboratory', 2]
  ];

  for (const [floorId, label, labelEn, polygons] of places) {
    const entry = find(floorId, label);
    assert.equal(entry.outlines.length, polygons, label);
    assert.equal(entry.labelEn, labelEn, label);
  }

  // H245 reaches over the light-blue strip on its right (x 228.87 to 261.07 of the 2F viewBox).
  const xs = find('2F', 'H245').outlines.flat().map((point) => point.xRatio);
  assert.ok(Math.abs(Math.min(...xs) - 0.19224) < 1e-5);
  assert.ok(Math.abs(Math.max(...xs) - 0.219289) < 1e-5);

  // 空のプラザ is also the location hint of the lunch street, which no longer claims it as an alias.
  const lunchStreet = payload.entries.find((entry) => entry.id === 'manual-1F-1792100000001-kcar01');
  assert.equal(lunchStreet.locationHint, '空のプラザ');
  assert.deepEqual(lunchStreet.aliases, ['キッチンカー', 'Kitchen cars', 'ランチストリート']);
});
