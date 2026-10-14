import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const i18n = readFileSync(new URL('../src/i18n.js', import.meta.url), 'utf8');
const noop = () => {};
const tick = () => new Promise(resolve => setImmediate(resolve));

function loadMain(context, names) {
  for (const name of names) {
    const definition = main.match(new RegExp(`^  (?:async )?function ${name}\\([^]*?^  }`, 'm'));
    assert.ok(definition, `Missing viewer function: ${name}`);
    vm.runInContext(definition[0], context);
  }
}

test('viewer language switching keeps query/hash/history state without navigating or reloading', () => {
  let url = new URL('https://rits-oic-map.app/?source=campus#2f-room-2');
  let navigations = 0;
  const retained = { retained: true };
  const events = [];
  const location = {
    get pathname() { return url.pathname; },
    get href() { return url.href; },
    set href(value) { navigations++; url = new URL(value, url); }
  };
  const context = vm.createContext({
    URL, document: { body: { dataset: { appMode: 'viewer' } } },
    window: { location,
      history: { state: retained, replaceState: (state, _, target) => {
        assert.equal(state, retained);
        url = new URL(target, url);
      } },
      localStorage: { setItem: noop }, dispatchEvent: event => events.push(event)
    },
    applyI18n: noop, LANGUAGE_STORAGE_KEY: 'language', LANGUAGE_CHANGE_EVENT: 'languagechange',
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }
  });
  vm.runInContext("let currentLang = 'ja';", context);
  vm.runInContext(i18n.match(/^export function setLang\([^]*?^}/m)[0].replace('export ', ''), context);
  context.setLang('en');
  assert.equal(url.href, 'https://rits-oic-map.app/en/?source=campus#2f-room-2');
  context.setLang('ja');
  assert.equal(url.href, 'https://rits-oic-map.app/?source=campus#2f-room-2');
  assert.equal(navigations, 0);
  assert.deepEqual(events.map(event => event.detail.lang), ['en', 'ja']);
});

test('language refresh retains whether search suggestions were open or closed', () => {
  for (const hidden of [true, false]) {
    const context = vm.createContext({
      Intl, state: { baseWidth: 0 }, isEditorSite: false,
      searchResults: { hidden }, searchInput: { value: '' },
      getLocale: () => 'en', applyI18n: noop, updateTabSelection: noop,
      isSiteMenuOpen: () => false, setSiteMenuOpen: noop,
      renderFacilityMoreSelection: noop, refreshSearchEntries: noop,
      getActiveSearchEntry: () => null,
      renderSearchSuggestions: () => { context.searchResults.hidden = false; },
      renderSearchHighlights: noop, renderFacilityAreas: noop, renderFacilityRings: noop,
      renderAssetLoadFeedback: noop
    });
    loadMain(context, ['refreshLanguageDependentUi']);
    context.refreshLanguageDependentUi();
    assert.equal(context.searchResults.hidden, hidden);
  }
});

function element() {
  return {
    children: [], style: {}, handlers: {},
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    addEventListener(type, handler) { this.handlers[type] = handler; }
  };
}

function assets() {
  const state = {
    floorLoadToken: 0, floorLoadError: null,
    facilityToggleRequestId: 0, facilityRingsFailedKey: null,
    facilityRingsReady: false, facilityRingsLoading: false,
    facilityToggleState: { toilet: 0, printer: 1 },
    facilityRings: []
  };
  const context = vm.createContext({
    state, isEditorSite: false, console: { error: noop, warn: noop },
    document: { createElement: element }, canvasLayer: element(), assetLoadFeedback: element(),
    computeViewerSafeInsets: () => ({ top: 100 }), getFacilityLabel: key => key,
    t: key => key, setStatus: noop,
    captureViewportCenterRatios: () => ({ xRatio: 0.4, yRatio: 0.6 }),
    getRenderedFloorDefinition: () => ({ id: '1F' }), getFloorLabel: floor => floor.id,
    fetchSvgAsset: async () => ({ width: 100, height: 100 }),
    createFloorImageNode: () => ({ style: {}, decode: async () => {} }),
    getPrefersReducedMotion: () => true, applyMapLayout: noop,
    renderSearchHighlights: noop, renderFacilityAreas: noop, renderFacilityRings: noop,
    setFacilityToggleState: async (key, value) => {
      for (const candidate of Object.keys(state.facilityToggleState)) {
        state.facilityToggleState[candidate] = candidate === key ? value : 0;
      }
    }
  });
  loadMain(context, ['renderAssetLoadFeedback', 'renderFloor', 'ensureFacilityRingsLoaded', 'toggleFacilityToggleState']);
  return context;
}

