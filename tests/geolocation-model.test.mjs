import assert from 'node:assert/strict';
import test from 'node:test';
import { getFloorAlignment, transformPoint } from '../src/floor-alignment.js';
import { GEOREFERENCE as g, METERS_PER_LATITUDE, METERS_PER_LONGITUDE } from '../src/geolocation-model.js';
import { projectCampusPosition, projectFloorDrawing, accuracyCircleRadius } from '../src/geolocation-model.js';
import { validateFloorAlignment } from '../scripts/gps/validate-floor-alignment.mjs';

test('round accuracy uses the widest projected direction, including viewport aspect ratio', () => {
  assert.equal(accuracyCircleRadius([0, 2, -2, 0], 8), 16, 'rotation preserves a uniform scale');
  assert.equal(accuracyCircleRadius([2, 0, 0, 3], 8), 24, 'enclose the larger axis');
  assert.equal(accuracyCircleRadius([2, 0, 0, 3], 8, 2, 1), 32, 'account for screen scale before choosing a radius');
  const matrix = [1, 0, 1, 1], radius = accuracyCircleRadius(matrix, 1);
  assert.ok(Math.abs(radius - (1 + Math.sqrt(5)) / 2) < 1e-12, 'a shear needs more than either axis length');
  for (let degrees = 0; degrees < 360; degrees++) {
    const x = Math.cos(degrees * Math.PI / 180), y = Math.sin(degrees * Math.PI / 180);
    assert.ok(Math.hypot(matrix[0] * x + matrix[2] * y, matrix[1] * x + matrix[3] * y) <= radius + 1e-12);
  }
});

test('trial georeference matches three documented OSM/SVG control points', () => {
  for (const [latitude, longitude, x, y] of [
    [34.809735, 135.5601185, 500.391, 104.375],
    [34.8112938, 135.5607199, 921.097, 249.426],
    [34.8083987, 135.5611633, 116.668, 332.410],
  ]) {
    const actual = projectCampusPosition({ latitude, longitude, accuracy: 8 });
    assert.equal(actual.kind, 'position');
    assert.ok(Math.abs(actual.x - x) < 0.002);
    assert.ok(Math.abs(actual.y - y) < 0.002);
  }
});

test('independent building corners reveal alignment residuals rather than hiding them', () => {
  const checks = [
    [34.8100942, 135.560118, 589.746, 104.375],
    [34.8095872, 135.5611456, 446.818, 332.410],
    [34.81023, 135.5607015, 645.77, 240.73],
    [34.8095174, 135.5608475, 420.44, 261.75],
  ];
  const residuals = checks.map(([latitude, longitude, x, y]) => {
    const result = projectCampusPosition({ latitude, longitude, accuracy: 10 });
    assert.equal(result.kind, 'position');
    return Math.hypot(result.x - x, result.y - y);
  });
  assert.ok(Math.max(...residuals) < 18);
  assert.ok(Math.max(...residuals) > 15, 'the original diagram has a real alignment residual');
});

test('English projection follows the verified SVG scale correction', () => {
  const position = { latitude: 34.809735, longitude: 135.5601185, accuracy: 5 };
  const ja = projectCampusPosition(position), en = projectCampusPosition(position, 'en');
  assert.ok(Math.abs(en.x - 500.203) < 0.005);
  assert.ok(Math.abs(en.y - 104.442) < 0.005);
  assert.notDeepEqual(en.matrix, ja.matrix);
});

test('invalid, imprecise and out-of-map readings never become clamped pins', () => {
  for (const coords of [null, {}, { latitude: NaN, longitude: 135, accuracy: 10 }, { latitude: 34, longitude: 135, accuracy: -1 }]) assert.equal(projectCampusPosition(coords).kind, 'invalid');
  assert.equal(projectCampusPosition({ latitude: 34.81, longitude: 135.561, accuracy: 101 }).kind, 'imprecise');
  assert.equal(projectCampusPosition({ latitude: 35.68, longitude: 139.76, accuracy: 10 }).kind, 'outside');
  assert.equal(projectCampusPosition({ latitude: 34.8115, longitude: 135.562, accuracy: 10 }).kind, 'outside', 'do not draw on the office index/legend');
});

test('identical geographic fixes have exactly identical registered coordinates on 1F–5F', () => {
  for (const lang of ['ja', 'en']) for (let latitude = 34.8084; latitude < 34.8115; latitude += .0001) {
    for (let longitude = 135.5601; longitude < 135.563; longitude += .0001) {
      const coords = { latitude, longitude, accuracy: 8 };
      const reference = projectCampusPosition(coords, lang, '1F');
      for (const floor of ['2F', '3F', '4F', '5F']) assert.deepEqual(projectCampusPosition(coords, lang, floor), reference);
    }
  }
});

test('combined upper-floor sheets map the location separately into each drawing', () => {
  for (const [floor, coords, bounds] of [
    ['A-6-9F', { latitude: 34.8104, longitude: 135.5611, accuracy: 12 }, [[170, 520, 175, 405], [170, 520, 490, 715], [650, 1005, 175, 405], [650, 1005, 490, 715]]],
    ['H-6-9F', { latitude: 34.80855, longitude: 135.5616, accuracy: 12 }, [[80, 520, 215, 375], [80, 520, 495, 655], [675, 1115, 215, 375], [675, 1115, 495, 655]]],
  ]) {
    for (const lang of ['ja', 'en']) {
      const result = projectCampusPosition(coords, lang, floor);
      assert.equal(result.kind, 'position');
      assert.equal(result.points.length, 4);
      result.points.forEach((point, i) => {
        const [left, right, top, bottom] = bounds[i];
        assert.ok(point.x >= left && point.x <= right && point.y >= top && point.y <= bottom, `${floor}/${lang}/${i} falls inside its drawing`);
        assert.ok(point.matrix.every(Number.isFinite));
      });
    }
  }
  assert.equal(projectCampusPosition({ latitude: 34.8104, longitude: 135.5611, accuracy: 12 }, 'ja', 'H-6-9F').kind, 'outsideBuilding');
  assert.equal(projectCampusPosition({ latitude: 34.80855, longitude: 135.5616, accuracy: 12 }, 'ja', 'A-6-9F').kind, 'outsideBuilding');
  assert.equal(projectCampusPosition({ latitude: 34.8106, longitude: 135.5611, accuracy: 12 }, 'ja', 'print-station').kind, 'unsupported');
});

