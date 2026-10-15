import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

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
    canvasLayer: { style: {} },
    state: { baseWidth: 1000, baseHeight: 700, zoom: 1, x: 0, y: 0, renderedZoom: 0, zoomRasterTimer: 0 },
    setStatus() {},
    getFloorLabel: () => '1F',
    getRenderedFloorDefinition: () => ({ id: '1F' }),
  });
  loadFunctions(context, ['shouldDeferZoomRaster', 'commitZoomRaster', 'flushViewRender']);
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
