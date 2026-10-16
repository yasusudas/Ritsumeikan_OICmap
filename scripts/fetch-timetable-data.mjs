import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { HOLIDAYS_SOURCE } from '../src/server/holidays.js';

const OUTPUT_ROOT = path.resolve('public/timetable/data');
const GENERATED_AT = new Date().toISOString();

const MONORAIL_API_BASE = 'https://www.osaka-monorail.co.jp/timetable';
const HANKYU_BASE = 'https://www.hankyu.co.jp';
const JR_BASE = 'https://timetable.jr-odekake.net';

const CALENDARS = {
  weekday: {
    id: 'weekday',
    labelJa: '平日',
    shortLabelJa: '平日',
    monorailSuffix: 'weekday',
    hankyuCode: 'w',
    hankyuDw: '0',
    jrDate: '20261016',
    jrRepresentativeDate: '2026-10-16',
  },
  holiday: {
    id: 'holiday',
    labelJa: '土曜・休日',
    shortLabelJa: '休日',
    monorailSuffix: 'holiday',
    hankyuCode: 'h',
    hankyuDw: '2',
    jrDate: '20261018',
    jrRepresentativeDate: '2026-10-18',
  },
};

const RAILWAYS = [
  {
    id: 'osaka-monorail',
    nameJa: '大阪モノレール',
    shortNameJa: 'モノレール',
    color: '#0072bc',
    textColor: '#ffffff',
  },
  {
    id: 'hankyu',
    nameJa: '阪急電車',
    shortNameJa: '阪急',
    color: '#6f2c1f',
    textColor: '#ffffff',
  },
  {
    id: 'jr-west',
    nameJa: 'JR西日本',
    shortNameJa: 'JR',
    color: '#0072bc',
    textColor: '#ffffff',
  },
];

const MONORAIL_STATIONS = [
  {
    id: 'unobe',
    nameJa: '宇野辺',
    code: 'r18_unobe',
    stationId: 18,
    pageUrl: 'https://www.osaka-monorail.co.jp/station/r18_unobe/timetable/',
    pdfUrl: 'https://www.osaka-monorail.co.jp/upload/timetable/r18_unobe_t2026.pdf',
  },
  {
    id: 'minami-ibaraki',
    nameJa: '南茨木',
    code: 'r19_minami_iba',
    stationId: 19,
    pageUrl: 'https://www.osaka-monorail.co.jp/station/r19_minami_iba/timetable/',
    pdfUrl: 'https://www.osaka-monorail.co.jp/upload/timetable/r19_minami_iba_t2026.pdf',
  },
];

const MONORAIL_DIRECTIONS = [
  {
    id: 'up',
    apiPrefix: 'up',
    labelJa: '大阪空港方面',
    defaultDestinationJa: '大阪空港',
    destinationMarks: {
      '万': '万博記念公園',
      '千': '千里中央',
      '南': '南茨木',
    },
  },
  {
    id: 'down',
    apiPrefix: 'down',
    labelJa: '門真市方面',
    defaultDestinationJa: '門真市',
    destinationMarks: {
      '万': '万博記念公園',
      '千': '千里中央',
      '南': '南茨木',
    },
  },
];

const HANKYU_DIRECTIONS = [
  {
    id: 'osaka',
    code: '1',
    labelJa: '大阪梅田・天下茶屋方面',
  },
  {
    id: 'kyoto',
    code: '2',
    labelJa: '京都河原町方面',
  },
];

const JR_DIRECTIONS = [
  {
    id: 'kyoto',
    timetableId: '2791011001',
    labelJa: '高槻・京都方面',
  },
  {
    id: 'osaka-kobe',
    timetableId: '2791011002',
    labelJa: '新大阪・大阪・三ノ宮方面',
  },
];

const HANKYU_STATION = {
  id: 'minami-ibaraki',
  nameJa: '南茨木',
  code: 'HK-68',
  sf: '6025',
  lineJa: '京都線',
};

