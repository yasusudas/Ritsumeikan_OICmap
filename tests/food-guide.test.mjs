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
  FOOD_PIN_MIN_DIAMETER_RATIO,
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

test('every image pin corresponds to an existing first-floor search entry', () => {
  const places = validateFoodPlaces(payload, entries);
  assert.equal(places.length, 11);
  assert.equal(new Set(places.map((p) => p.mark.src)).size, 10);
  for (const place of places)
    for (const key of ['src', 'fallbackSrc']) {
      const bytes = readFileSync(
        new URL('../public' + place.mark[key], import.meta.url),
      );
      if (place.mark[key].endsWith('.png'))
        assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
      else
        assert.doesNotMatch(
          bytes.toString(),
          /<(?:text|script|image|use)\b|href=/,
        );
    }
});

test('OIC Café has its own pin and search entry but shares the cafeteria area', () => {
  const places = validateFoodPlaces(payload, entries);
  const cafeteria = places.find((p) => p.name.ja === 'OIC Cafeteria');
  const cafe = places.find((p) => p.name.ja === 'OIC Café');
  assert.equal(cafe.order, cafeteria.order + 1);
  assert.equal(cafe.areaEntryId, cafeteria.entryId);
  assert.equal(entries.find((e) => e.id === cafe.entryId).polygons, undefined);
  assert.deepEqual(cafeteria.services.map((s) => s.id), ['cafeteria']);
  assert.deepEqual(cafe.services.map((s) => s.coopScheduleName), ['OIC Cafeteria内OIC Café']);
  // Side by side: same height, as far apart as みなめんcafe and セブン-イレブン.
  const minamen = places.find((p) => p.name.ja === 'みなめんcafe');
  const seven = places.find((p) => p.name.ja === 'セブン-イレブン');
  for (const lang of ['ja', 'en']) {
    assert.equal(cafe.anchor[lang].yRatio, cafeteria.anchor[lang].yRatio);
    const gap = cafe.anchor[lang].xRatio - cafeteria.anchor[lang].xRatio;
    assert.ok(gap >= seven.anchor[lang].xRatio - minamen.anchor[lang].xRatio - 1e-6);
  }
  const shared = clone();
  shared.places.find((p) => p.name.ja === 'OIC Café').areaEntryId = 'missing';
  assert.throws(() => validateFoodPlaces(shared, entries), /Food data/);
});

test('invalid stores, missing images and mixed co-op/manual hours fail before publication', () => {
  for (const change of [
    (p) => (p.places[0].entryId = 'missing'),
    (p) => (p.pinSizeReferenceEntryId = 'missing'),
    (p) => (p.places[0].mark = null),
    (p) => (p.places[0].mark.size = 1.2),
    (p) => (p.places[0].mark.size = '88%'),
    (p) => (p.places[0].summary.ja = 'あ'.repeat(81)),
    (p) => (p.places[0].summary.en = 'a'.repeat(191)),
    (p) => (p.places[1].services[0].hours = [p.places[0].services[0].hours[0]]),
    (p) => p.places[0].services[0].hours.push(p.places[0].services[0].hours[0]),
  ]) {
    const data = clone();
    change(data);
    assert.throws(() => validateFoodPlaces(data, entries), /Food data/);
  }
});

