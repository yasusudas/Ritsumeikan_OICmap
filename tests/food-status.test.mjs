import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { judgeFoodServiceStatus, validateFoodPlaces } from '../src/food-guide-model.js';
import { renderFoodHours, renderFoodLeadStatus, foodPageText } from '../src/food-place-cards.js';

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
});

test('みなめんcafe follows the hours on its notice: handwritten corrections, last order shown only as text', () => {
  const minamen = payload.places.find((place) => place.name.ja === 'みなめんcafe').services[0];
  const at = (iso) => judgeFoodServiceStatus(minamen, { now: new Date(iso) }).state;
  // Weekdays 10:30–20:30 (the printed 8:00–21:00 is struck through).
  assert.equal(at('2026-10-16T01:00:00Z'), 'outside');
  assert.equal(at('2026-10-16T01:30:00Z'), 'within');
  assert.equal(at('2026-10-16T11:29:00Z'), 'within');
  assert.equal(at('2026-10-16T11:30:00Z'), 'outside');
  // Weekends 11:00–20:00 (only the printed 9:00 is struck through).
  assert.equal(at('2026-10-17T01:45:00Z'), 'outside');
  assert.equal(at('2026-10-17T02:00:00Z'), 'within');
  assert.equal(at('2026-10-17T11:00:00Z'), 'outside');
  // A public holiday on a weekday uses the weekend hours.
  assert.equal(at('2026-11-03T01:45:00Z'), 'outside');
  assert.equal(at('2026-11-03T02:00:00Z'), 'within');
  assert.equal(at('2026-11-03T11:15:00Z'), 'outside');
  // The notice is undated and nothing says it ends, so the record has no expiry (expiresAt: null).
  assert.equal(minamen.status.expiresAt, null);
  assert.equal(at('2026-12-01T03:00:00Z'), 'within');
  assert.equal(at('2027-01-11T01:45:00Z'), 'outside');
  assert.equal(at('2027-01-11T02:00:00Z'), 'within');
  const text = minamen.hours[0].text;
  assert.match(text.ja, /平日 10:30–20:30（L\.O\. 20:00）/);
  assert.match(text.ja, /土日祝 11:00–20:00（L\.O\. 19:30）/);
  assert.match(text.en, /last order 20:00/);
  assert.match(text.en, /last order 19:30/);
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
  assert.equal(judgeFoodServiceStatus(coffee, { now: at('2026-10-15T03:00:00Z') }).state, 'within');
  const temporary = structuredClone(coffee);
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

test('an expiry of null means no expiry; a missing or malformed one is still refused', () => {
  const noExpiry = service();
  noExpiry.status.expiresAt = null;
  noExpiry.hours[0].validThrough = null;
  assert.equal(judgeFoodServiceStatus(noExpiry, { now: new Date('2031-10-20T02:00:00Z') }).state, 'within');
  for (const value of [undefined, 'soon', '']) {
    const broken = service();
    broken.status.expiresAt = value;
    assert.equal(judgeFoodServiceStatus(broken, { now: new Date('2026-10-19T02:00:00Z') }).state, 'disabled');
  }
  const data = structuredClone(payload);
  const minamen = data.places.find((place) => place.name.ja === 'みなめんcafe');
  minamen.services[0].status.expiresAt = 'soon';
  assert.throws(() => validateFoodPlaces(data, entries), /status expiry/);
  minamen.services[0].status.expiresAt = null;
  assert.doesNotThrow(() => validateFoodPlaces(data, entries));
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
  assert.doesNotMatch(html, /営業中/);
});

test('a published status record must name an assignee and a real expiry', () => {
  const data = structuredClone(payload);
  data.places[0].services[0].status = { assignee: '' };
  assert.throws(() => validateFoodPlaces(data, entries), /status assignee/);
});

test('the compact card keeps only the lines that apply today, and never cuts "L.O." in two', async () => {
  const { pickTodaysHours, describeFoodServiceHours } = await import('../src/food-guide-model.js');
  const minamen = payload.places.find((place) => place.name.ja === 'みなめんcafe').services[0];
  const ja = minamen.hours[0].text.ja;
  const at = (iso) => new Date(iso);
  // Saturday 2026-10-17, Friday 2026-10-16, and Tuesday 2026-11-03 (a public holiday).
  assert.equal(pickTodaysHours(ja, minamen, at('2026-10-17T03:00:00Z')), '土日祝 11:00–20:00（L.O. 19:30）');
  assert.equal(pickTodaysHours(ja, minamen, at('2026-10-16T03:00:00Z')), '平日 10:30–20:30（L.O. 20:00）');
  assert.equal(pickTodaysHours(ja, minamen, at('2026-11-03T03:00:00Z')), '土日祝 11:00–20:00（L.O. 19:30）');
  const en = minamen.hours[0].text.en;
  assert.match(pickTodaysHours(en, minamen, at('2026-10-17T03:00:00Z')), /^weekends and holidays 11:00–20:00 \(last order 19:30\)\.$/);
  assert.equal(pickTodaysHours('10:30–15:30', minamen, at('2026-10-17T03:00:00Z')), '10:30–15:30');
  const block = describeFoodServiceHours(minamen, { text: (v) => v.ja, translate: (k) => k, compact: true, now: at('2026-10-17T03:00:00Z') });
  assert.match(block.versions[0].todayText, /L.O. 19:30）$/);
});

test('the compact card puts each time range on its own line and shows the year-end closure only during it', async () => {
  const { pickTodaysHours } = await import('../src/food-guide-model.js');
  const lion = payload.places.find((place) => place.name.ja === 'GARDEN TERRACE LION').services[0];
  const { ja, en } = lion.hours[0].text;
  const at = (iso) => new Date(iso);
  assert.equal(pickTodaysHours(ja, lion, at('2026-10-17T03:00:00Z')), '11:30–15:00（ランチL.O. 14:30）\n17:00–21:00（料理L.O. 20:00）');
  assert.equal(pickTodaysHours(en, lion, at('2026-10-17T03:00:00Z')), '11:30–15:00 (lunch last order 14:30)\n17:00–21:00 (food last order 20:00)');
  // 12/28 is open; 12/29, 12/31, 1/1 and 1/3 are closed (and then only the closure is shown); 1/4 is open.
  assert.equal(pickTodaysHours(ja, lion, at('2026-12-28T03:00:00Z')).split('\n').length, 2);
  for (const day of ['2026-12-29', '2026-12-31', '2027-01-01', '2027-01-03']) {
    assert.equal(pickTodaysHours(ja, lion, at(`${day}T03:00:00Z`)), '12/29〜1/3休', day);
    assert.equal(pickTodaysHours(en, lion, at(`${day}T03:00:00Z`)), 'Closed Dec 29–Jan 3.', day);
  }
  assert.equal(pickTodaysHours(ja, lion, at('2027-01-04T03:00:00Z')).includes('休'), false);
  // 12/28 at 23:30 JST is still 12/28; 12/29 at 00:30 JST (= 12/28 15:30Z) is already the closure.
  assert.equal(pickTodaysHours(ja, lion, at('2026-12-28T14:30:00Z')).includes('休'), false);
  assert.equal(pickTodaysHours(ja, lion, at('2026-12-28T15:30:00Z')), '12/29〜1/3休');
});


test('co-op loading has neutral dash labels, cached hours stay valid and failures finish loading', () => {
  const place = payload.places.find((place) => place.name.ja === 'OIC Cafeteria');
  const service = place.services[0];
  const now = new Date('2026-10-19T03:00:00Z');
  const calendar = {
    nextUpdateAt: '2026-10-20T00:00:00Z',
    stores: [{ name: service.coopScheduleName, days: [{ date: '2026-10-19', periods: [{ start: '11:00', end: '14:00' }] }] }],
  };
  assert.equal(judgeFoodServiceStatus(service, { now, loading: true }).state, 'loading');
  assert.equal(judgeFoodServiceStatus(service, { now, loading: true, payload: calendar }).state, 'within');
  assert.equal(judgeFoodServiceStatus(service, { now, loading: true, payload: { ...calendar, nextUpdateAt: now.toISOString() } }).state, 'loading');
  assert.equal(judgeFoodServiceStatus(service, { now, loading: true, fetchFailed: true }).state, 'unknown');
  for (const lang of ['ja', 'en']) {
    const translate = (key) => foodPageText(lang, key);
    const pending = renderFoodLeadStatus(place, { translate, now, loading: true });
    assert.match(pending, /aria-hidden="true">—/);
    assert.ok(pending.includes(translate('food.hoursLoading')));
    assert.doesNotMatch(pending, /is-within|is-outside|is-unknown/);
    const hours = renderFoodHours(place, { lang, now, loading: true });
    assert.match(hours, /—<br>—/);
    const failed = renderFoodHours(place, { lang, now, loading: true, fetchFailed: true });
    assert.doesNotMatch(failed, /food-hours-pending/);
    assert.ok(failed.includes(translate('food.hoursUnknown')));
    const cached = renderFoodHours(place, { lang, now, loading: true, payload: calendar });
    assert.doesNotMatch(cached, /food-hours-pending/);
    assert.match(cached, /11:00–14:00/);
  }
});