const JR_STATION = {
  id: 'ibaraki',
  nameJa: '茨木',
  code: 'JR-A41',
  eid: '0610124',
  lineJa: 'JR京都線',
};

// 祝日は手元に持たない。時刻表のページが /api/holidays（src/server/holidays.js）から取得する。
// manifest には取得元だけを書く（情報源・権利のページに出す）。
const HOLIDAY_CALENDAR = {
  country: 'JP',
  sourceNameJa: HOLIDAYS_SOURCE.nameJa,
  sourceUrl: HOLIDAYS_SOURCE.url,
  apiUrl: '/api/holidays',
};

const SOURCE_REFERENCES = [
  {
    labelJa: '時刻表データ取得元',
    items: [
      {
        labelJa: '大阪モノレール 宇野辺駅',
        url: 'https://www.osaka-monorail.co.jp/station/r18_unobe/timetable/',
      },
      {
        labelJa: '大阪モノレール 南茨木駅',
        url: 'https://www.osaka-monorail.co.jp/station/r19_minami_iba/timetable/',
      },
      {
        labelJa: '阪急 南茨木駅 大阪梅田・天下茶屋方面 平日',
        url: 'https://www.hankyu.co.jp/station/html/HK-68_ky_1_w.html',
      },
      {
        labelJa: '阪急 南茨木駅 大阪梅田・天下茶屋方面 土曜・休日',
        url: 'https://www.hankyu.co.jp/station/html/HK-68_ky_1_h.html',
      },
      {
        labelJa: '阪急 南茨木駅 京都河原町方面 平日',
        url: 'https://www.hankyu.co.jp/station/html/HK-68_ky_2_w.html',
      },
      {
        labelJa: '阪急 南茨木駅 京都河原町方面 土曜・休日',
        url: 'https://www.hankyu.co.jp/station/html/HK-68_ky_2_h.html',
      },
      {
        labelJa: 'JR茨木駅 高槻・京都方面 平日代表日',
        url: `${JR_BASE}/station-timetable/2791011001?date=${CALENDARS.weekday.jrDate}`,
      },
      {
        labelJa: 'JR茨木駅 高槻・京都方面 休日代表日',
        url: `${JR_BASE}/station-timetable/2791011001?date=${CALENDARS.holiday.jrDate}`,
      },
      {
        labelJa: 'JR茨木駅 新大阪・大阪・三ノ宮方面 平日代表日',
        url: `${JR_BASE}/station-timetable/2791011002?date=${CALENDARS.weekday.jrDate}`,
      },
      {
        labelJa: 'JR茨木駅 新大阪・大阪・三ノ宮方面 休日代表日',
        url: `${JR_BASE}/station-timetable/2791011002?date=${CALENDARS.holiday.jrDate}`,
      },
    ],
  },
  {
    labelJa: '運行情報確認先',
    items: [
      {
        labelJa: '大阪モノレール 運行状況',
        url: 'https://www.osaka-monorail.co.jp/',
      },
      {
        labelJa: '阪急電鉄 運行情報',
        url: 'https://www.hankyu.co.jp/railinfo/',
      },
      {
        labelJa: 'JR西日本 列車運行情報',
        url: 'https://trafficinfo.westjr.co.jp/kinki.html',
      },
    ],
  },
  {
    labelJa: '利用条件・注記の根拠',
    items: [
      {
        labelJa: '阪急電車 時刻表ページの注記',
        url: 'https://www.hankyu.co.jp/station/html/HK-68_ky_2_h.html',
      },
      {
        labelJa: 'JR西日本 時刻表ページの注記',
        url: `${JR_BASE}/station-timetable/2791011001?date=${CALENDARS.weekday.jrDate}`,
      },
    ],
  },
];

// Imported by the tests (for parseJrDepartures); only a direct run fetches anything.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
}

