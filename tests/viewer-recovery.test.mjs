import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const noop = () => {};

// Exercise the actual viewer functions without introducing browser dependencies.
function loadFunctions(context, names) {
  for (const name of names) {
    const definition = source.match(new RegExp(`^  (?:async )?function ${name}\\([^]*?^  }`, 'm'));
    assert.ok(definition, `Missing viewer function: ${name}`);
    vm.runInContext(definition[0], context);
  }
}

function facilityViewer(floorId) {
  const state = {
    floorIndex: 0,
    facilityReturnFloorId: null,
    facilityToggleState: { printer: 0, atm: 0, nursingRoom: 0, toilet: 0 }
  };
  const floors = [floorId, ...['1F', '2F', '3F', 'H-6-9F'].filter(id => id !== floorId)].map(id => ({ id }));
  const context = vm.createContext({
    state, FLOOR_FILES: floors, isEditorSite: false,
    searchResults: {},
    getFloorDefinition: () => floors[state.floorIndex],
    isSpecialFloorActive: () => state.facilityToggleState.printer === 1,
    deactivateSpecialFloorToggle: () => {
      const active = state.facilityToggleState.printer === 1;
      state.facilityToggleState.printer = 0;
      return active;
    },
    renderFloor: async () => {},
    clearFacilityAreaDraft: noop, clearMapSelectionsForSpecialFloor: noop,
    renderFacilityToggleButtons: noop, updateMobileFloorSelection: noop,
    updateTabSelection: noop, renderFacilityAreas: noop, renderFacilityRings: noop
  });
  vm.runInContext(source.match(/^  const FACILITY_FLOOR_BY_KEY = .*;$/m)[0], context);
  loadFunctions(context, ['setFacilityToggleState', 'setActiveFloor']);
  return context;
}

test('selecting the underlying floor exits the printer map in the floor dropdown', async () => {
  const viewer = facilityViewer('1F');
  await viewer.setFacilityToggleState('printer', 1);
  let click;
  viewer.mobileFloorOptions = [{ dataset: { floor: '1F' }, addEventListener: (_, handler) => { click = handler; } }];
  viewer.setMobileFloorListOpen = noop;
  const start = source.indexOf('\n  mobileFloorOptions.forEach((button) => {');
  const end = source.indexOf('  tabButtons.forEach', start);
  vm.runInContext(source.slice(start, end), viewer);
  click();
  assert.equal(viewer.getFloorDefinition().id, '1F');
  assert.equal(viewer.state.facilityToggleState.printer, 0);
});

for (const floor of ['1F', '3F', 'H-6-9F']) {
  test(`ATM selection goes to 1F and deselection returns to ${floor}`, async () => {
    const viewer = facilityViewer(floor);
    await viewer.setFacilityToggleState('atm', 1);
    assert.equal(viewer.getFloorDefinition().id, '1F');
    assert.equal(viewer.state.facilityToggleState.atm, 1);
    await viewer.setFacilityToggleState('atm', 0);
    assert.equal(viewer.getFloorDefinition().id, floor);
    assert.equal(viewer.state.facilityReturnFloorId, null);
  });
}

test('switching between nursing space and ATM preserves the original floor', async () => {
  const viewer = facilityViewer('3F');
  await viewer.setFacilityToggleState('nursingRoom', 1);
  assert.equal(viewer.getFloorDefinition().id, '2F');
  await viewer.setFacilityToggleState('atm', 1);
  assert.equal(viewer.getFloorDefinition().id, '1F');
  assert.equal(viewer.state.facilityToggleState.nursingRoom, 0);
  await viewer.setFacilityToggleState('nursingRoom', 1);
  assert.equal(viewer.getFloorDefinition().id, '2F');
  await viewer.setFacilityToggleState('nursingRoom', 0);
  assert.equal(viewer.getFloorDefinition().id, '3F');
});

