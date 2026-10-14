// 立命館生協の「各店舗営業時間」から、OIC の店舗の営業カレンダーを取り出すモジュール。
//
// データソースは生協サイトの月ごとの静的HTML(schedule/schedule_YYYYMM.html)。
// ページの裏に JSON API はなく(ブラウザの通信も HTML・CSS・画像だけ)、営業日の表は
// サーバーが組み立てた HTML に入っている。そのため HTML を解析する。
//
// - 店舗ブロックの id(shop_20, shop_20t …)は月ごとに付け直されるので、店名(h3)で識別する。
// - ○・×・□ などの記号の意味は月・店舗ごとに変わる(休暇期は□が短縮営業、など)ため、
//   各ブロックの凡例(dt / dd)で解決する。
// - ページに年月の表記はない。日付の列が曜日と一致するかを確かめて、別の月の表を取り違えない。
// - 翌月分は前月のうちに公開される。未公開の月は 404 を返す。
// 想定と違う構造を見つけたら推測で埋めずにエラーにする(表示側は公式ページへのリンクに戻す)。

export const COOP_HOURS_REFRESH_INTERVAL_SECONDS = 6 * 60 * 60;
export const COOP_SCHEDULE_PAGE_URL = 'https://www.ritsco-op.jp/schedule/index.html#s03';

const SCHEDULE_BASE_URL = 'https://www.ritsco-op.jp/schedule/';
const CAMPUS_HEADING = 'OIC';
const FETCH_TIMEOUT_MS = 12_000;
const TIME_RANGE = /(\d{1,2}):(\d{2})\s*[-‐–〜～~]\s*(\d{1,2}):(\d{2})/g;

export async function getCoopHoursPayload({ now = new Date(), fetchImpl = fetch } = {}) {
  const today = jstDate(now);
  const targets = [today, addMonths(today, 1)];
  const months = [];
  const storesByName = new Map();

  for (const [index, target] of targets.entries()) {
    const url = scheduleUrl(target);
    const response = await fetchWithTimeout(fetchImpl, url);
    // 翌月分だけは未公開(404)を許す。当月が取れないのは異常として扱う。
    if (response.status === 404 && index > 0) {
      months.push({ month: monthLabel(target), url, published: false });
      continue;
    }
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);

    const stores = parseCoopSchedule(await response.text(), target);
    months.push({ month: monthLabel(target), url, published: true });
    for (const store of stores) {
      const merged = storesByName.get(store.name) ?? { name: store.name, building: store.building, days: [] };
      merged.building ||= store.building;
      merged.days.push(...store.days);
      storesByName.set(store.name, merged);
    }
  }

  return {
    generatedAt: now.toISOString(),
    today: today.label,
    refreshIntervalSeconds: COOP_HOURS_REFRESH_INTERVAL_SECONDS,
    nextUpdateAt: new Date(now.getTime() + COOP_HOURS_REFRESH_INTERVAL_SECONDS * 1000).toISOString(),
    months,
    stores: [...storesByName.values()],
    source: { name: '立命館生協 各店舗営業時間', url: COOP_SCHEDULE_PAGE_URL },
  };
}

// 1か月分のページ HTML から、OIC の各店舗の日別の営業予定を返す。
export function parseCoopSchedule(html, { year, month }) {
  const section = campusSection(html, CAMPUS_HEADING);
  // 見出しの div には id が付くこともある(id="s03room" など)。
  const blocks = section.split(/<div class="tit_shop_s\b[^"]*"[^>]*>/).slice(1);
  if (blocks.length === 0) throw new Error(`No stores found in the ${CAMPUS_HEADING} section`);
  // 表の数と店舗見出しの数が合わなければ、読み落としがあるとみなす。
  const tables = section.match(/<table\b/g)?.length ?? 0;
  if (tables !== blocks.length) throw new Error(`Found ${blocks.length} store headings but ${tables} tables`);

  return blocks.map((block) => {
    const body = block.slice(0, block.indexOf('</table>'));
    const name = normalizeName(textOf(body.match(/<h3>([\s\S]*?)<\/h3>/)?.[1] ?? ''));
    if (!name) throw new Error('Store block without a name');
    const building = normalizeSpace(textOf(body.match(/class="foS14">([\s\S]*?)<\/p>/)?.[1] ?? ''));
    const legend = parseLegend(body, name);
    const days = parseCalendar(body, { year, month, name, legend });
    return { name, building, days };
  });
}