test('temporary hours are selected inclusively and expire back to the regular version', () => {
  const hours = payload.places.find((p) => p.name.ja === 'スターバックスコーヒー').services[0].hours;
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
    assert.equal(markers.length, payload.places.length);
    for (const m of markers) {
      const p = points.find((p) => p.id === m.id);
      assert.equal(m.x, p.x);
      assert.equal(m.y, p.y);
      assert.equal(m.ids, undefined);
      assert.equal(m.dx, undefined);
      assert.ok(m.size <= Math.max(40, width * FOOD_PIN_MIN_DIAMETER_RATIO));
      assert.ok(m.size >= width * FOOD_PIN_MIN_DIAMETER_RATIO);
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

test('zoomed-in pins grow to the facility pictogram size and keep room to draw', () => {
  const width = 11905; // the 1F map at ten times its full width
  const points = payload.places.map((p) => ({
    id: p.entryId,
    order: p.order,
    x: p.anchor.ja.xRatio * width,
    y: p.anchor.ja.yRatio * width * 0.707,
  }));
  const { markers } = placeFoodMarkers(points, width, payload.pinSizeReferenceEntryId);
  const pictogram = width * FOOD_PIN_MIN_DIAMETER_RATIO;
  for (const m of markers) {
    assert.ok(Math.abs(m.size - pictogram) < 1e-9);
    assert.ok(m.hit >= m.size + m.tail + m.size * 0.1);
  }
  const normal = placeFoodMarkers(points.map((p) => ({ ...p, x: p.x / 10, y: p.y / 10 })), width / 10);
  assert.equal(normal.markers[0].hit, 48);
});

test('hovering the shared area lifts both café and cafeteria pins; hovering a pin lifts only that pin', () => {
  const code = viewerSource.slice(
    viewerSource.indexOf('  hoverPins() {'),
    viewerSource.indexOf('  markHoverPins() {'),
  );
  const context = vm.createContext({});
  vm.runInContext(`this.Hover=class{${code}}`, context);
  const viewer = Object.assign(new context.Hover(), {
    places: payload.places,
    getPlace: (id) => payload.places.find((p) => p.entryId === id),
  });
  const cafeteria = payload.places.find((p) => p.name.ja === 'OIC Cafeteria');
  const cafe = payload.places.find((p) => p.name.ja === 'OIC Café');
  Object.assign(viewer, { hovered: cafeteria.entryId, hoverFromArea: true, hoverKeyboard: false });
  assert.deepEqual([...viewer.hoverPins()].sort(), [cafeteria.entryId, cafe.entryId].sort());
  Object.assign(viewer, { hovered: cafe.entryId, hoverFromArea: false });
  assert.deepEqual([...viewer.hoverPins()], [cafe.entryId]);
  Object.assign(viewer, { hoverKeyboard: true });
  assert.deepEqual([...viewer.hoverPins()], []);
});

test('panning only moves the pins; their size and hit area are rewritten when the zoom changes', () => {
  class Node {
    constructor(parent) {
      Object.assign(this, { parent, children: [], dataset: {}, attributes: {}, hidden: false, firstChild: null });
      this.writes = [];
      this.style = {
        setProperty: (name, value) => this.writes.push([name, value]),
        set transform(value) {
          this.value = value;
        },
        get transform() {
          return this.value;
        },
      };
      this.classList = { toggle() {} };
    }
    get nextElementSibling() {
      const list = this.parent.children;
      return list[list.indexOf(this) + 1] ?? null;
    }
    get firstElementChild() {
      return this.children[0] ?? null;
    }
    getAttribute(name) {
      return this.attributes[name] ?? null;
    }
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
    append(child) {
      child.parent = this;
      this.children.push(child);
    }
    prepend(child) {
      this.children = [child, ...this.children.filter((c) => c !== child)];
    }
    after(child) {
      const list = this.parent.children.filter((c) => c !== child);
      list.splice(list.indexOf(this) + 1, 0, child);
      this.parent.children = list;
    }
  }
  const code = viewerSource.slice(viewerSource.indexOf('  render() {'), viewerSource.indexOf('  reveal() {'));
  const context = vm.createContext({ URL, location: { href: 'http://map.test/' }, placeFoodMarkers });
  vm.runInContext(
    `const getLang = () => 'ja', t = (key) => key, local = (value) => value?.ja ?? '';
     const setAttribute = (node, name, value) => { if (node.getAttribute(name) !== value) node.setAttribute(name, value); };
     this.Pins = class { ${code} }`,
    context,
  );
  const overlay = new Node(null);
  const map = { floorId: '1F', image: { src: 'http://map.test/1F.svg' }, x: 0, y: 0, width: 1190.55, height: 841.89 };
  const viewer = Object.assign(new context.Pins(), {
    ready: true,
    places: payload.places,
    sizeReferenceId: payload.pinSizeReferenceEntryId,
    floorUrls: { ja: '/1F.svg', en: '/en-1F.svg' },
    nodes: new Map(),
    drawn: new Map(),
    overlay,
    button: new Node(null),
    host: { map: () => map },
    getPlace: (id) => payload.places.find((p) => p.entryId === id),
    markerVisual: () => '',
    wireImageFallback() {},
    hoverPins: () => [],
    placeFrontAreas() {},
  });
  context.document = { createElement: () => new Node(overlay) };
  viewer.render();
  const writes = () => [...viewer.nodes.values()].reduce((sum, node) => sum + node.writes.length, 0);
  const sized = writes();
  assert.equal(sized, payload.places.length * 3);
  const before = [...viewer.nodes.values()].map((node) => node.style.transform);
  Object.assign(map, { x: 37, y: -12 });
  viewer.render();
  assert.equal(writes(), sized, 'a pan does not rewrite pin sizes');
  [...viewer.nodes.values()].forEach((node, i) => assert.notEqual(node.style.transform, before[i]));
  Object.assign(map, { width: 1190.55 * 4, height: 841.89 * 4 });
  viewer.render();
  assert.equal(writes(), sized * 2, 'a zoom rewrites every pin once');
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

test('a cancelled pointer does not prevent the next tap from opening a store', () => {
  const { g, target } = gesture();
  g.pointerDown({ target, pointerId: 1, clientX: 10, clientY: 10 });
  g.cancelGesture();
  g.pointerDown({ target, pointerId: 2, clientX: 10, clientY: 10 });
  g.pointerUp({ target, pointerId: 2, clientX: 10, clientY: 10 });
  assert.equal(g.opened, true);
});

test('pictogram removal preserves a compound-path leader dot and an adjacent ATM', () => {
  const svg =
    '<svg viewBox="0 0 40 30"><path fill="#000" d="M21 20 A1 1 0 1 1 19 20 A1 1 0 1 1 21 20 Z M7 5 A2 2 0 1 1 3 5 A2 2 0 1 1 7 5 Z"/><path fill="#fff" d="M4.5 4 L5.5 4 L5.5 6 L4.5 6 Z"/><circle fill="#000" cx="12" cy="5" r="2"/><path id="leader" d="M7 5 L18 20"/></svg>';
  const derived = removeFoodPictograms(
    svg,
    [{ legacyPictogram: { ja: { cx: 5, cy: 5, diameter: 4 } } }],
    'ja',
  );
  assert.match(derived, /M21 20/);
  assert.doesNotMatch(derived, /M7 5 A2/);
  assert.doesNotMatch(derived, /fill="#fff"/);
  assert.match(derived, /<circle fill="#000" cx="12" cy="5" r="2"\/>/);
  assert.match(derived, /<path id="leader" d="M7 5 L18 20"\/>/);
});

test('every pin uses Minamen Cafe size at each zoom without moving its anchor', () => {
  const reference = payload.places.find(
    (p) => p.entryId === payload.pinSizeReferenceEntryId,
  );
  assert.equal(reference.name.ja, 'みなめんcafe');
  for (const width of [320, 390, 1190.55, 11905]) {
    const points = payload.places.map((p) => ({
      id: p.entryId,
      order: p.order,
      x: p.anchor.ja.xRatio * width,
      y: p.anchor.ja.yRatio * width * 0.707,
    }));
    const ref = points.find((p) => p.id === reference.entryId);
    const expected = Math.max(
      Math.min(
        40,
        width * 0.035,
        ...points
          .filter((p) => p !== ref)
          .map((p) => Math.hypot(p.x - ref.x, p.y - ref.y) * 0.8),
      ),
      width * FOOD_PIN_MIN_DIAMETER_RATIO,
    );
    const { markers } = placeFoodMarkers(points, width, reference.entryId);
    assert.equal(new Set(markers.map((m) => m.size)).size, 1);
    assert.equal(markers[0].size, expected);
  }
});

test('hover and selection retain mounted polygon targets until the map language changes', () => {
  class Element {
    constructor() {
      this.children = [];
      this.dataset = {};
      this.style = {};
      this.classes = new Set();
      this.classList = {
        add: (...names) => names.forEach((n) => this.classes.add(n)),
        toggle: (name, on) =>
          on ? this.classes.add(name) : this.classes.delete(name),
      };
    }
    setAttribute() {}
    append(child) {
      child.parent = this;
      this.children.push(child);
    }
    remove() {
      this.parent.children = this.parent.children.filter((child) => child !== this);
    }
    replaceChildren(...children) {
      this.children = children;
    }
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] ?? null;
    }
    querySelectorAll(selector) {
      return this.children.flatMap((child) => [
        ...(child.classes.has(selector.slice(1)) ? [child] : []),
        ...child.querySelectorAll(selector),
      ]);
    }
  }
  const context = vm.createContext({
    lang: 'ja',
    NS: '',
    document: { createElementNS: () => new Element() },
  });
  const code = viewerSource.slice(
    viewerSource.indexOf('  renderAreas() {'),
    viewerSource.indexOf('  render() {'),
  );
  vm.runInContext(
    `const getLang = () => lang; this.Areas=class{${code}}`,
    context,
  );
  const layer = new Element(),
    map = { floorId: '1F', areaLayer: layer };
  const viewer = new context.Areas();
  const overlay = new Element();
  const facilities = entries
    .filter((e) => e.label === 'ATM' && e.polygons?.length)
    .map((e) => ({ entryId: e.id, kind: 'atm' }));
  Object.assign(viewer, {
    ready: true,
    places: payload.places,
    facilities,
    overlay,
    entries: new Map(entries.map((e) => [e.id, e])),
    host: { map: () => map },
    getPlace: (id) => payload.places.find((p) => p.entryId === id),
    getFacility: (id) => facilities.find((f) => f.entryId === id),
  });
  viewer.renderAreas();
  const targets = layer.querySelectorAll('.food-area-hit');
  // Eight store areas plus the second kitchen-car rectangle (one place, two polygons).
  assert.equal(targets.length, 10);
  // The two ATMs are drawn on the pin layer, above the pins, not under them on the map.
  assert.equal(facilities.length, 2);
  const front = overlay.querySelector('.food-front-svg');
  assert.equal(front.querySelectorAll('.food-area-hit').length, 2);
  viewer.hovered = facilities[1].entryId;
  viewer.renderAreas();
  assert.deepEqual(
    front.querySelectorAll('.is-hovered').map((group) => group.dataset.foodPlace),
    [facilities[1].entryId],
  );
  assert.equal(layer.querySelectorAll('.is-hovered').length, 0);
  viewer.hovered = payload.places[0].entryId;
  viewer.renderAreas();
  viewer.hovered = null;
  viewer.browse = true;
  viewer.selected = payload.places[1].entryId;
  viewer.renderAreas();
  assert.deepEqual(layer.querySelectorAll('.food-area-hit'), targets);
  assert.equal(layer.querySelectorAll('.is-selected').length, 1);
  // Selecting the café highlights the cafeteria area it shares.
  const cafe = payload.places.find((p) => p.areaEntryId);
  viewer.selected = cafe.entryId;
  viewer.renderAreas();
  assert.deepEqual(
    layer.querySelectorAll('.is-selected').map((group) => group.dataset.foodPlace),
    [cafe.areaEntryId],
  );
  // Hovering either kitchen-car rectangle lights both of them.
  const kitchenCar = payload.places.find((p) => p.name.ja === 'OICランチストリート' && !p.areaEntryId);
  viewer.selected = null;
  viewer.hovered = kitchenCar.entryId;
  viewer.renderAreas();
  const lit = layer.querySelectorAll('.is-hovered');
  assert.equal(lit.length, 2);
  assert.ok(lit.every((group) => group.dataset.foodArea === kitchenCar.entryId));
  // Each rectangle selects its own place on click, while hover and highlight stay joined.
  const second = payload.places.find((p) => p.areaEntryId === kitchenCar.entryId);
  assert.deepEqual(
    lit.map((group) => group.dataset.foodPlace).sort(),
    [kitchenCar.entryId, second.entryId].sort(),
  );
  viewer.hovered = second.entryId;
  viewer.renderAreas();
  assert.equal(layer.querySelectorAll('.is-hovered').length, 2);
  viewer.hovered = null;
  context.lang = 'en';
  viewer.renderAreas();
  assert.notEqual(layer.querySelectorAll('.food-area-hit')[0], targets[0]);
  map.floorId = '2F';
  viewer.renderAreas();
  assert.equal(layer.children.length, 0);
});

test('mouse hover over a store polygon requests the same overview as its pin', () => {
  const context = vm.createContext({});
  const code = viewerSource.slice(
    viewerSource.indexOf('  hoverEvent(event) {'),
    viewerSource.indexOf('  leaveEvent(event) {'),
  );
  vm.runInContext(`this.Hover=class{${code}}`, context);
  const viewer = new context.Hover();
  const calls = [];
  viewer.showHover = (id) => calls.push(id);
  const target = {
    closest: () => ({ dataset: { foodPlace: payload.places[2].entryId } }),
  };
  for (const pointerType of ['touch', 'pen', 'mouse'])
    viewer.hoverEvent({ target, pointerType, clientX: 100, clientY: 200 });
  assert.deepEqual(calls, [payload.places[2].entryId]);
  viewer.pointer = { cancelled: true };
  viewer.hoverEvent({ target, pointerType: 'mouse' });
  assert.equal(calls.length, 1);
  viewer.pointer = null;
  viewer.panelMode = 'detail';
  viewer.hoverEvent({ target, pointerType: 'mouse' });
  assert.equal(calls.length, 1);
});

test('closing finishes after the fade and cannot hide a newly selected card', () => {
  let finish;
  const context = vm.createContext({
    matchMedia: () => ({ matches: false }),
    clearTimeout: () => {},
    setTimeout: (fn) => {
      finish = fn;
    },
  });
  const code = viewerSource.slice(
    viewerSource.indexOf('  close({'),
    viewerSource.indexOf('  externalChange()'),
  );
  vm.runInContext(`this.Close=class{${code}}`, context);
  const viewer = new context.Close();
  Object.assign(viewer, {
    action: 0,
    panelMode: 'detail',
    panel: {
      hidden: false,
      classList: { add() {}, remove() {} },
      style: { removeProperty() {}, transform: '' },
      setAttribute() {},
    },
    hideHover() {},
    renderAreas() {},
    render() {},
    scheduleHours() {},
    host: { clearSelection() {} },
  });
  viewer.close();
  assert.equal(viewer.panelMode, null);
  assert.equal(viewer.panel.inert, true);
  assert.equal(viewer.panel.hidden, false);
  finish();
  assert.equal(viewer.panel.hidden, true);
  viewer.panel.hidden = false;
  viewer.panelMode = 'detail';
  viewer.close();
  viewer.action++;
  viewer.panelMode = 'detail';
  finish();
  assert.equal(viewer.panel.hidden, false);
});