test('switching from ATM restores the floor and keeps the newly selected facility active', async () => {
  for (const next of ['toilet', 'printer']) {
    const viewer = facilityViewer('3F');
    await viewer.setFacilityToggleState('atm', 1);
    await viewer.setFacilityToggleState(next, 1);
    assert.equal(viewer.getFloorDefinition().id, '3F');
    assert.equal(viewer.state.facilityToggleState[next], 1);
    assert.equal(viewer.state.facilityToggleState.atm, 0);
    assert.equal(viewer.state.facilityReturnFloorId, null);
  }
});

function element() {
  return {
    children: [], dataset: {}, attributes: {}, classList: { add: noop },
    setAttribute(key, value) { this.attributes[key] = value; },
    replaceChildren(...children) { this.children = children; },
    append(...children) { this.children.push(...children); }
  };
}

function searchViewer(fetchEntries) {
  const rings = [{ id: 'already-loaded-ring' }];
  const state = {
    searchReady: false, searchLoading: false, searchLoadError: false, searchPromise: null,
    searchEntries: [], searchSuggestions: [], activeSuggestionIndex: -1,
    baseSearchEntries: [], manualEntries: [], facilityRings: rings, baseFacilityRings: rings
  };
  const context = vm.createContext({
    state, isEditorSite: false, console: { warn: noop },
    searchInput: { value: 'AC130' }, searchClearButton: {}, searchResults: element(),
    document: { createElement: element, createDocumentFragment: element },
    t: key => key, setSearchFeedback: noop, getActiveSearchEntry: () => null,
    normalizeSearchValue: value => value.toLowerCase(),
    getEntrySearchTerms: entry => [entry.label.toLowerCase()],
    getLocalizedEntryLabel: entry => entry.label, getEntryFloorLabel: entry => entry.floorId,
    SEARCH_RESULT_LIMIT: 18,
    fetchBundledSearchEntries: fetchEntries,
    refreshSearchEntries: () => { state.searchEntries = state.manualEntries; },
    renderSearchHighlights: noop, renderFacilityAreas: noop, renderFacilityRings: noop
  });
  loadFunctions(context, ['renderSearchSuggestions', 'buildSearchIndex']);
  return context;
}

test('failed search loads remain retryable; recovery retains the query and facility rings', async () => {
  let attempts = 0;
  const entries = [{ id: 'ac130', label: 'AC130', floorId: '1F' }];
  const viewer = searchViewer(async () => {
    if (++attempts <= 2) throw new Error('offline');
    return entries;
  });
  const rings = viewer.state.facilityRings;
  for (let i = 0; i < 2; i++) {
    await viewer.buildSearchIndex();
    assert.equal(viewer.state.searchReady, false);
    assert.equal(viewer.state.searchLoading, false);
    assert.equal(viewer.state.searchLoadError, true);
    assert.equal(viewer.state.searchPromise, null);
    assert.equal(viewer.searchResults.children[0].textContent, 'search.feedback.loadError');
    assert.equal(viewer.searchResults.children[1].dataset.searchRetry, '');
    assert.equal(viewer.state.facilityRings, rings);
  }
  await viewer.buildSearchIndex();
  assert.equal(attempts, 3);
  assert.equal(viewer.state.searchReady, true);
  assert.equal(viewer.state.searchLoadError, false);
  assert.equal(viewer.searchInput.value, 'AC130');
  assert.equal(viewer.state.searchSuggestions[0].id, 'ac130');
  assert.equal(viewer.state.facilityRings, rings);
  assert.equal(viewer.searchResults.attributes.role, 'listbox');
  await viewer.buildSearchIndex();
  assert.equal(attempts, 3);
});

test('concurrent search requests share a fetch and show loading instead of no matches', async () => {
  let calls = 0;
  let resolve;
  const viewer = searchViewer(() => {
    calls++;
    return new Promise(done => { resolve = done; });
  });
  const first = viewer.buildSearchIndex();
  const second = viewer.buildSearchIndex();
  assert.equal(calls, 1);
  assert.equal(viewer.searchResults.children[0].textContent, 'search.feedback.loading');
  resolve([]);
  await Promise.all([first, second]);
  assert.equal(viewer.state.searchReady, true);
  assert.equal(viewer.state.searchLoadError, false);
  assert.equal(viewer.searchResults.children[0].textContent, 'search.feedback.noDataRegistered');
});
