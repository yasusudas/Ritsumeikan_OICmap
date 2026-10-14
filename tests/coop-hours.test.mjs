import assert from 'node:assert/strict';
import test from 'node:test';
import { getCoopHoursPayload, parseCoopSchedule } from '../src/server/coop-hours.js';

// The same markup shape as the co-op schedule pages: one <h2> per campus, then a
// heading div and a Sunday-first calendar table per store, with the legend below.
function storeBlock({ name, building = 'C棟', year, month, symbols, legend, headingId = '' }) {
  const leading = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const cells = [
    ...Array(leading).fill('<td>&nbsp;</td>'),
    ...symbols.map((symbol, index) => `<td class="base_yellow01"   ><span class="num">${index + 1}</span>  ${symbol}</td>`)
  ];
  const rows = [];
  for (let index = 0; index < cells.length; index += 7) rows.push(`<tr>\n${cells.slice(index, index + 7).join('\n')}\n</tr>`);
  const info = Object.entries(legend)
    .map(([symbol, text]) => `<dl>\n<dt class="base_grey01" style="width: 30px;" >${symbol}</dt>\n<dd>${text}</dd>\n</dl>`)
    .join('\n');
  return `<div id="shop_x">
     <div class="tit_shop_s"${headingId ? ` id="${headingId}"` : ''}>
      <p class="foS14">${building}</p>
      <h3>${name}</h3>
     </div>
     <table><tbody>
       <tr><th>Sun.</th><th>Mon.</th><th>Tue.</th><th>Wed.</th><th>Thu.</th><th>Fri.</th><th>Sat.</th></tr>
       ${rows.join('\n')}
       <tr><td class="schedule_info" colspan="7">${info}</td></tr>
     </tbody></table>
    </div>`;
}

function schedulePage(campuses) {
  const sections = Object.entries(campuses).map(
    ([campus, blocks]) => `<div id="s0x"><h2 class="h2_title01">${campus}</h2><div class="shopTimeTable">${blocks.join('\n')}</div></div>`
  );
  return `<!DOCTYPE html><html lang="ja"><body>${sections.join('\n')}</body></html>`;
}

const lastDay = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const isWeekend = (year, month, day) => [0, 6].includes(new Date(Date.UTC(year, month - 1, day)).getUTCDay());
const weekdaysOpen = (year, month, open = '○') =>
  Array.from({ length: lastDay(year, month) }, (_, index) => (isWeekend(year, month, index + 1) ? '×' : open));

function oicPage(year, month) {
  return schedulePage({
    BKC: [storeBlock({ name: 'ユニオンカフェテリア', year, month, symbols: weekdaysOpen(year, month), legend: { '○': '10:30-20:30', '×': 'CLOSED' } })],
    OIC: [
      storeBlock({ name: 'OIC Cafeteria', year, month, symbols: weekdaysOpen(year, month), legend: { '○': '8:00-9:00/10:30-19:00', '×': 'CLOSED' } }),
      storeBlock({
        name: 'OIC Cafeteria内OIC Café', year, month, symbols: weekdaysOpen(year, month),
        legend: { '○': '弁当・ドリンク販売　11:30-12:45<br />\nクレープ・ドリンク販売　12:45-17:00', '×': 'CLOSED' }
      }),
      storeBlock({
        name: 'OIC Mini Meal Shop みにみる<br>\n      （コンビニ）', building: 'G棟', headingId: 's03room', year, month,
        symbols: Array(lastDay(year, month)).fill('○'), legend: { '○': '24時間営業' }
      })
    ]
  });
}

test('reads the campus section by store name and resolves symbols through each legend', () => {
  const stores = parseCoopSchedule(oicPage(2026, 10), { year: 2026, month: 10 });

  assert.deepEqual(stores.map((store) => store.name), [
    'OIC Cafeteria',
    'OIC Cafeteria内OIC Café',
    'OIC Mini Meal Shop みにみる（コンビニ）'
  ]);
  const [cafeteria, cafe, mini] = stores;
  assert.equal(cafeteria.building, 'C棟');
  assert.equal(cafeteria.days.length, 31);
  assert.deepEqual(cafeteria.days[13], {
    date: '2026-10-14', symbol: '○', closed: false, allDay: false, text: '8:00-9:00/10:30-19:00',
    periods: [{ label: null, start: '08:00', end: '09:00' }, { label: null, start: '10:30', end: '19:00' }]
  });
  assert.equal(cafeteria.days[2].date, '2026-10-03');
  assert.equal(cafeteria.days[2].closed, true);
  assert.deepEqual(cafe.days[13].periods, [
    { label: '弁当・ドリンク販売', start: '11:30', end: '12:45' },
    { label: 'クレープ・ドリンク販売', start: '12:45', end: '17:00' }
  ]);
  assert.equal(mini.building, 'G棟');
  assert.equal(mini.days.every((day) => day.allDay && !day.closed), true);
});

