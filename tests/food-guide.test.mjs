import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {
  validateFoodPlaces,
  japaneseDate,
  selectHoursVersions,
  calendarDay,
  placeFoodMarkers,
  CoopHoursClient,
} from '../src/food-guide-model.js';
import { removeFoodPictograms } from '../scripts/food-map-svg.mjs';

const payload = JSON.parse(
  readFileSync(new URL('../public/food-places.json', import.meta.url), 'utf8'),
);
const entries = JSON.parse(
  readFileSync(
    new URL('../public/manual-search-index.json', import.meta.url),
    'utf8',
  ),
).entries;
const clone = () => structuredClone(payload);

test('all eight image pins correspond to existing first-floor search entries', () => {
  const places = validateFoodPlaces(payload, entries);
  assert.equal(places.length, 8);
  assert.equal(new Set(places.map((p) => p.mark.src)).size, 8);
  for (const place of places)
    for (const key of ['src', 'fallbackSrc']) {
      const bytes = readFileSync(
        new URL('../public' + place.mark[key], import.meta.url),
      );
      if (key === 'src') assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
      else
        assert.doesNotMatch(
          bytes.toString(),
          /<(?:text|script|image|use)\b|href=/,
        );
    }
});

test('invalid stores, missing images and mixed co-op/manual hours fail before publication', () => {
  for (const change of [
    (p) => (p.places[0].entryId = 'missing'),
    (p) => (p.places[0].mark = null),
    (p) => (p.places[1].services[0].hours = [p.places[0].services[0].hours[0]]),
    (p) => p.places[0].services[0].hours.push(p.places[0].services[0].hours[0]),
  ]) {
    const data = clone();
    change(data);
    assert.throws(() => validateFoodPlaces(data, entries), /Food data/);
  }
});

test('temporary hours are selected inclusively and expire back to the regular version', () => {
  const hours = payload.places[5].services[0].hours;
  assert.equal(selectHoursVersions(hours, '2026-10-06')[0].kind, 'regular');
  assert.equal(selectHoursVersions(hours, '2026-10-07')[0].kind, 'temporary');
  assert.equal(selectHoursVersions(hours, '2026-11-22')[0].kind, 'temporary');
  assert.equal(selectHoursVersions(hours, '2026-11-23')[0].kind, 'regular');
  assert.deepEqual(
    selectHoursVersions(
      [{ ...hours[1], validThrough: '2026-10-13' }],
      '2026-10-14',
    ),
    [],
  );
});

function calendar(now) {
  return {
    today: '2026-10-13',
    nextUpdateAt: new Date(now.getTime() + 60_000).toISOString(),
    source: { url: 'https://www.ritsco-op.jp/schedule/' },
    months: [],
    stores: [
      {
        name: 'OIC Cafeteria',
        days: [
          { date: '2026-10-13', closed: true },
          { date: '2026-10-14', closed: false },
        ],
      },
    ],
  };
}
test('the browser selects its current Japanese date, disregarding a cached API today', () => {
  const now = new Date('2026-10-13T15:00:00Z');
  assert.equal(japaneseDate(now), '2026-10-14');
  assert.equal(calendarDay(calendar(now), 'OIC Cafeteria', now).closed, false);
  assert.equal(calendarDay(calendar(now), 'missing', now), null);
  assert.equal(
    calendarDay(
      calendar(now),
      'OIC Cafeteria',
      new Date(now.getTime() + 60_000),
    ),
    null,
  );
});

test('all pins remain at their original anchors through zoom and pan; no groups or offsets', () => {
  for (const width of [320, 390, 900, 11905]) {
    const points = payload.places.map((p) => ({
      id: p.entryId,
      order: p.order,
      x: p.anchor.ja.xRatio * width - 800,
      y: p.anchor.ja.yRatio * width * 0.707 - 200,
    }));
    const { markers } = placeFoodMarkers(points, width);
    assert.equal(markers.length, 8);
    for (const m of markers) {
      const p = points.find((p) => p.id === m.id);
      assert.equal(m.x, p.x);
      assert.equal(m.y, p.y);
      assert.equal(m.ids, undefined);
      assert.equal(m.dx, undefined);
      assert.ok(m.size <= 40);
      assert.ok(m.size > 0);
    }
  }
  const a = placeFoodMarkers(
    [
      { id: 'a', order: 1, x: 0, y: 0 },
      { id: 'b', order: 2, x: 10, y: 0 },
    ],
    320,
  ).markers;
  const b = placeFoodMarkers(
    [
      { id: 'a', order: 1, x: 0, y: 0 },
      { id: 'b', order: 2, x: 20, y: 0 },
    ],
    640,
  ).markers;
  assert.ok(b[0].size > a[0].size);
});

