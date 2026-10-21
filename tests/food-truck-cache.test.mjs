import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FOOD_TRUCKS_REFRESH_MS, FOOD_TRUCKS_STALE_MS,
  isFoodTruckPayloadUsable, foodTrucksNeedRefresh, judgeFoodTruckStatus,
} from '../src/food-guide-model.js';
import { getLunchStreetPayload } from '../src/server/lunch-street.js';
import handler from '../api/food-trucks.js';

const generated = new Date('2026-10-20T02:30:00Z'); // 11:30 JST, both spots open
const payload = getLunchStreetPayload(generated);
const refresh = Date.parse(payload.nextUpdateAt);

for (const [offset, usable, needsRefresh] of [
  [-1, true, false], [0, true, true], [1, true, true],
  [60_000, true, true], [FOOD_TRUCKS_STALE_MS - 1, true, true],
  [FOOD_TRUCKS_STALE_MS, false, true], [FOOD_TRUCKS_STALE_MS + 1, false, true],
]) {
  test(`truck cache refresh boundary ${offset}ms: usable=${usable}, refresh=${needsRefresh}`, () => {
    const now = new Date(refresh + offset);
    assert.equal(isFoodTruckPayloadUsable(payload, now), usable);
    assert.equal(foodTrucksNeedRefresh(payload, now), needsRefresh);
    for (const spot of ['plaza', 'terrace']) {
      // A failed/pending refresh does not erase the still-usable schedule.
      assert.equal(judgeFoodTruckStatus(spot, { now, payload, loading: true, fetchFailed: true }).state,
        usable ? 'within' : 'unknown');
    }
  });
}

test('truck cache rejects wrong-day, malformed and unbounded schedules', () => {
  const now = new Date(refresh + 1);
  for (const changed of [
    { date: '2026-10-19' }, { generatedAt: 'invalid' }, { nextUpdateAt: 'invalid' },
    { generatedAt: new Date(now.getTime() + 120_000).toISOString(), nextUpdateAt: new Date(now.getTime() + 180_000).toISOString() },
    { nextUpdateAt: new Date(generated.getTime() + FOOD_TRUCKS_REFRESH_MS + 1).toISOString() },
    { nextUpdateAt: generated.toISOString() },
    { trucks: null }, { trucks: [null] }, { trucks: [{ name: 'Bad place', spot: 'as' }] },
    { trucks: [{ name: '', spot: 'plaza' }] },
    { period: { from: '2026-02-30', to: '2026-10-31' } },
    { period: { from: '2026-10-31', to: '2026-10-01' } },
    { outOfPeriod: true }, { hours: { start: '25:00', end: '26:00' } },
  ]) assert.equal(isFoodTruckPayloadUsable({ ...payload, ...changed }, now), false, JSON.stringify(changed));
  const previous = getLunchStreetPayload(new Date('2026-10-20T14:59:00Z'));
  assert.equal(isFoodTruckPayloadUsable(previous, new Date('2026-10-20T15:00:00Z')), false);
});

test('empty schedules and real out-of-period responses remain readable without claiming unknown days are closed', () => {
  const weekend = new Date('2026-10-17T03:00:00Z');
  const empty = getLunchStreetPayload(weekend);
  assert.equal(isFoodTruckPayloadUsable(empty, weekend), true);
  assert.equal(judgeFoodTruckStatus('plaza', { now: weekend, payload: empty }).state, 'outside');
  const after = new Date('2026-11-01T03:00:00Z');
  const outside = getLunchStreetPayload(after);
  assert.equal(isFoodTruckPayloadUsable(outside, after), true);
  assert.equal(judgeFoodTruckStatus('plaza', { now: after, payload: outside }).state, 'unknown');
  assert.equal(isFoodTruckPayloadUsable({ ...outside, trucks: payload.trucks }, after), false);
});

test('client refresh/grace windows match the API cache contract and payload lifetime', async () => {
  const headers = {};
  let body;
  const response = { setHeader: (key, value) => { headers[key] = value; }, end: value => { body = JSON.parse(value); } };
  await handler({ method: 'GET', url: '/api/food-trucks' }, response);
  assert.equal(response.statusCode, 200);
  assert.match(headers['Cache-Control'], new RegExp(`s-maxage=${FOOD_TRUCKS_REFRESH_MS / 1000}(?:,|$)`));
  assert.match(headers['Cache-Control'], new RegExp(`stale-while-revalidate=${FOOD_TRUCKS_STALE_MS / 1000}(?:,|$)`));
  assert.equal(Date.parse(body.nextUpdateAt) - Date.parse(body.generatedAt), FOOD_TRUCKS_REFRESH_MS);
});