test('upper-floor presence uses actual building polygons, excluding courtyards, other buildings and walls', () => {
  for (const [floor, latitude, longitude] of [
    ['A-6-9F', 34.8106, 135.5611], // A courtyard
    ['H-6-9F', 34.8088, 135.5617], // H east recess
    ['A-6-9F', 34.80995, 135.5612], // outside A
    ['H-6-9F', 34.80995, 135.5612], // outside H
    ['A-6-9F', 34.8112938, 135.5607199], // exact exterior corner
  ]) {
    for (const lang of ['ja', 'en']) {
      const result = projectCampusPosition({ latitude, longitude, accuracy: 8 }, lang, floor);
      assert.equal(result.kind, 'outsideBuilding', `${floor}/${latitude}/${longitude}`);
      assert.equal(result.points, undefined);
    }
  }
  assert.equal(projectCampusPosition({ latitude: 34.8106, longitude: 135.5611, accuracy: 8 }, 'ja', '4F').kind, 'position', 'campus-wide floors keep their location display');
  for (const [floor, latitude, longitude] of [['A-6-9F', 34.8104, 135.5611], ['H-6-9F', 34.80855, 135.5616]]) {
    assert.equal(projectCampusPosition({ latitude, longitude, accuracy: 8 }, 'ja', floor).kind, 'position');
    assert.equal(projectCampusPosition({ latitude, longitude, accuracy: 30 }, 'ja', floor).kind, 'uncertainBuilding', 'a center inside the building is not sufficient when the accuracy circle crosses its walls');
  }
});

test('upper-floor alignment improves held-out corners and stairs without counting calibration points', async () => {
  const results = await validateFloorAlignment();
  assert.equal(results.length, 8);
  assert.equal(results.reduce((sum, r) => sum + r.holdoutCount, 0), 36);
  for (const row of results) {
    assert.ok(row.afterMean < row.beforeMean, `${row.sheet}/${row.floor}: independent mean improves`);
    assert.ok(row.afterMax <= row.beforeMax + 0.01, `${row.sheet}/${row.floor}: independent worst point does not regress`);
    assert.ok(row.afterMaxMetresEquivalent < (row.sheet.startsWith('A') ? 2.8 : 1.9));
    assert.ok(row.afterMax > 5, 'retain the measured residual, not a zero-error accuracy claim');
    if (row.sheet.startsWith('A')) for (const point of row.calibration) assert.ok(point.afterSvg < 0.001);
  }
});

test('local A correction stays continuous, preserves orientation and transforms accuracy with its local derivative', () => {
  for (let floor = 0; floor < 4; floor++) {
    for (const x of [645, 736, 854.94, 880, 921.097, 934.34, 980]) {
      for (const y of [240, 249.426, 300, 359.891, 390, 423.605, 450]) {
        const point = projectFloorDrawing(x, y, 'A-6-9F', floor);
        const [a, b, c, d] = point.matrix;
        assert.ok(a * d - b * c > 0.5, 'no folding or collapsed drawing');
        for (const delta of [-1e-5, 1e-5]) {
          const next = projectFloorDrawing(x + delta, y + delta, 'A-6-9F', floor);
          assert.ok(Math.hypot(next.x - point.x, next.y - point.y) < 0.0001, 'no jump at correction boundaries');
        }
      }
    }
    const point = projectFloorDrawing(890, 390, 'A-6-9F', floor), step = 1e-4;
    const dx = projectFloorDrawing(890 + step, 390, 'A-6-9F', floor);
    const dy = projectFloorDrawing(890, 390 + step, 'A-6-9F', floor);
    const numerical = [(dx.x - point.x) / step, (dx.y - point.y) / step, (dy.x - point.x) / step, (dy.y - point.y) / step];
    numerical.forEach((value, i) => assert.ok(Math.abs(value - point.matrix[i]) < 1e-6));
  }
});

test('GPS common frame agrees with all registered building landmark targets',()=>{
  let count=0;
  for(const lang of ['ja','en']) for(const floor of ['2F','3F','4F','5F']) {
    for(const patch of getFloorAlignment(floor,lang)) for(const [i,target] of patch.target.entries()) {
      const scale=lang==='en'?.999625:1,offset=lang==='en'?.106:0;
      const x=target[0]/scale-g.x[2],y=(target[1]-offset)/scale-g.y[2];
      const det=g.x[0]*g.y[1]-g.x[1]*g.y[0];
      const coords={latitude:g.latitude+(-g.y[0]*x+g.x[0]*y)/det/METERS_PER_LATITUDE,
        longitude:g.longitude+(g.y[1]*x-g.x[1]*y)/det/METERS_PER_LONGITUDE,accuracy:8};
      const gps=projectCampusPosition(coords,lang,floor);
      if(gps.kind!=='position') continue;
      const registered=transformPoint(patch.matrix,...patch.source[i]);
      assert.ok(Math.hypot(gps.x-registered.x,gps.y-registered.y)<1e-7,`${lang}/${floor}/${patch.id}/${i}`);
      count++;
    }
  }
  assert.ok(count>=100, `${count} eligible registered landmarks`);
});
