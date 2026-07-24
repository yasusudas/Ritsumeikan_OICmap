import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUTPUT_ROOT = path.resolve('public/hidden/timetable/data');
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
    jrDate: '20260601',
    jrRepresentativeDate: '2026-06-01',
  },
  holiday: {
    id: 'holiday',
    labelJa: '土曜・休日',
    shortLabelJa: '休日',
    monorailSuffix: 'holiday',
    hankyuCode: 'h',
    hankyuDw: '2',
    jrDate: '20260607',
    jrRepresentativeDate: '2026-06-07',
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

const HOLIDAY_CALENDAR = {
  country: 'JP',
  sourceNameJa: '内閣府 国民の祝日',
  sourceUrl: 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv',
  holidays: [
    { date: '2026-01-01', nameJa: '元日' },
    { date: '2026-01-12', nameJa: '成人の日' },
    { date: '2026-02-11', nameJa: '建国記念の日' },
    { date: '2026-02-23', nameJa: '天皇誕生日' },
    { date: '2026-03-20', nameJa: '春分の日' },
    { date: '2026-04-29', nameJa: '昭和の日' },
    { date: '2026-05-03', nameJa: '憲法記念日' },
    { date: '2026-05-04', nameJa: 'みどりの日' },
    { date: '2026-05-05', nameJa: 'こどもの日' },
    { date: '2026-05-06', nameJa: '休日' },
    { date: '2026-07-20', nameJa: '海の日' },
    { date: '2026-08-11', nameJa: '山の日' },
    { date: '2026-09-21', nameJa: '敬老の日' },
    { date: '2026-09-22', nameJa: '休日' },
    { date: '2026-09-23', nameJa: '秋分の日' },
    { date: '2026-10-12', nameJa: 'スポーツの日' },
    { date: '2026-11-03', nameJa: '文化の日' },
    { date: '2026-11-23', nameJa: '勤労感謝の日' },
  ],
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
        url: 'https://timetable.jr-odekake.net/station-timetable/2791011001?date=20260601',
      },
      {
        labelJa: 'JR茨木駅 高槻・京都方面 休日代表日',
        url: 'https://timetable.jr-odekake.net/station-timetable/2791011001?date=20260607',
      },
      {
        labelJa: 'JR茨木駅 新大阪・大阪・三ノ宮方面 平日代表日',
        url: 'https://timetable.jr-odekake.net/station-timetable/2791011002?date=20260601',
      },
      {
        labelJa: 'JR茨木駅 新大阪・大阪・三ノ宮方面 休日代表日',
        url: 'https://timetable.jr-odekake.net/station-timetable/2791011002?date=20260607',
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
        url: 'https://timetable.jr-odekake.net/station-timetable/2791011001?date=20260601',
      },
    ],
  },
];

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});

async function main() {
  await mkdir(OUTPUT_ROOT, { recursive: true });

  const schedules = [
    ...(await fetchMonorailSchedules()),
    ...(await fetchHankyuSchedules()),
    ...(await fetchJrSchedules()),
  ];

  const cards = buildCards(schedules);
  for (const schedule of schedules) {
    const file = path.join(OUTPUT_ROOT, schedule.file);
    await mkdir(path.dirname(file), { recursive: true });
    await writeJson(file, withoutFile(schedule));
  }

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
      'JR西日本の時刻は代表日として平日 2026-06-01、休日 2026-06-07 の表示を取得しています。',
      '阪急電車の時刻表ページには、データの加工・再利用・再配布に許可が必要である旨が明記されています。',
      'JR西日本の時刻表ページには、JR時刻表データの無断転載・複写・加工を禁じる旨が明記されています。',
    ],
    sourceReferences: SOURCE_REFERENCES,
  };
  await writeJson(path.join(OUTPUT_ROOT, 'manifest.json'), manifest);

  console.log(`Wrote ${schedules.length} schedules and ${cards.length} cards to ${OUTPUT_ROOT}`);
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

function normalizeMonorailDepartures(hourMap, direction) {
  const departures = [];
  for (const [rawHour, minutes] of Object.entries(hourMap)) {
    for (const [rawMinute, rawMarks] of Object.entries(minutes ?? {})) {
      const hour = Number(rawHour);
      const minute = Number(rawMinute);
      const marks = Array.isArray(rawMarks) ? rawMarks : [];
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
        notes: marks.includes('無') ? ['万博記念公園駅で彩都線と連絡しない'] : [],
      });
    }
  }
  return sortDepartures(departures);
}

function parseHankyuDepartures(html, calendar) {
  const departures = [];
  const sections = html.split(/<li class="timetable_hour[^"]*"/).slice(1);
  for (const section of sections) {
    const hour = Number(parseText(section.match(/<span data-wovn-ignore>(\d+)<\/span>/)?.[1]));
    if (!Number.isFinite(hour)) continue;

    for (const match of section.matchAll(/<a\s+href="([^"]*\/station\/timetable\.php[^"]*)"[\s\S]*?<\/a>/g)) {
      const block = match[0];
      const href = htmlDecode(match[1]);
      const minute = Number(parseText(block.match(/<p class="timetable_min"><span data-wovn-ignore>(\d+)<\/span>/)?.[1]));
      if (!Number.isFinite(minute)) continue;

      const serviceType = parseText(block.match(/<p class="timetable_train_type">([^<]*)<\/p>/)?.[1]).replace(/[［］]/g, '') || '普通';
      const destinationJa = parseText(block.match(/<p class="timetable_station_name">([^<]*)<\/p>/)?.[1]);
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
  return sortDepartures(departures);
}

function parseJrDepartures(html) {
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

      const compactService = stripTags(block.match(/<span class="train-type">([\s\S]*?)<\/span>/)?.[1] ?? '').trim();
      const destinationCode = parseText(block.match(/<span class="destination">([^<]*)<\/span>/)?.[1]);
      const serviceType = serviceMap[compactService] ?? compactService.replace(/う$/, '（うれしート連結）') ?? '普通';
      const destinationBase = destinationMap[destinationCode] ?? destinationCode;
      const detailUrl = new URL(href, JR_BASE);
      departures.push({
        time: formatTime(hour, minute),
        hour,
        minute,
        serviceDayOffset: hour < 4 ? 1 : 0,
        serviceType: serviceType || '普通',
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
      url: `/hidden/timetable/data/${schedule.file}`,
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
