import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LUNCH_STREET_PERIOD,
  LUNCH_STREET_SCHEDULE,
  getLunchStreetPayload,
  lunchStreetImage,
  lunchStreetTag,
  japanDateLabel,
} from '../src/server/lunch-street.js';
import { FOOD_TRUCKS_SOURCE, getFoodTrucksPayload } from '../src/server/food-trucks.js';
import { judgeFoodTruckStatus } from '../src/food-guide-model.js';

const at = (jst) => new Date(`${jst}+09:00`);

test('each lunch-street spot follows its own vendors and the exact opening and closing minute', () => {
  for (const [time, expected] of [['10:29:59', 'outside'], ['10:30:00', 'within'], ['15:29:59', 'within'], ['15:30:00', 'outside']]) {
    const now = at(`2026-10-20T${time}`);
    const payload = getLunchStreetPayload(now);
    for (const spot of ['plaza', 'terrace'])
      assert.equal(judgeFoodTruckStatus(spot, { now, payload }).state, expected, `${spot} ${time}`);
  }
  const now = at('2026-10-19T12:00:00');
  const payload = getLunchStreetPayload(now);
  assert.equal(judgeFoodTruckStatus('plaza', { now, payload }).state, 'within');
  assert.equal(judgeFoodTruckStatus('terrace', { now, payload }).state, 'outside');
  const holiday = at('2026-10-12T12:00:00');
  assert.equal(judgeFoodTruckStatus('plaza', { now: holiday, payload: getLunchStreetPayload(holiday) }).state, 'within');
  const weekend = at('2026-10-17T12:00:00');
  for (const spot of ['plaza', 'terrace'])
    assert.equal(judgeFoodTruckStatus(spot, { now: weekend, payload: getLunchStreetPayload(weekend) }).state, 'outside');
});

test('missing, stale, failed and out-of-period truck schedules cannot claim to be open or closed', () => {
  const now = at('2026-10-20T12:00:00');
  const payload = getLunchStreetPayload(now);
  assert.equal(judgeFoodTruckStatus('plaza', { now }).state, 'unknown');
  assert.equal(judgeFoodTruckStatus('plaza', { now, loading: true }).state, 'loading');
  assert.equal(judgeFoodTruckStatus('plaza', { now, loading: true, fetchFailed: true }).state, 'unknown');
  assert.equal(judgeFoodTruckStatus('plaza', { now, payload, loading: true, fetchFailed: true }).state, 'within');
  for (const changed of [
    { date: '2026-10-19' }, { nextUpdateAt: now.toISOString() }, { nextUpdateAt: 'invalid' },
    { outOfPeriod: true }, { trucks: null }, { trucks: [null] }, { hours: { start: '10:30', end: 'bad' } },
    { period: { from: '2026-11-01', to: '2026-11-30' } },
  ]) assert.equal(judgeFoodTruckStatus('plaza', { now, payload: { ...payload, ...changed } }).state, 'unknown');
  for (const day of ['2026-09-27', '2026-11-02']) {
    const time = at(`${day}T12:00:00`);
    assert.equal(judgeFoodTruckStatus('plaza', { now: time, payload: getLunchStreetPayload(time) }).state, 'unknown');
  }
  const midnight = at('2026-10-20T00:00:00');
  assert.equal(judgeFoodTruckStatus('plaza', { now: midnight, payload: getLunchStreetPayload(at('2026-10-19T23:59:00')) }).state, 'unknown');
});