test('image decoding failures expose a retry; retry restores the intended floor view', async () => {
  const context = assets();
  const attempts = [];
  context.createFloorImageNode = (_, options) => {
    attempts.push(options);
    return { style: {}, decode: async () => {
      if (attempts.length === 1) throw Error('SVG unavailable');
    } };
  };
  await context.renderFloor({ resetZoom: true });
  assert.equal(context.state.floorLoadError.resetZoom, true);
  assert.equal(context.assetLoadFeedback.hidden, false);
  assert.equal(context.assetLoadFeedback.children[0].children[0].textContent, 'status.floorError');
  context.assetLoadFeedback.children[0].children[1].handlers.click();
  await tick();
  assert.equal(attempts[1].retry, true);
  assert.equal(context.state.floorLoadError, null);
  assert.equal(context.assetLoadFeedback.hidden, true);
  assert.equal(context.canvasLayer.children.length, 1);
});

test('an older floor image failure cannot clear a newer successful floor', async () => {
  const context = assets();
  let rejectOld;
  let calls = 0;
  context.createFloorImageNode = () => ({ style: {}, decode: () => {
    if (++calls === 1) return new Promise((_, reject) => { rejectOld = reject; });
    return Promise.resolve();
  } });
  const oldRender = context.renderFloor();
  await tick();
  await context.renderFloor();
  const newerMap = context.canvasLayer.children[0];
  rejectOld(Error('old floor failed'));
  await oldRender;
  assert.equal(context.canvasLayer.children[0], newerMap);
  assert.equal(context.state.floorLoadError, null);
});

test('ring load failure preserves selection and retries the requested facility', async () => {
  const context = assets();
  let calls = 0;
  context.fetchBundledFacilityRings = async () => {
    if (++calls === 1) throw Error('offline');
    return [{ facilityKey: 'toilet' }];
  };
  await context.toggleFacilityToggleState('toilet');
  assert.equal(context.state.facilityToggleState.printer, 1);
  assert.equal(context.state.facilityRingsFailedKey, 'toilet');
  assert.equal(context.assetLoadFeedback.hidden, false);
  context.assetLoadFeedback.children[0].children[1].handlers.click();
  await tick();
  assert.equal(context.state.facilityToggleState.toilet, 1);
  assert.equal(context.state.facilityRingsFailedKey, null);
  assert.equal(context.state.facilityRingsReady, true);
  assert.equal(context.assetLoadFeedback.hidden, true);
});

test('a stale ring request cannot replace a later facility choice with an error', async () => {
  const context = assets();
  context.state.facilityToggleState.printer = 0;
  let reject;
  context.fetchBundledFacilityRings = () => new Promise((_, fail) => { reject = fail; });
  const first = context.toggleFacilityToggleState('toilet');
  await context.toggleFacilityToggleState('printer');
  reject(Error('offline'));
  await first;
  assert.equal(context.state.facilityToggleState.printer, 1);
  assert.equal(context.state.facilityRingsFailedKey, null);
});

test('keyboard selection scrolls only enough to bring the active result into view', () => {
  let row = { top: 180, bottom: 220 };
  const list = {
    scrollTop: 0, clientTop: 1, clientHeight: 100,
    getBoundingClientRect: () => ({ top: 50 }),
    querySelector: () => ({ getBoundingClientRect: () => row })
  };
  const context = vm.createContext({ searchResults: list });
  loadMain(context, ['scrollActiveSearchSuggestionIntoView']);
  context.scrollActiveSearchSuggestionIntoView();
  assert.equal(list.scrollTop, 69);
  row = { top: 30, bottom: 70 };
  context.scrollActiveSearchSuggestionIntoView();
  assert.equal(list.scrollTop, 48);
  row = { top: 70, bottom: 110 };
  context.scrollActiveSearchSuggestionIntoView();
  assert.equal(list.scrollTop, 48);
});