// node scripts/fetch-timetable-data.mjs                 fetch everything and rebuild manifest.json
// node scripts/fetch-timetable-data.mjs --only=jr-west  fetch one railway; the manifest stays as it is
async function main() {
  const fetchers = {
    'osaka-monorail': fetchMonorailSchedules,
    hankyu: fetchHankyuSchedules,
    'jr-west': fetchJrSchedules,
  };
  const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length);
  if (only && !fetchers[only]) {
    throw new Error(`Unknown --only=${only}. Use one of: ${Object.keys(fetchers).join(', ')}`);
  }

  await mkdir(OUTPUT_ROOT, { recursive: true });

  const schedules = [];
  for (const [railwayId, fetchSchedules] of Object.entries(fetchers)) {
    if (!only || only === railwayId) schedules.push(...(await fetchSchedules()));
  }

  if (only) {
    // The manifest holds each file's number of trains. If a count changed, it must be rebuilt.
    await assertCountsMatchManifest(schedules);
    await writeSchedules(schedules);
    console.log(`Wrote ${schedules.length} ${only} schedules to ${OUTPUT_ROOT}; manifest.json was not rewritten.`);
    return;
  }

  const cards = buildCards(schedules);
  await writeSchedules(schedules);

  const manifest = {
    schemaVersion: 1,
    generatedAt: GENERATED_AT,
    titleJa: 'キャンパス周辺 時刻表',
    calendars: Object.values(CALENDARS).map(({ id, labelJa, shortLabelJa }) => ({
      id,
      labelJa,
      shortLabelJa,
    })),
    holidayCalendar: HOLIDAY_CALENDAR,
    railways: RAILWAYS,
    cards,
    sourceNotes: [
      '各社公式または公式表示ページから取得した時刻表データです。',
      '運休、臨時列車、遅延、番線変更は反映されない場合があります。乗車前に各社公式情報を確認してください。',
      `JR西日本の時刻は代表日として平日 ${CALENDARS.weekday.jrRepresentativeDate}、休日 ${CALENDARS.holiday.jrRepresentativeDate} の表示を取得しています。`,
      '阪急電車の時刻表ページには、データの加工・再利用・再配布に許可が必要である旨が明記されています。',
      'JR西日本の時刻表ページには、JR時刻表データの無断転載・複写・加工を禁じる旨が明記されています。',
    ],
    sourceReferences: SOURCE_REFERENCES,
  };
  await writeJson(path.join(OUTPUT_ROOT, 'manifest.json'), manifest);

  console.log(`Wrote ${schedules.length} schedules and ${cards.length} cards to ${OUTPUT_ROOT}`);
}

async function writeSchedules(schedules) {
  for (const schedule of schedules) {
    const file = path.join(OUTPUT_ROOT, schedule.file);
    await mkdir(path.dirname(file), { recursive: true });
    await writeJson(file, withoutFile(schedule));
  }
}

async function assertCountsMatchManifest(schedules) {
  const manifest = JSON.parse(await readFile(path.join(OUTPUT_ROOT, 'manifest.json'), 'utf8'));
  for (const schedule of schedules) {
    const card = manifest.cards.find((item) => item.id === schedule.cardId);
    const expected = card?.calendars?.[schedule.calendar.id]?.departures;
    if (expected !== schedule.departures.length) {
      throw new Error(
        `${schedule.file} has ${schedule.departures.length} trains but manifest.json says ${expected}. ` +
          'Nothing was written. Run without --only to rebuild the manifest.'
      );
    }
  }
}