test('lets the same symbol mean different hours in different stores', () => {
  const symbols = weekdaysOpen(2026, 9, '□');
  const page = schedulePage({
    OIC: [
      storeBlock({ name: 'OIC Cafeteria', year: 2026, month: 9, symbols, legend: { '□': '11:00-14:00', '×': 'CLOSED' } }),
      storeBlock({ name: 'OIC Meal Shop', year: 2026, month: 9, symbols, legend: { '□': '11:00-15:00', '×': 'CLOSED' } })
    ]
  });
  const [cafeteria, mealShop] = parseCoopSchedule(page, { year: 2026, month: 9 });
  assert.equal(cafeteria.days[0].periods[0].end, '14:00');
  assert.equal(mealShop.days[0].periods[0].end, '15:00');
});

test('rejects a table that belongs to another month', () => {
  assert.throws(() => parseCoopSchedule(oicPage(2026, 10), { year: 2026, month: 11 }), /does not match 2026-11/);
});

test('rejects symbols missing from the legend, missing days, and unpaired headings', () => {
  const unknownSymbol = weekdaysOpen(2026, 10);
  unknownSymbol[4] = '△';
  const withUnknown = schedulePage({
    OIC: [storeBlock({ name: 'OIC Meal Shop', year: 2026, month: 10, symbols: unknownSymbol, legend: { '○': '10:15-17:15', '×': 'CLOSED' } })]
  });
  assert.throws(() => parseCoopSchedule(withUnknown, { year: 2026, month: 10 }), /"△" on day 5 is not in the legend/);

  const shortMonth = schedulePage({
    OIC: [storeBlock({ name: 'OIC Meal Shop', year: 2026, month: 10, symbols: weekdaysOpen(2026, 10).slice(0, 30), legend: { '○': '10:15-17:15', '×': 'CLOSED' } })]
  });
  assert.throws(() => parseCoopSchedule(shortMonth, { year: 2026, month: 10 }), /expected 31 days, found 30/);

  const page = oicPage(2026, 10);
  const oicStart = page.indexOf('<h2 class="h2_title01">OIC</h2>');
  const extraHeading = page.slice(0, oicStart) +
    page.slice(oicStart).replace('<div class="shopTimeTable">', '<div class="shopTimeTable"><div class="tit_shop_s"><h3>New store</h3></div>');
  assert.throws(() => parseCoopSchedule(extraHeading, { year: 2026, month: 10 }), /4 store headings but 3 tables/);
});

test('rejects pages without the campus section', () => {
  const notFound = '<html><head><title>404 Not Found｜立命館生活協同組合</title></head><body></body></html>';
  assert.throws(() => parseCoopSchedule(notFound, { year: 2026, month: 12 }), /Section "OIC" not found/);
});

function fakeFetch(pages) {
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(url);
    const body = pages[url];
    return { ok: Boolean(body), status: body ? 200 : 404, text: async () => body ?? 'Not Found' };
  };
  return { fetchImpl, requested };
}

const pageUrl = (year, month) => `https://www.ritsco-op.jp/schedule/schedule_${year}${String(month).padStart(2, '0')}.html`;

test('merges this month and the published next month into one calendar per store', async () => {
  const { fetchImpl } = fakeFetch({ [pageUrl(2026, 10)]: oicPage(2026, 10), [pageUrl(2026, 11)]: oicPage(2026, 11) });
  const payload = await getCoopHoursPayload({ now: new Date('2026-10-14T03:00:00Z'), fetchImpl });

  assert.equal(payload.today, '2026-10-14');
  assert.deepEqual(payload.months.map(({ month, published }) => [month, published]), [['2026-10', true], ['2026-11', true]]);
  const cafeteria = payload.stores.find((store) => store.name === 'OIC Cafeteria');
  assert.equal(cafeteria.days.length, 61);
  assert.equal(cafeteria.days.at(-1).date, '2026-11-30');
  assert.equal(payload.source.url, 'https://www.ritsco-op.jp/schedule/index.html#s03');
});

test('allows an unpublished next month but fails without the current month', async () => {
  const onlyThisMonth = fakeFetch({ [pageUrl(2026, 10)]: oicPage(2026, 10) });
  const payload = await getCoopHoursPayload({ now: new Date('2026-10-14T03:00:00Z'), fetchImpl: onlyThisMonth.fetchImpl });
  assert.deepEqual(payload.months.map(({ published }) => published), [true, false]);
  assert.equal(payload.stores.find((store) => store.name === 'OIC Cafeteria').days.length, 31);

  const nothing = fakeFetch({});
  await assert.rejects(
    getCoopHoursPayload({ now: new Date('2026-10-14T03:00:00Z'), fetchImpl: nothing.fetchImpl }),
    /schedule_202610\.html returned 404/
  );
});

test('picks months by the Japan date', async () => {
  const { fetchImpl, requested } = fakeFetch({ [pageUrl(2026, 11)]: oicPage(2026, 11) });
  // 2026-10-31 15:30 UTC is already 2026-11-01 00:30 in Japan.
  const payload = await getCoopHoursPayload({ now: new Date('2026-10-31T15:30:00Z'), fetchImpl });
  assert.equal(payload.today, '2026-11-01');
  assert.deepEqual(requested, [pageUrl(2026, 11), pageUrl(2026, 12)]);
});