test('overlapping hit rectangles are divided between neighboring store centres', () => {
  const { markers } = placeFoodMarkers(
    [
      { id: 'seven', order: 1, x: 100, y: 100 },
      { id: 'ramen', order: 2, x: 108, y: 100 },
    ],
    390,
  );
  const first = markers[0].clip.split(',').map((p) => parseFloat(p));
  const second = markers[1].clip.split(',').map((p) => parseFloat(p));
  assert.ok(Math.max(...first) <= 28.001);
  assert.ok(Math.min(...second) >= 19.999);
});

test('co-op requests are shared and expired responses wait at least sixty seconds before retry', async () => {
  let now = new Date('2026-10-14T00:00:00Z'),
    calls = 0,
    finish;
  const client = new CoopHoursClient({
    now: () => now,
    fetchImpl: () => {
      calls++;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  });
  const a = client.refresh(),
    b = client.refresh();
  assert.equal(calls, 1);
  finish({ ok: true, json: async () => calendar(now) });
  await Promise.all([a, b]);
  assert.equal(client.needsRefresh(), false);
  now = new Date(now.getTime() + 60_000);
  const expired = client.refresh();
  finish({
    ok: true,
    json: async () => ({ ...calendar(now), nextUpdateAt: now.toISOString() }),
  });
  await expired;
  assert.equal(client.payload, null);
  assert.equal(client.nextCheck(), 60_000);
  await client.refresh();
  assert.equal(calls, 2);
  now = new Date(now.getTime() + 59_999);
  await client.refresh();
  assert.equal(calls, 2);
  now = new Date(now.getTime() + 1);
  const retry = client.refresh();
  assert.equal(calls, 3);
  finish({ ok: false });
  await retry;
});

for (const lang of ['ja', 'en'])
  test(`derived ${lang} SVG removes only the seven known pictograms and leaves the original untouched`, () => {
    const source = readFileSync(
      new URL(`../src/assets/floors/${lang}/1F.svg`, import.meta.url),
      'utf8',
    );
    const derived = removeFoodPictograms(source, payload.places, lang);
    assert.notEqual(derived, source);
    assert.throws(
      () => removeFoodPictograms(derived, payload.places, lang),
      /removed 0|Expected|expected/i,
    );
    assert.equal(
      readFileSync(
        new URL(`../src/assets/floors/${lang}/1F.svg`, import.meta.url),
        'utf8',
      ),
      source,
    );
    assert.equal(derived.match(/<svg[^>]*>/)[0], source.match(/<svg[^>]*>/)[0]);
  });

// Gesture tests exercise the real methods with a tiny DOM boundary stub.
const viewerSource = readFileSync(
  new URL('../src/food-guide-viewer.js', import.meta.url),
  'utf8',
);
function gesture() {
  const code = viewerSource.slice(
    viewerSource.indexOf('  pointerDown(event)'),
    viewerSource.indexOf('  hoverEvent(event)'),
  );
  const context = vm.createContext({ FOOD_GESTURE_DISTANCE: 8 });
  vm.runInContext(`this.Gesture=class{${code}}`, context);
  const g = new context.Gesture();
  g.viewer = { contains: () => true };
  g.hideHover = () => {};
  g.activateMarker = () => {
    g.opened = true;
  };
  g.close = () => {
    g.closed = true;
  };
  const marker = {};
  const target = { closest: (s) => (s === '.food-pin' ? marker : null) };
  return { g, target };
}
test('a single tap selects, while eight-pixel movement, a second pointer and cancellation do not', () => {
  for (const action of ['tap', 'drag', 'second', 'cancel']) {
    const { g, target } = gesture();
    g.pointerDown({ target, pointerId: 1, clientX: 10, clientY: 10 });
    if (action === 'second')
      g.pointerDown({ target, pointerId: 2, clientX: 10, clientY: 10 });
    if (action === 'cancel') g.cancelGesture();
    g.pointerUp({
      target,
      pointerId: 1,
      clientX: action === 'drag' ? 18 : 10,
      clientY: 10,
    });
    assert.equal(Boolean(g.opened), action === 'tap');
    assert.equal(g.closed, undefined);
  }
});
