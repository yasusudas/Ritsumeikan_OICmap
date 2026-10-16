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
  const timers = [];
  Object.assign(window, {
    setTimeout: (callback) => timers.push(callback),
    clearTimeout: () => timers.splice(0),
  });
  const context = vm.createContext({
    window,
    isEditorSite: false,
    foodGuide: null,
    ZOOM_RASTER_SETTLE_MS: 140,
    ZOOM_RASTER_EVERY_FRAMES: every,
    canvasLayer: { style: {} },
    frontLayer: { style: {} },
    state: { baseWidth: 1000, baseHeight: 700, zoom: 1, x: 0, y: 0, renderedZoom: 0, zoomRasterTimer: 0, zoomFramesSinceRaster: 0, lastFlushedZoom: 0 },
    setStatus() {},
    getFloorLabel: () => '1F',
    getRenderedFloorDefinition: () => ({ id: '1F' }),
  });
  loadFunctions(context, ['shouldDeferZoomRaster', 'commitZoomRaster', 'flushViewRender', 'mirrorFrontLayer']);
  context.flushViewRender();
  context.settle = () => timers.splice(0).forEach((callback) => callback());
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