test('the calendar lists vendors for each spot on its date, in Japan time', () => {
  // 2026-10-15 (Thu): the red flyer (Sky Plaza) and the blue one (TERRACE GATE).
  const payload = getLunchStreetPayload(at('2026-10-15T12:00:00'));
  assert.equal(payload.date, '2026-10-15');
  const names = (spot) => payload.trucks.filter((truck) => truck.spot === spot).map((truck) => truck.name);
  assert.deepEqual(names('plaza'), [
    'からあげ専門 みこし',
    'TencYo食堂',
    'キッチン花子',
    'デリカショップ モリガキ',
    '洋食 Dining KIYO',
    'OIC FOOD PARK',
  ]);
  assert.deepEqual(names('terrace'), ['kyoto ケバブ屋 MOTO-3']);
  assert.deepEqual(payload.hours, { start: '10:30', end: '15:30' });
  assert.equal(payload.outOfPeriod, false);
  // 00:30 JST on the 16th is still the 15th in UTC.
  assert.equal(japanDateLabel(new Date('2026-10-15T15:30:00Z')), '2026-10-16');
});

test('weekends and days outside the calendar have no vendors, and say so', () => {
  assert.equal(getLunchStreetPayload(at('2026-10-17T12:00:00')).trucks.length, 0);
  assert.equal(getLunchStreetPayload(at('2026-10-17T12:00:00')).outOfPeriod, false);
  const after = getLunchStreetPayload(at('2026-11-02T12:00:00'));
  assert.equal(after.trucks.length, 0);
  assert.equal(after.outOfPeriod, true);
});

test('every scheduled day is a weekday inside the period, with no repeated vendor per spot', () => {
  for (const { days } of LUNCH_STREET_SCHEDULE) {
    for (const [date, names] of Object.entries(days)) {
      assert.ok(date >= LUNCH_STREET_PERIOD.from && date <= LUNCH_STREET_PERIOD.to, date);
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      assert.ok(weekday >= 1 && weekday <= 5, `${date} is a weekend`);
      assert.equal(new Set(names).size, names.length, `${date} repeats a vendor`);
    }
  }
});

test('the API serves the calendar by default and keeps the NomNom! route available', async () => {
  assert.equal(FOOD_TRUCKS_SOURCE, 'calendar');
  const payload = await getFoodTrucksPayload();
  assert.equal(payload.source.name.includes('営業カレンダー'), true);
  const original = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return { ok: true, json: async () => [] };
  };
  try {
    const nomnom = await getFoodTrucksPayload({ source: 'nomnom' });
    assert.equal(nomnom.source.name, 'NomNom!');
    assert.ok(urls.some((url) => url.includes('firestore.googleapis.com')));
  } finally {
    globalThis.fetch = original;
  }
});

test('every vendor has the letter shown on its photo, and the payload carries it', () => {
  const names = new Set(LUNCH_STREET_SCHEDULE.flatMap(({ days }) => Object.values(days).flat()));
  for (const name of names) assert.match(lunchStreetTag(name), /^[A-Za-z]$/, `${name} has no letter`);
  // Upper and lower case are different tags: the daily cars are A–J, the daily shops a–d.
  assert.equal(lunchStreetTag('ARAPSUN'), 'A');
  assert.equal(lunchStreetTag('キッチン花子'), 'a');
  assert.equal(lunchStreetTag('OIC FOOD PARK'), 'd');
  const payload = getLunchStreetPayload(at('2026-10-20T12:00:00'));
  const tags = Object.fromEntries(payload.trucks.map((truck) => [truck.name, truck.tag]));
  assert.deepEqual(tags, {
    PureWalkCafe: 'J',
    'キッチン花子': 'a',
    'デリカショップ モリガキ': 'b',
    'OIC FOOD PARK': 'd',
    ARAPSUN: 'A',
  });
});

test('every vendor in the calendar has a cropped photo that exists', async () => {
  const { existsSync } = await import('node:fs');
  const names = new Set(LUNCH_STREET_SCHEDULE.flatMap(({ days }) => Object.values(days).flat()));
  for (const name of names) {
    const image = lunchStreetImage(name);
    assert.ok(image, `${name} has no photo`);
    assert.ok(existsSync(new URL(`../public${image}`, import.meta.url)), `${image} is missing`);
  }
});
