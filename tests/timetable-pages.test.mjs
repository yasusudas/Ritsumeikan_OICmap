import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { parseJapaneseHolidaysIcs } from '../src/server/holidays.js';
import { nextShuttleDeparture } from '../src/shuttle-bus.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const exists = (path) => existsSync(new URL(`../${path}`, import.meta.url));

test('/timetable/ shows the departure cards and stays out of search results', () => {
  const html = read('timetable/index.html');
  assert.match(html, /<link rel="canonical" href="https:\/\/rits-oic-map\.app\/timetable\/" \/>/);
  assert.match(html, /<meta name="robots" content="noindex,nofollow,noarchive" \/>/);
  assert.match(html, /src="\/src\/timetable\.js"/);
  assert.doesNotMatch(html, /timetable-links\.js/);
  assert.match(html, /data-card-grid/);
  assert.match(html, /class="site-nav-link" href="\/timetable\/" aria-current="page"/);
  assert.doesNotMatch(read('public/sitemap.xml'), /rits-oic-map\.app\/timetable\//);
});

test('the Japanese links page is archived, not built, and its old URL goes to /timetable/', () => {
  assert.equal(exists('hidden/timetable/index.html'), false);
  assert.equal(exists('archive/timetable-links/index.html'), true);
  assert.doesNotMatch(read('vite.config.js'), /hidden\/timetable/);
  const vercel = JSON.parse(read('vercel.json'));
  const route = vercel.routes.find((r) => r.src === '^/hidden/timetable/?$');
  assert.equal(route?.headers?.Location, '/timetable/');
  assert.equal(route?.status, 308);
  // The English links page is still served.
  assert.match(read('en/timetable/index.html'), /src="\/src\/timetable-links\.js"/);
});

test('the departure data lives under /timetable/data/ and nothing refers to /hidden/ any more', () => {
  assert.equal(exists('public/hidden'), false);
  assert.equal(exists('public/timetable/data/manifest.json'), true);
  assert.match(read('src/timetable.js'), /'\/timetable\/data\/manifest\.json'/);
  assert.match(read('public/sw.js'), /'\/timetable\/data\/'/);
  assert.match(read('scripts/fetch-timetable-data.mjs'), /public\/timetable\/data/);
  const manifest = JSON.parse(read('public/timetable/data/manifest.json'));
  const urls = JSON.stringify(manifest).match(/"\/[^"]*data\/[^"]*\.json"/g) || [];
  assert.ok(urls.length > 0);
  assert.ok(urls.every((url) => url.startsWith('"/timetable/data/')), 'every data URL is under /timetable/data/');
  for (const url of urls) assert.equal(exists(`public${url.slice(1, -1)}`), true, url);
});

test('the source notes moved from the timetable page to the sources page', () => {
  const timetable = read('timetable/index.html');
  assert.doesNotMatch(timetable, /data-source-note/);
  assert.match(timetable, /class="timetable-caution"[\s\S]*href="\/sources\/"/);
  assert.doesNotMatch(read('src/timetable.js'), /renderSourceNote|data-source-note/);

  for (const file of ['sources/index.html', 'en/sources/index.html'])
    assert.match(read(file), /data-sources-timetable/, file);
  assert.match(read('src/sources-page.js'), /'\/timetable\/data\/manifest\.json'/);
  // The notes and references that the page now lists come from the manifest.
  const manifest = JSON.parse(read('public/timetable/data/manifest.json'));
  assert.ok(manifest.sourceNotes.some((note) => /阪急電車の時刻表ページ/.test(note)));
  assert.ok(manifest.sourceNotes.some((note) => /JR西日本の時刻表ページ/.test(note)));
  assert.ok(manifest.sourceReferences.length >= 3);
  assert.match(read('sources/index.html'), /href="\/timetable\/"/);
  assert.match(read('en/sources/index.html'), /Hankyu's timetable pages state that permission is required/);
});

test('the shuttle bus card is on /timetable/ and shares one data source with the English links page', () => {
  const html = read('timetable/index.html');
  assert.match(html, /<section class="section timetable-shuttle" data-shuttle-bus-card aria-labelledby="shuttle-bus-title">/);
  assert.match(read('src/timetable.js'), /import \{ mountShuttleBusCard \} from '\.\/shuttle-bus\.js'/);
  assert.match(read('src/timetable.js'), /mountShuttleBusCard\(elements\.shuttleBus, \{ lang: 'ja' \}\)/);
  // The English links page uses the same module; the schedule data exists only there.
  const links = read('src/timetable-links.js');
  assert.match(links, /import \{ mountShuttleBusCard \} from '\.\/shuttle-bus\.js'/);
  assert.doesNotMatch(links, /operationDateRanges|departures: \[/);
  assert.match(read('src/shuttle-bus.js'), /operationDateRanges/);
  // The reservation buttons: the LINE account from the flyer's QR code, and the manual PDF.
  assert.match(read('src/shuttle-bus.js'), /reservationUrl: 'https:\/\/lin\.ee\/pZeDOcd'/);
  assert.match(read('src/shuttle-bus.js'), /manualUrl: 'https:\/\/www\.ritsumei\.ac\.jp\/file\.jsp\?id=705941'/);
  assert.match(read('src/styles/timetable.css'), /--tt-line-green: #06c755;/);
  assert.match(read('en/timetable/index.html'), /data-shuttle-bus-card/);
});

test('the next shuttle departure skips weekends and days outside the service ranges', () => {
  const at = (y, m, d, hh, mm) => new Date(y, m - 1, d, hh, mm, 0, 0);
  const time = (date) => date && `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;

  // Fri 2026-10-16: before the first bus, between buses, after the last bus.
  assert.equal(time(nextShuttleDeparture('bkc', at(2026, 10, 16, 10, 0))), '10/16 15:05');
  assert.equal(time(nextShuttleDeparture('bkc', at(2026, 10, 16, 15, 5))), '10/16 15:05');
  assert.equal(time(nextShuttleDeparture('bkc', at(2026, 10, 16, 15, 6))), '10/16 16:50');
  assert.equal(time(nextShuttleDeparture('kinugasa', at(2026, 10, 16, 15, 6))), '10/16 16:45');
  // After the last bus on Friday the next one is Monday.
  assert.equal(time(nextShuttleDeparture('kinugasa', at(2026, 10, 16, 20, 6))), '10/19 15:00');
  // 2026-10-31 (Saturday) is outside every range; 2026-11-01 is Sunday; Monday 11/2 starts again.
  assert.equal(time(nextShuttleDeparture('bkc', at(2026, 10, 31, 9, 0))), '11/2 15:05');
  // Past the last service day of the term there is no departure.
  assert.equal(nextShuttleDeparture('bkc', at(2026, 12, 25, 20, 11)), null);
  assert.equal(nextShuttleDeparture('unknown', at(2026, 10, 16, 10, 0)), null);
});

test('on /timetable/ the hidden cards panel is the last block, after the shuttle bus and the caution', () => {
  const html = read('timetable/index.html');
  const at = (pattern) => html.search(pattern);
  const board = at(/data-card-grid/);
  const shuttle = at(/data-shuttle-bus-card/);
  const caution = at(/class="timetable-caution"/);
  const hidden = at(/<section class="section timetable-hidden-panel"/);
  assert.ok(board < shuttle && shuttle < caution && caution < hidden, 'board → shuttle → caution → hidden cards');
  assert.match(html.slice(hidden), /^<section class="section timetable-hidden-panel"[\s\S]*?<\/section>\s*<\/div>\s*<\/main>/);
});

test('the timetable data was refetched after JR West\'s October 2026 revision', () => {
  const manifest = JSON.parse(read('public/timetable/data/manifest.json'));
  assert.ok(manifest.sourceNotes.includes('JR西日本の時刻は代表日として平日 2026-10-16、休日 2026-10-18 の表示を取得しています。'));
  for (const file of ['kyoto-weekday', 'kyoto-holiday', 'osaka-kobe-weekday', 'osaka-kobe-holiday']) {
    const schedule = JSON.parse(read(`public/timetable/data/jr-west/ibaraki/${file}.json`));
    assert.equal(schedule.revision, '改正日:2026年10月03日', file);
  }
  // Returning visitors must not keep the old data from the service worker cache.
  assert.match(read('public/sw.js'), /rits-oic-map-runtime-v23/);
  assert.match(read('sources/index.html'), /2026年10月16日に取得/);
});

test('holidays are not stored: the page reads them from /api/holidays, synced daily from an ICS calendar', () => {
  const manifest = JSON.parse(read('public/timetable/data/manifest.json'));
  assert.equal(manifest.holidayCalendar.holidays, undefined);
  assert.equal(manifest.holidayCalendar.apiUrl, '/api/holidays');
  assert.match(manifest.holidayCalendar.sourceUrl, /^https:\/\/calendar\.google\.com\//);
  assert.doesNotMatch(read('scripts/fetch-timetable-data.mjs'), /nameJa: '元日'/);

  const page = read('src/timetable.js');
  assert.match(page, /const HOLIDAYS_URL = '\/api\/holidays';/);
  assert.doesNotMatch(page, /holidayCalendar/);
  // The CDN keeps the answer for a day, so the calendar is fetched about once a day.
  assert.match(read('api/holidays.js'), /s-maxage=\$\{HOLIDAYS_REFRESH_INTERVAL_SECONDS\}/);
  assert.match(read('src/server/holidays.js'), /HOLIDAYS_REFRESH_INTERVAL_SECONDS = 24 \* 60 \* 60/);
  assert.match(read('vite.config.js'), /server\.middlewares\.use\('\/api\/holidays'/);
});

test('the holiday ICS parser keeps public holidays (祝日) and drops observances (祭日)', () => {
  const event = (date, summary, kind) =>
    ['BEGIN:VEVENT', `DTSTART;VALUE=DATE:${date}`, `DTEND;VALUE=DATE:${date}`, `SUMMARY:${summary}`,
      `DESCRIPTION:${kind}\\nこの祝日を非表示にするには、Google カレンダーの設定 > 日本の祝日 に移動して`,
      ' ください', 'END:VEVENT'].join('\r\n');
  const ics = ['BEGIN:VCALENDAR',
    event('20270322', '春分の日 振替休日', '祝日'),
    event('20270101', '元日', '祝日'),
    event('20271225', 'クリスマス', '祭日'),
    event('20270102', '銀行休業日', '祭日'),
    'END:VCALENDAR'].join('\r\n');
  assert.deepEqual(parseJapaneseHolidaysIcs(ics), [
    { date: '2027-01-01', nameJa: '元日' },
    { date: '2027-03-22', nameJa: '春分の日 振替休日' },
  ]);
  assert.deepEqual(parseJapaneseHolidaysIcs(''), []);
});