async function fetchMonorailSchedules() {
  const schedules = [];
  for (const station of MONORAIL_STATIONS) {
    const apiUrl = `${MONORAIL_API_BASE}/${station.stationId}`;
    const raw = await fetchJson(apiUrl);
    for (const direction of MONORAIL_DIRECTIONS) {
      for (const calendar of Object.values(CALENDARS)) {
        const key = `${direction.apiPrefix}_${calendar.monorailSuffix}`;
        const departures = normalizeMonorailDepartures(raw[key] ?? {}, direction);
        schedules.push({
          file: `osaka-monorail/${station.id}/${direction.id}-${calendar.id}.json`,
          id: `osaka-monorail-${station.id}-${direction.id}-${calendar.id}`,
          cardId: `osaka-monorail-${station.id}-${direction.id}`,
          railwayId: 'osaka-monorail',
          railwayNameJa: '大阪モノレール',
          station,
          line: { nameJa: '大阪モノレール本線' },
          direction: {
            id: direction.id,
            labelJa: direction.labelJa,
            defaultDestinationJa: direction.defaultDestinationJa,
          },
          calendar: pickCalendar(calendar),
          source: {
            pageUrl: station.pageUrl,
            apiUrl,
            pdfUrl: station.pdfUrl,
            fetchedAt: GENERATED_AT,
          },
          revision: '2026年時刻表',
          notes: ['□印は万博記念公園駅で彩都線と連絡しません。'],
          departures,
        });
      }
    }
  }
  return schedules;
}

async function fetchHankyuSchedules() {
  const schedules = [];
  for (const direction of HANKYU_DIRECTIONS) {
    for (const calendar of Object.values(CALENDARS)) {
      const htmlUrl = `${HANKYU_BASE}/station/html/HK-68_ky_${direction.code}_${calendar.hankyuCode}.html`;
      const html = await fetchText(htmlUrl);
      const departures = parseHankyuDepartures(html, calendar);
      schedules.push({
        file: `hankyu/minami-ibaraki/${direction.id}-${calendar.id}.json`,
        id: `hankyu-minami-ibaraki-${direction.id}-${calendar.id}`,
        cardId: `hankyu-minami-ibaraki-${direction.id}`,
        railwayId: 'hankyu',
        railwayNameJa: '阪急電車',
        station: HANKYU_STATION,
        line: { nameJa: HANKYU_STATION.lineJa },
        direction: {
          id: direction.id,
          labelJa: direction.labelJa,
        },
        calendar: pickCalendar(calendar),
        source: {
          pageUrl: htmlUrl,
          pdfUrl: `${HANKYU_BASE}/station/pdf/HK-68_ky_${direction.code}_${calendar.hankyuCode}.pdf`,
          fetchedAt: GENERATED_AT,
        },
        revision: parseText(html.match(/改正日[^<]*<\/span>\s*([^<]+)/)?.[1]) || '',
        notes: ['阪急公式ページは駅探との利用契約に基づく時刻表データです。'],
        departures,
      });
    }
  }
  return schedules;
}

async function fetchJrSchedules() {
  const schedules = [];
  for (const direction of JR_DIRECTIONS) {
    for (const calendar of Object.values(CALENDARS)) {
      const pageUrl = `${JR_BASE}/station-timetable/${direction.timetableId}?date=${calendar.jrDate}`;
      const html = await fetchText(pageUrl);
      const parsed = parseJrDepartures(html);
      schedules.push({
        file: `jr-west/ibaraki/${direction.id}-${calendar.id}.json`,
        id: `jr-west-ibaraki-${direction.id}-${calendar.id}`,
        cardId: `jr-west-ibaraki-${direction.id}`,
        railwayId: 'jr-west',
        railwayNameJa: 'JR西日本',
        station: JR_STATION,
        line: { nameJa: JR_STATION.lineJa },
        direction: {
          id: direction.id,
          labelJa: direction.labelJa,
        },
        calendar: {
          ...pickCalendar(calendar),
          representativeDate: calendar.jrRepresentativeDate,
        },
        source: {
          pageUrl,
          stationPageUrl: `https://eki.jr-odekake.net/top?id=${JR_STATION.eid}`,
          fetchedAt: GENERATED_AT,
        },
        revision: parsed.revision,
        notes: [
          'JR西日本公式ページの代表日表示から取得しています。',
          '公式ページにはJR時刻表データの無断転載・複写・加工を禁じる旨が明記されています。',
        ],
        departures: parsed.departures,
      });
    }
  }
  return schedules;
}

