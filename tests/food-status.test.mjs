import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { judgeFoodServiceStatus, validateFoodPlaces } from '../src/food-guide-model.js';
import { renderFoodHours } from '../src/food-place-cards.js';

const payload = JSON.parse(readFileSync(new URL('../public/food-places.json', import.meta.url), 'utf8'));
const entries = JSON.parse(
  readFileSync(new URL('../public/manual-search-index.json', import.meta.url), 'utf8'),
).entries;

const status = {
  assignee: '運営',
  expiresAt: '2027-03-31T15:00:00.000Z',
  exceptionsConfirmed: true,
  sourceUrl: 'https://example.com/calendar',
  updateProcedure: {
    ja: '月初に公式ページを確認する',
    en: 'Check the official page at the start of each month',
  },
  weekly: {
    mon: [
      { start: '11:00', end: '14:00' },
      { start: '17:00', end: '21:00' },
    ],
    tue: [{ start: '22:00', end: '02:00' }],
  },
  exceptions: [
    { date: '2026-11-03', closed: true },
    { date: '2026-11-23', intervals: [{ start: '12:00', end: '15:00' }] },
  ],
};

function service(patch = {}) {
  return {
    hours: [
      {
        kind: 'regular',
        validFrom: '2026-04-01',
        validThrough: '2027-03-31',
        text: { ja: '月 11:00–14:00', en: 'Mon 11:00–14:00' },
        sourceUrl: 'https://example.com/hours',
        checkedAt: '2026-10-14',
      },
    ],
    status: structuredClone(status),
    ...patch,
  };
}

test('stores without an assignee or a status record stay out of automatic judgment', () => {
  assert.equal(judgeFoodServiceStatus({ hours: [] }).state, 'disabled');
  assert.equal(judgeFoodServiceStatus(service({ status: { ...status, assignee: ' ' } })).state, 'disabled');
  const minamen = payload.places.find((place) => place.name.ja === 'みなめんcafe');
  assert.equal(judgeFoodServiceStatus(minamen.services[0]).state, 'disabled');
});

test('published hours follow the collected weekday, holiday and co-op calendar', () => {
  const find = (name, id) =>
    payload.places.find((place) => place.name.ja === name).services.find((item) => item.id === id);
  const at = (iso) => new Date(iso);
  assert.equal(judgeFoodServiceStatus(find('GARDEN TERRACE LION', 'restaurant'), { now: at('2026-10-15T03:00:00Z') }).state, 'within');
  assert.equal(judgeFoodServiceStatus(find('GARDEN TERRACE LION', 'restaurant'), { now: at('2026-10-14T16:34:00Z') }).state, 'outside');
  assert.equal(judgeFoodServiceStatus(find('GARDEN TERRACE LION', 'restaurant'), { now: at('2026-12-29T03:00:00Z') }).state, 'outside');
  assert.equal(judgeFoodServiceStatus(find('OIC FOOD PARK', 'foodpark'), { now: at('2026-10-15T03:00:00Z') }).state, 'within');
  assert.equal(judgeFoodServiceStatus(find('OIC FOOD PARK', 'foodpark'), { now: at('2026-10-17T03:00:00Z') }).state, 'outside');
  assert.equal(judgeFoodServiceStatus(find('OIC FOOD PARK', 'foodpark'), { now: at('2026-11-03T03:00:00Z') }).state, 'outside');
  assert.equal(judgeFoodServiceStatus(find('セブン-イレブン', 'shop'), { now: at('2026-11-03T03:00:00Z') }).state, 'within');
  assert.equal(judgeFoodServiceStatus(find('セブン-イレブン', 'shop'), { now: at('2026-11-03T09:30:00Z') }).state, 'outside');
  const coffee = find('スターバックスコーヒー', 'coffee');
  assert.equal(judgeFoodServiceStatus(coffee, { now: at('2026-10-15T03:00:00Z') }).state, 'unknown');
  const temporary = structuredClone(coffee);
  temporary.status.exceptionsConfirmed = true;
  assert.equal(judgeFoodServiceStatus(temporary, { now: at('2026-10-15T00:30:00Z') }).state, 'outside');
  assert.equal(judgeFoodServiceStatus(temporary, { now: at('2026-10-15T01:30:00Z') }).state, 'within');
  temporary.status.expiresAt = '2027-03-31T15:00:00.000Z';
  assert.equal(judgeFoodServiceStatus(temporary, { now: at('2026-11-30T00:00:00Z') }).state, 'within');
  assert.equal(judgeFoodServiceStatus(temporary, { now: at('2026-11-28T23:30:00Z') }).state, 'outside');
  const cafeteria = find('OIC Cafeteria', 'cafeteria');
  assert.equal(judgeFoodServiceStatus(cafeteria, { now: at('2026-10-15T03:00:00Z') }).state, 'disabled');
  const calendar = {
    nextUpdateAt: '2026-10-16T00:00:00.000Z',
    stores: [
      {
        name: 'OIC Cafeteria',
        days: [{ date: '2026-10-15', periods: [{ start: '10:30', end: '19:00' }] }],
      },
    ],
  };
  assert.equal(judgeFoodServiceStatus(cafeteria, { now: at('2026-10-15T03:00:00Z'), payload: calendar }).state, 'within');
  assert.equal(judgeFoodServiceStatus(cafeteria, { now: at('2026-10-15T01:00:00Z'), payload: calendar }).state, 'outside');
});

