import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const every = Number(source.match(/const ZOOM_RASTER_EVERY_FRAMES = (\d+);/)[1]);

function loadFunctions(context, names) {
  for (const name of names) {
    const definition = source.match(new RegExp(`^  (?:async )?function ${name}\\([^]*?^  }`, 'm'));
    assert.ok(definition, `Missing viewer function: ${name}`);
    vm.runInContext(definition[0], context);
  }
}

// A map viewer in a browser described by `window`, with timers run by hand.
function viewer(window) {
  const timers = new Map();
  let now = 0, nextTimer = 0;
  Object.assign(window, {
    setTimeout: (callback, delay) => { timers.set(++nextTimer, { callback, due: now + delay }); return nextTimer; },
    clearTimeout: (id) => timers.delete(id),
  });
  const context = vm.createContext({
    window,
    performance: { now: () => now },
    isEditorSite: false,
    foodGuide: null,
    ZOOM_RASTER_SETTLE_MS: 140,
    ZOOM_RASTER_EVERY_FRAMES: every,
    canvasLayer: { style: {} },
    frontLayer: { style: {} },
    state: { baseWidth: 1000, baseHeight: 700, zoom: 1, x: 0, y: 0, renderedZoom: 0, zoomRasterTimer: 0, zoomLastInputAt: null, zoomFramesSinceRaster: 0, lastFlushedZoom: 0 },
    setStatus() {},
    getFloorLabel: () => '1F',
    getRenderedFloorDefinition: () => ({ id: '1F' }),
  });
  loadFunctions(context, ['zoomRasterDelayFromInput', 'recordMapInput', 'shouldDeferZoomRaster', 'commitZoomRaster', 'flushViewRender', 'mirrorFrontLayer']);
  context.flushViewRender();
  context.timers = timers;
  context.at = value => { now = value; };
  context.fire = () => {
    const id = context.state.zoomRasterTimer, timer = timers.get(id);
    assert.ok(timer, 'pending zoom timer');
    timers.delete(id);
    timer.callback();
  };
  context.settle = () => {
    if (!timers.size) return;
    now = Math.max(...[...timers.values()].map(timer => timer.due));
    for (const [id, timer] of [...timers]) { timers.delete(id); timer.callback(); }
  };
  return context;
}

const chrome = () => ({ matchMedia: () => ({ matches: false }) });
const safari = () => ({ ...chrome(), GestureEvent: function GestureEvent() {} });
const phone = () => ({ matchMedia: (query) => ({ matches: query === '(pointer: coarse)' }) });

test('Chrome on a computer redraws the map at its new size on every zoom frame', () => {
  const map = viewer(chrome());
  map.state.zoom = 2;
  map.flushViewRender();
  assert.equal(map.canvasLayer.style.width, '2000px');
  assert.doesNotMatch(map.canvasLayer.style.transform, /scale/);
});

test('the ring layer in front of the pins always has the canvas layer\'s size and transform', () => {
  for (const window of [chrome(), safari(), phone()]) {
    const map = viewer(window);
    const same = () =>
      ['width', 'height', 'transform'].every((key) => map.frontLayer.style[key] === map.canvasLayer.style[key]);
    assert.ok(same());
    map.state.zoom = 2.5;
    map.state.x = 40;
    map.flushViewRender();
    assert.ok(same(), 'while zooming (scaled or redrawn)');
    map.settle();
    assert.ok(same(), 'once the zoom settles');
    assert.equal(map.frontLayer.style.width, `${1000 * 2.5}px`);
  }
});

for (const [name, window] of [['Safari on a Mac', safari], ['a touch screen', phone]]) {
  test(`${name} scales the drawn map while zooming and redraws it once the zoom settles`, () => {
    const map = viewer(window());
    map.state.zoom = 2;
    map.flushViewRender();
    assert.equal(map.canvasLayer.style.width, '1000px');
    assert.match(map.canvasLayer.style.transform, /scale\(2\)/);
    map.settle();
    assert.equal(map.canvasLayer.style.width, '2000px');
    assert.doesNotMatch(map.canvasLayer.style.transform, /scale/);
  });
}

test('while the zoom keeps changing, every few zoom frames are redrawn at their real size; panning does not count', () => {
  const map = viewer(phone());
  const widths = [];
  for (let frame = 1; frame <= every * 2; frame++) {
    map.state.zoom = 1 + frame / 10;
    map.flushViewRender();
    widths.push(map.canvasLayer.style.width);
    // A pan frame in between keeps the zoom and must not bring the redraw forward.
    map.state.x += 5;
    map.flushViewRender();
  }
  const redrawn = widths
    .map((width, i) => (Math.abs(parseFloat(width) - 1000 * (1 + (i + 1) / 10)) < 0.01 ? i + 1 : 0))
    .filter(Boolean);
  assert.deepEqual(redrawn, [every, every * 2]);
  assert.ok(every > 1, 'the drawn map is scaled on the frames in between');
});

test('a delayed render keeps the last input plus 140ms deadline', () => {
  const map = viewer(safari());
  map.recordMapInput();
  map.state.zoom = 2;
  map.at(70);
  map.flushViewRender();
  assert.equal(map.timers.get(map.state.zoomRasterTimer).due, 140);
  map.at(140);
  map.fire();
  assert.equal(map.canvasLayer.style.width, '2000px');
  assert.equal(map.state.zoomLastInputAt, null);
});

test('new input cancels the old timer and even a stale callback cannot redraw early', () => {
  const map = viewer(safari());
  map.recordMapInput(); map.state.zoom = 2; map.flushViewRender();
  const stale = map.timers.get(map.state.zoomRasterTimer).callback;
  map.at(100); map.recordMapInput();
  map.at(140); stale();
  assert.equal(map.canvasLayer.style.width, '1000px');
  assert.equal(map.timers.get(map.state.zoomRasterTimer).due, 240);
  map.at(240); map.fire();
  assert.equal(map.canvasLayer.style.width, '2000px');
});

test('continuing pan input moves the pending zoom deadline without advancing the raster cadence', () => {
  const map = viewer(phone());
  map.recordMapInput(); map.state.zoom = 2; map.flushViewRender();
  map.at(130); map.recordMapInput(); map.state.x = 20; map.flushViewRender();
  assert.equal(map.timers.get(map.state.zoomRasterTimer).due, 270);
  assert.equal(map.state.zoomFramesSinceRaster, 1);
  map.at(270); map.fire();
  assert.equal(map.canvasLayer.style.width, '2000px');
  assert.equal(map.frontLayer.style.transform, map.canvasLayer.style.transform);
});

test('programmatic zoom without map input retains its existing 140ms render delay', () => {
  const map = viewer(safari());
  map.at(300); map.state.zoom = 2; map.flushViewRender();
  assert.equal(map.timers.get(map.state.zoomRasterTimer).due, 440);
  map.at(440); map.fire();
  assert.equal(map.canvasLayer.style.width, '2000px');
});