// Marks that only add a note. Every other mark must name a destination in direction.destinationMarks.
const MONORAIL_NOTE_MARKS = { 無: '万博記念公園駅で彩都線と連絡しない' };

export function normalizeMonorailDepartures(hourMap, direction) {
  const departures = [];
  for (const [rawHour, minutes] of Object.entries(hourMap)) {
    for (const [rawMinute, rawMarks] of Object.entries(minutes ?? {})) {
      const hour = Number(rawHour);
      const minute = Number(rawMinute);
      if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
        throw new Error(`Monorail time ${JSON.stringify(rawHour)}:${JSON.stringify(rawMinute)} is not a number.`);
      }
      // A mark the legend does not explain must not quietly become the default destination.
      if (!Array.isArray(rawMarks)) {
        throw new Error(`Monorail marks at ${formatTime(hour, minute)} are not a list: ${JSON.stringify(rawMarks)}`);
      }
      const marks = rawMarks;
      const unknownMarks = marks.filter((mark) => !(mark in direction.destinationMarks) && !(mark in MONORAIL_NOTE_MARKS));
      if (unknownMarks.length) {
        throw new Error(`Monorail mark ${unknownMarks.join(', ')} at ${formatTime(hour, minute)} is not in the legend.`);
      }
      const destinationJa =
        marks.map((mark) => direction.destinationMarks[mark]).find(Boolean) ??
        direction.defaultDestinationJa;
      departures.push({
        time: formatTime(hour, minute),
        hour: hour % 24,
        minute,
        serviceDayOffset: hour >= 24 ? 1 : 0,
        serviceType: '普通',
        destinationJa,
        rawMarks: marks,
        notes: marks.filter((mark) => mark in MONORAIL_NOTE_MARKS).map((mark) => MONORAIL_NOTE_MARKS[mark]),
      });
    }
  }
  return sortDepartures(departures);
}

// Every train on the page reads ［普通］, ［準急］ or ［急行］ with a destination. Anything that
// cannot be read stops the run instead of quietly becoming 普通 (the JR parser once did that).
export function parseHankyuDepartures(html, calendar) {
  const departures = [];
  const sections = html.split(/<li class="timetable_hour[^"]*"/).slice(1);
  for (const section of sections) {
    const hour = Number(parseText(section.match(/<span data-wovn-ignore>(\d+)<\/span>/)?.[1]));
    if (!Number.isFinite(hour)) {
      if (/\/station\/timetable\.php/.test(section)) throw new Error('Hankyu trains were found under an hour that could not be read.');
      continue;
    }

    for (const match of section.matchAll(/<a\s+href="([^"]*\/station\/timetable\.php[^"]*)"[\s\S]*?<\/a>/g)) {
      const block = match[0];
      const href = htmlDecode(match[1]);
      const minute = Number(parseText(block.match(/<p class="timetable_min"><span data-wovn-ignore>(\d+)<\/span>/)?.[1]));
      if (!Number.isFinite(minute)) throw new Error(`A Hankyu train at ${hour}時 has no minute that can be read.`);

      const rawType = block.match(/<p class="timetable_train_type">([^<]*)<\/p>/)?.[1];
      const serviceType = parseText(rawType).match(/^［(.+)］$/)?.[1];
      if (!serviceType) {
        throw new Error(`Hankyu train type at ${formatTime(hour, minute)} could not be read: ${JSON.stringify(rawType ?? null)}`);
      }
      const destinationJa = parseText(block.match(/<p class="timetable_station_name">([^<]*)<\/p>/)?.[1]);
      if (!destinationJa) throw new Error(`Hankyu destination at ${formatTime(hour, minute)} could not be read.`);
      const url = new URL(href, HANKYU_BASE);
      departures.push({
        time: formatTime(hour, minute),
        hour,
        minute,
        serviceDayOffset: hour < 4 ? 1 : 0,
        serviceType,
        destinationJa,
        trainId: url.searchParams.get('TX') ?? '',
        detailUrl: url.toString(),
        raw: {
          dw: url.searchParams.get('DW') ?? calendar.hankyuDw,
          tm: url.searchParams.get('TM') ?? `${String(hour).padStart(2, '0')}${String(minute).padStart(2, '0')}`,
        },
      });
    }
  }
  // Each train links to its detail page; a link the loop above did not read means the markup changed.
  const links = html.match(/<a\s+href="[^"]*\/station\/timetable\.php/g)?.length ?? 0;
  if (links !== departures.length) {
    throw new Error(`The Hankyu page links to ${links} trains but ${departures.length} were read.`);
  }
  return sortDepartures(departures);
}