test('opening, closing and breaks use Japan time, including the exact minute', () => {
  const place = service();
  assert.equal(judgeFoodServiceStatus(place, { now: new Date('2026-10-19T01:59:00Z') }).state, 'outside');
  assert.equal(judgeFoodServiceStatus(place, { now: new Date('2026-10-19T02:00:00Z') }).state, 'within');
  assert.equal(judgeFoodServiceStatus(place, { now: new Date('2026-10-19T05:00:00Z') }).state, 'outside');
  assert.equal(judgeFoodServiceStatus(place, { now: new Date('2026-10-19T06:00:00Z') }).state, 'outside');
  assert.equal(judgeFoodServiceStatus(place, { now: new Date('2026-10-19T08:00:00Z') }).state, 'within');
});

test('overnight hours continue into the next morning and stop at the end minute', () => {
  const place = service();
  assert.equal(judgeFoodServiceStatus(place, { now: new Date('2026-10-20T13:00:00Z') }).state, 'within');
  assert.equal(judgeFoodServiceStatus(place, { now: new Date('2026-10-20T16:30:00Z') }).state, 'within');
  assert.equal(judgeFoodServiceStatus(place, { now: new Date('2026-10-20T17:00:00Z') }).state, 'outside');
});

test('a dated exception replaces the weekday, including a closure and a holiday schedule', () => {
  const place = service();
  assert.equal(judgeFoodServiceStatus(place, { now: new Date('2026-11-03T14:00:00Z') }).state, 'outside');
  assert.equal(judgeFoodServiceStatus(place, { now: new Date('2026-11-23T02:30:00Z') }).state, 'outside');
  assert.equal(judgeFoodServiceStatus(place, { now: new Date('2026-11-23T03:00:00Z') }).state, 'within');
  assert.equal(judgeFoodServiceStatus(place, { now: new Date('2026-11-23T06:00:00Z') }).state, 'outside');
});

test('out of period, expired data, unconfirmed exceptions and fetch failure stay unknown', () => {
  assert.equal(judgeFoodServiceStatus(service(), { now: new Date('2026-03-31T03:00:00Z') }).state, 'unknown');
  const expired = service();
  expired.status.expiresAt = '2026-10-01T00:00:00.000Z';
  assert.equal(judgeFoodServiceStatus(expired, { now: new Date('2026-10-19T02:00:00Z') }).state, 'unknown');
  const unconfirmed = service();
  unconfirmed.status.exceptionsConfirmed = false;
  assert.equal(judgeFoodServiceStatus(unconfirmed, { now: new Date('2026-10-19T02:00:00Z') }).state, 'unknown');
  assert.equal(
    judgeFoodServiceStatus(service(), { now: new Date('2026-10-19T02:00:00Z'), fetchFailed: true }).state,
    'unknown',
  );
});

test('two services are judged independently and the wording is not a live open sign', () => {
  const open = service();
  const closed = service();
  closed.status.weekly = { mon: [{ start: '12:00', end: '13:00' }] };
  const now = new Date('2026-10-19T02:00:00Z');
  assert.equal(judgeFoodServiceStatus(open, { now }).state, 'within');
  assert.equal(judgeFoodServiceStatus(closed, { now }).state, 'outside');
  const html = renderFoodHours(
    {
      services: [
        { ...open, name: { ja: '食堂', en: 'Cafeteria' }, coopScheduleName: null },
        { ...closed, name: { ja: '売店', en: 'Shop' }, coopScheduleName: null },
      ],
    },
    { lang: 'ja', now },
  );
  assert.match(html, /営業時間内/);
  assert.match(html, /営業時間外/);
  assert.match(html, /登録された営業時間に基づく目安/);
  assert.doesNotMatch(html, /営業中/);
});

test('a published status record must name an assignee and a real expiry', () => {
  const data = structuredClone(payload);
  data.places[0].services[0].status = { assignee: '' };
  assert.throws(() => validateFoodPlaces(data, entries), /status assignee/);
});
