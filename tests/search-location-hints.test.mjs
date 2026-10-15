import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { readCanonicalSearchData } from '../scripts/search-data-runtime.mjs';
import { validateSearchData } from '../scripts/search-data-validation.mjs';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function viewer() {
  const context = vm.createContext({
    state: {}, lang: 'ja', getLang: () => context.lang,
    FLOOR_FILES: ['1F', '2F', '3F', '4F', '5F', 'A-6-9F', 'H-6-9F'].map(id => ({ id })),
    getFloorDefinition: () => ({ id: '1F' }), getFloorLabel: id => id,
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    hydrateFacilityAreaPolygons: value => value || [],
    STATIC_HASH_ROUTES: new Set(['about', 'contact'])
  });
  for (const name of [
    'normalizeSearchValue', 'normalizeHashRouteId', 'createHashSlugPart',
    'getFloorOrder', 'getEntryFloorLabel', 'sanitizeAliases', 'normalizeRect',
    'createEntrySearchTerms', 'hydrateManualEntry', 'serializeEntries',
    'getLocalizedEntryLocationHint', 'getEntrySearchTerms', 'getEntryHashBase',
    'addEntryHashRoute', 'assignSearchEntryHashRoutes', 'upgradeStoredEditorSnapshot'
  ]) {
    const definition = source.match(new RegExp(`^  (?:async )?function ${name}\\([^]*?^  }`, 'm'));
    assert.ok(definition, `Missing viewer function: ${name}`);
    vm.runInContext(definition[0], context);
  }
  return context;
}

test('only the nine duplicate groups have distinct Japanese and English location hints', async () => {
  const { entries } = await readCanonicalSearchData();
  const groups = Map.groupBy(entries, entry => `${entry.floorId}|${entry.label}`);
  const duplicates = [...groups.values()].filter(group => group.length > 1);
  assert.equal(duplicates.length, 9);
  assert.equal(entries.filter(entry => entry.locationHint).length, 18);
  for (const group of groups.values()) {
    if (group.length === 1) {
      assert.equal(group[0].locationHint, undefined);
      assert.equal(group[0].locationHintEn, undefined);
    } else {
      for (const key of ['locationHint', 'locationHintEn']) {
        assert.ok(group.every(entry => typeof entry[key] === 'string' && entry[key].trim()));
        assert.equal(new Set(group.map(entry => entry[key])).size, group.length);
      }
    }
  }
});

test('hints survive editing and export, localize, and participate in search', async () => {
  const payload = await readCanonicalSearchData();
  const context = viewer();
  const hydrated = payload.entries.map(entry => context.hydrateManualEntry(entry));
  assert.deepEqual(plain(context.serializeEntries(hydrated)), payload.entries);
  for (const entry of hydrated.filter(entry => entry.locationHint)) {
    context.lang = 'ja';
    assert.equal(context.getLocalizedEntryLocationHint(entry), entry.locationHint);
    context.lang = 'en';
    assert.equal(context.getLocalizedEntryLocationHint(entry), entry.locationHintEn);
    for (const hint of [entry.locationHint, entry.locationHintEn]) {
      assert.ok(entry.searchTerms.includes(context.normalizeSearchValue(hint)));
    }
  }
  const ordinary = payload.entries.find(entry => !entry.locationHint);
  assert.equal(context.getLocalizedEntryLocationHint(ordinary), '');
  assert.ok(context.getEntrySearchTerms(ordinary).length > 0);
});

test('adding hints leaves every existing hash route and its target unchanged', async () => {
  const { entries } = await readCanonicalSearchData();
  const context = viewer();
  const routes = withHints => {
    const hydrated = entries.map(({ locationHint, locationHintEn, ...entry }) =>
      context.hydrateManualEntry(withHints ? { ...entry, locationHint, locationHintEn } : entry));
    context.assignSearchEntryHashRoutes(hydrated);
    return [...context.state.searchRouteIndex].map(([hash, entry]) => [hash, entry.id]);
  };
  assert.deepEqual(routes(true), routes(false));
});

test('older editor drafts gain missing hints while retaining edited positions', async () => {
  const { entries } = await readCanonicalSearchData();
  const context = viewer();
  const current = entries.find(entry => entry.locationHint);
  const { locationHint, locationHintEn, ...old } = current;
  const draftEntry = context.hydrateManualEntry({ ...old,
    rects: [{ ...old.rects[0], xRatio: old.rects[0].xRatio + 0.001 }] });
  const upgraded = context.upgradeStoredEditorSnapshot({ exists: true, version: 3, entries: [draftEntry] }, [current]);
  assert.equal(upgraded.entries[0].locationHint, locationHint);
  assert.equal(upgraded.entries[0].locationHintEn, locationHintEn);
  assert.deepEqual(plain(upgraded.entries[0].rects), plain(draftEntry.rects));
  assert.ok(upgraded.entries[0].searchTerms.includes(context.normalizeSearchValue(locationHintEn)));
});

test('validation flags missing translations or indistinguishable hints', async () => {
  const payload = await readCanonicalSearchData();
  const entry = payload.entries.find(entry => entry.locationHint);
  delete entry.locationHintEn;
  let report = validateSearchData(payload);
  assert.ok(report.errors.some(error => error.code === 'invalid-location-hint'));
  assert.equal(report.warnings.filter(warning => warning.code === 'same-floor-label').length, 1);
  const other = payload.entries.find(candidate => candidate.id !== entry.id && candidate.floorId === entry.floorId && candidate.label === entry.label);
  entry.locationHint = other.locationHint;
  entry.locationHintEn = other.locationHintEn;
  report = validateSearchData(payload);
  assert.deepEqual(report.errors, []);
  assert.equal(report.warnings.filter(warning => warning.code === 'same-floor-label').length, 1);
});