export function parseJrDepartures(html) {
  const destinationMap = parseJrLegendMap(html, '行先・経由');
  const serviceMap = parseJrLegendMap(html, '車種別・列車名');
  const revision = parseText(html.match(/<div class="revision-date">([^<]+)<\/div>/)?.[1]);
  const departures = [];

  const tableMatch = html.match(/<div class="pc-time-tbl-wrap">([\s\S]*?)<div class="notes-wrap">/);
  const tableHtml = tableMatch?.[1] ?? html;
  for (const row of tableHtml.matchAll(/<tr class="body-row">([\s\S]*?)<\/tr>/g)) {
    const rowHtml = row[1];
    const hour = Number(parseText(rowHtml.match(/<td class="hour">(\d+)<\/td>/)?.[1]));
    if (!Number.isFinite(hour)) continue;

    for (const item of rowHtml.matchAll(/<div class="minute-item">([\s\S]*?)<\/a><\/div>/g)) {
      const block = item[1];
      const href = htmlDecode(block.match(/<a href="([^"]+)"/)?.[1] ?? '');
      const minute = Number(parseText(block.match(/<span class=" minute[^"]*">(\d+)<\/span>/)?.[1]));
      if (!Number.isFinite(minute)) continue;

      // The type box can hold an empty <span></span> before the span with the mark
      // (<span class="train-type"><span></span><span class=" legendOrange">A快う</span></span>),
      // so read up to the </span> that closes the box, not to the first </span>.
      const compactService = stripTags(block.match(/<span class="train-type">([\s\S]*?)<\/span>\s*<\/div>/)?.[1] ?? '').trim();
      const destinationCode = parseText(block.match(/<span class="destination">([^<]*)<\/span>/)?.[1]);
      // An unknown mark must not quietly become 普通: stop so that the legend gets a look.
      if (!(compactService in serviceMap)) {
        throw new Error(
          `JR train type "${compactService}" at ${formatTime(hour, minute)} is not in the page's legend (${Object.keys(serviceMap).join(', ')}).`
        );
      }
      const serviceType = serviceMap[compactService];
      const destinationBase = destinationMap[destinationCode] ?? destinationCode;
      const detailUrl = new URL(href, JR_BASE);
      departures.push({
        time: formatTime(hour, minute),
        hour,
        minute,
        serviceDayOffset: hour < 4 ? 1 : 0,
        serviceType,
        destinationJa: destinationBase.endsWith('行') ? destinationBase : `${destinationBase}行`,
        trainId: detailUrl.pathname.split('/').filter(Boolean).pop() ?? '',
        detailUrl: detailUrl.toString(),
        raw: {
          destinationCode,
          serviceCode: compactService,
        },
      });
    }
  }

  return { revision, departures: sortDepartures(departures) };
}

function parseJrLegendMap(html, title) {
  const sectionMatch = html.match(new RegExp(`<div class="notes-ttl">\\s*${escapeRegExp(title)}\\s*<\\/div><div class="notes-comment">([\\s\\S]*?)<\\/div>`));
  const text = stripTags(sectionMatch?.[1] ?? '').replace(/\u00a0/g, ' ');
  const map = {};
  for (const piece of text.split(/\s*=&emsp;|\s+|\u2003/g)) {
    if (!piece.includes('=')) continue;
    const [key, value] = piece.split('=').map((part) => parseText(part));
    if (key && value) map[key] = value;
  }

  for (const match of text.matchAll(/([^=\s]+)\s*=\s*([^=]+?)(?=\s+[^=\s]+\s*=|$)/g)) {
    const key = parseText(match[1]);
    const value = parseText(match[2]);
    if (key && value) map[key] = value;
  }
  map[''] = '普通';
  return map;
}

function buildCards(schedules) {
  const byCard = new Map();
  for (const schedule of schedules) {
    const entry = byCard.get(schedule.cardId) ?? {
      id: schedule.cardId,
      railwayId: schedule.railwayId,
      railwayNameJa: schedule.railwayNameJa,
      station: {
        id: schedule.station.id,
        nameJa: schedule.station.nameJa,
        code: schedule.station.code,
      },
      line: schedule.line,
      direction: schedule.direction,
      calendars: {},
      defaultCalendar: 'weekday',
    };
    entry.calendars[schedule.calendar.id] = {
      labelJa: schedule.calendar.labelJa,
      shortLabelJa: schedule.calendar.shortLabelJa,
      url: `/timetable/data/${schedule.file}`,
      departures: schedule.departures.length,
    };
    byCard.set(schedule.cardId, entry);
  }

  return [...byCard.values()].sort((left, right) => defaultCardRank(left) - defaultCardRank(right));
}

function defaultCardRank(card) {
  const railwayRank = { 'osaka-monorail': 10, hankyu: 20, 'jr-west': 30 }[card.railwayId] ?? 99;
  const stationRank = { unobe: 1, 'minami-ibaraki': 2, ibaraki: 3 }[card.station.id] ?? 9;
  const directionRank = { up: 1, down: 2, osaka: 1, kyoto: 2, 'osaka-kobe': 2 }[card.direction.id] ?? 9;
  return railwayRank * 100 + stationRank * 10 + directionRank;
}

function pickCalendar(calendar) {
  return {
    id: calendar.id,
    labelJa: calendar.labelJa,
    shortLabelJa: calendar.shortLabelJa,
  };
}

function withoutFile(schedule) {
  const { file, ...rest } = schedule;
  return rest;
}

function sortDepartures(departures) {
  return [...departures].sort((left, right) => departureSortMinutes(left) - departureSortMinutes(right));
}

function departureSortMinutes(departure) {
  return (departure.serviceDayOffset ?? 0) * 24 * 60 + departure.hour * 60 + departure.minute;
}

function formatTime(hour, minute) {
  const displayHour = hour % 24;
  return `${String(displayHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: commonHeaders(url) });
  if (!response.ok) {
    throw new Error(`Failed to fetch JSON ${url}: ${response.status}`);
  }
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, { headers: commonHeaders(url) });
  if (!response.ok) {
    throw new Error(`Failed to fetch HTML ${url}: ${response.status}`);
  }
  return response.text();
}

function commonHeaders(url) {
  return {
    'User-Agent': 'rits-oic-map timetable builder (+https://rits-oic-map.app/)',
    Accept: url.endsWith('.json') ? 'application/json,text/plain,*/*' : 'text/html,application/xhtml+xml',
  };
}

async function writeJson(file, data) {
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function stripTags(value) {
  return htmlDecode(String(value ?? '').replace(/<[^>]*>/g, ''));
}

function parseText(value) {
  return htmlDecode(String(value ?? ''))
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlDecode(value) {
  return String(value ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&emsp;/g, ' ');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