function campusSection(html, heading) {
  const headings = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)];
  const index = headings.findIndex((match) => normalizeSpace(textOf(match[1])) === heading);
  if (index < 0) throw new Error(`Section "${heading}" not found`);
  const start = headings[index].index;
  const end = headings[index + 1]?.index ?? html.length;
  return html.slice(start, end);
}

function parseLegend(body, name) {
  const info = body.match(/<td class="schedule_info"[^>]*>([\s\S]*?)<\/td>/)?.[1];
  if (!info) throw new Error(`${name}: legend not found`);
  const legend = new Map();
  for (const [, symbol, text] of info.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)) {
    legend.set(normalizeSpace(textOf(symbol)), describeHours(textOf(text)));
  }
  if (legend.size === 0) throw new Error(`${name}: empty legend`);
  return legend;
}

function parseCalendar(body, { year, month, name, legend }) {
  const calendar = body.slice(0, body.search(/<td class="schedule_info"/));
  const cells = [...calendar.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => match[1]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const days = [];

  cells.forEach((cell, column) => {
    const number = cell.match(/<span class="num">(\d+)<\/span>/)?.[1];
    if (!number) {
      if (textOf(cell).trim()) throw new Error(`${name}: unexpected calendar cell`);
      return;
    }
    const day = Number(number);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    // 表は日曜始まり。列と曜日が合わなければ別の月の表とみなす。
    if (day !== days.length + 1 || column % 7 !== weekday) {
      throw new Error(`${name}: calendar does not match ${monthLabel({ year, month })}`);
    }
    const symbol = normalizeSpace(textOf(cell.replace(/<span class="num">\d+<\/span>/, '')));
    const hours = legend.get(symbol);
    if (!hours) throw new Error(`${name}: symbol "${symbol}" on day ${day} is not in the legend`);
    days.push({ date: `${monthLabel({ year, month })}-${pad(day)}`, symbol, ...hours });
  });

  if (days.length !== lastDay) throw new Error(`${name}: expected ${lastDay} days, found ${days.length}`);
  return days;
}

// 凡例の文(「8:00-9:00/10:30-19:00」「弁当・ドリンク販売 11:30-12:45」改行…)を構造化する。
function describeHours(text) {
  const lines = text.split('\n').map(normalizeSpace).filter(Boolean);
  const joined = lines.join('\n');
  if (lines.length === 1 && /^(closed|休業|閉店|休み)$/i.test(lines[0])) {
    return { closed: true, allDay: false, text: joined, periods: [] };
  }
  const periods = [];
  for (const line of lines) {
    const ranges = [...line.matchAll(TIME_RANGE)];
    if (ranges.length === 0) continue;
    // 行頭の文(「弁当・ドリンク販売」など)を、その行の時間帯すべての名前にする。
    const label = normalizeSpace(line.slice(0, ranges[0].index)) || null;
    for (const range of ranges) {
      periods.push({ label, start: `${pad(range[1])}:${range[2]}`, end: `${pad(range[3])}:${range[4]}` });
    }
  }
  return { closed: false, allDay: /24\s*時間/.test(joined), text: joined, periods };
}

function textOf(fragment) {
  return decodeEntities(
    fragment
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  );
}

function decodeEntities(text) {
  const named = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
    if (code[0] === '#') {
      const value = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return String.fromCodePoint(value);
    }
    return named[code.toLowerCase()] ?? entity;
  });
}

function normalizeSpace(text) {
  return text.replace(/[\s　]+/g, ' ').trim();
}

// 「OIC Mini Meal Shop みにみる\n（コンビニ）」→「OIC Mini Meal Shop みにみる（コンビニ）」
function normalizeName(text) {
  return normalizeSpace(text).replace(/\s+（/g, '（');
}

function jstDate(now) {
  const jst = new Date(now.getTime() + 9 * 3600 * 1000);
  const year = jst.getUTCFullYear();
  const month = jst.getUTCMonth() + 1;
  const day = jst.getUTCDate();
  return { year, month, day, label: `${year}-${pad(month)}-${pad(day)}` };
}

function addMonths({ year, month }, count) {
  const index = year * 12 + (month - 1) + count;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function monthLabel({ year, month }) {
  return `${year}-${pad(month)}`;
}

function scheduleUrl({ year, month }) {
  return `${SCHEDULE_BASE_URL}schedule_${year}${pad(month)}.html`;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

async function fetchWithTimeout(fetchImpl, url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}
