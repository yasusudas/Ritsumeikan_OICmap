import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { FACILITY_PLACES, FACILITY_TEXT, facilityAnchor } from '../src/facility-places.js';

const index = JSON.parse(readFileSync(new URL('../public/manual-search-index.json', import.meta.url), 'utf8'));
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('each facility has a search entry with an area, and the hint tells the two ATMs apart', () => {
  assert.equal(FACILITY_PLACES.length, 2);
  for (const facility of FACILITY_PLACES) {
    const entry = index.entries.find((candidate) => candidate.id === facility.entryId);
    assert.ok(entry?.polygons?.length, facility.entryId);
    assert.equal(entry.floorId, '1F');
    const anchor = facilityAnchor(entry);
    assert.ok(anchor.xRatio > 0 && anchor.xRatio < 1 && anchor.yRatio > 0 && anchor.yRatio < 1);
  }
  const [corner, seven] = FACILITY_PLACES.map((facility) => index.entries.find((entry) => entry.id === facility.entryId));
  // The corner by the C building's top edge (it was first labelled D by mistake), and 7-Eleven's own ATM.
  assert.equal(corner.locationHint, 'C棟');
  assert.equal(corner.locationHintEn, 'Building C');
  assert.equal(FACILITY_PLACES[0].building.ja, corner.locationHint);
  assert.equal(seven.locationHint, 'セブン-イレブン');
  assert.doesNotMatch(JSON.stringify(FACILITY_PLACES), /D棟|Building D/);
});

test('the ATM cards give the banks and the hours in both languages', () => {
  for (const facility of FACILITY_PLACES) {
    assert.ok(facility.institutions.length > 0);
    for (const item of [...facility.institutions, facility.hours, facility.summary, facility.building]) {
      assert.ok(item.ja?.trim() && item.en?.trim());
    }
  }
  const [corner, seven] = FACILITY_PLACES;
  // AEON Bank's ATM was removed, so it is not listed; the 7-Eleven one needs no store name.
  assert.deepEqual(corner.institutions.map((item) => item.ja), ['三井住友銀行', '京都中央信用金庫']);
  assert.deepEqual(seven.institutions.map((item) => item.ja), ['セブン銀行ATM']);
  assert.doesNotMatch(JSON.stringify(FACILITY_PLACES), /イオン|AEON|AIM|出張所/);
  // The March 2024 floor guide: the two banks differ only on Sundays and holidays; the Seven Bank ATM keeps shorter hours.
  assert.equal(
    corner.hours.ja,
    '平日 8:00–22:00\n土曜 8:00–20:00\n日曜・祝日\n\u3000三井住友銀行 休業\n\u3000京都中央信用金庫 8:00–20:00',
  );
  assert.equal(seven.hours.ja, '平日 8:00–19:00\n土曜・日曜・祝日 8:00–18:00');
  assert.ok(FACILITY_TEXT.note.ja && FACILITY_TEXT.note.en);
});

test('the sources page names where the ATM hours come from, in both languages', () => {
  const ja = read('sources/index.html'), en = read('en/sources/index.html');
  assert.ok(ja.includes('フロアガイド（2024年3月発行）') && ja.includes('ATM取扱時間'));
  assert.ok(en.includes('Floor Guide (issued March 2024)') && en.includes('ATM service hours'));
  for (const file of ['sources/index.html', 'en/sources/index.html']) {
    // The 2024 edition, not the March 2016 one that is also on the university site.
    assert.match(read(file), /ritsumei\.ac\.jp\/cias\/file\/about\/floor_guide\.pdf/);
    assert.doesNotMatch(read(file), /oic-floorguide\.pdf/);
    assert.match(read(file), /e-map\.ne\.jp\/smt\/smbcbank\/inf\/5811308900000/);
  }
});
