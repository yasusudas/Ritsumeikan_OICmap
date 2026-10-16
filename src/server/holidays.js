// 日本の祝日（時刻表の「平日 / 土曜・休日」の判定に使う）。
//
// 祝日の一覧を手元に保存せず、Google カレンダーが公開している「日本の祝日」の ICS から取得する。
// /api/holidays は Vercel の CDN に HOLIDAYS_REFRESH_INTERVAL_SECONDS（1日）キャッシュされ、
// 同じインスタンスの中でもその間は取得し直さないので、取得元へ問い合わせるのは1日に1回程度。
// この ICS には節分・クリスマス・銀行休業日などの「祭日」も入っているので、説明欄の1行目が
// 「祝日」の予定（国民の祝日・振替休日・国民の休日）だけを使う。2026・2027年分は内閣府の
// 「国民の祝日」CSV と一致することを確認した（2026-10-16）。

export const HOLIDAYS_REFRESH_INTERVAL_SECONDS = 24 * 60 * 60;

export const HOLIDAYS_ICS_URL =
  'https://calendar.google.com/calendar/ical/ja.japanese%23holiday%40group.v.calendar.google.com/public/basic.ics';

export const HOLIDAYS_SOURCE = {
  nameJa: 'Google カレンダー「日本の祝日」',
  url: 'https://calendar.google.com/calendar/embed?src=ja.japanese%23holiday%40group.v.calendar.google.com&ctz=Asia%2FTokyo',
  icsUrl: HOLIDAYS_ICS_URL,
};

const FETCH_TIMEOUT_MS = 12_000;

let cached = null;

export async function getHolidaysPayload(now = new Date()) {
  if (cached && now.getTime() < cached.expiresAt) return cached.payload;

  const text = await fetchIcs(HOLIDAYS_ICS_URL);
  const holidays = parseJapaneseHolidaysIcs(text);
  if (!holidays.length) {
    throw new Error('No holidays found in the calendar');
  }

  const payload = {
    generatedAt: now.toISOString(),
    nextUpdateAt: new Date(now.getTime() + HOLIDAYS_REFRESH_INTERVAL_SECONDS * 1000).toISOString(),
    refreshIntervalSeconds: HOLIDAYS_REFRESH_INTERVAL_SECONDS,
    source: HOLIDAYS_SOURCE,
    count: holidays.length,
    holidays,
  };
  cached = { payload, expiresAt: now.getTime() + HOLIDAYS_REFRESH_INTERVAL_SECONDS * 1000 };
  return payload;
}

// ICS の VEVENT から、説明欄が「祝日」の終日予定を { date: 'YYYY-MM-DD', nameJa } にして日付順に返す。
export function parseJapaneseHolidaysIcs(text) {
  const unfolded = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]/g, '');
  const holidays = new Map();

  for (const block of unfolded.match(/BEGIN:VEVENT\n[\s\S]*?\nEND:VEVENT/g) ?? []) {
    const fields = {};
    for (const line of block.split('\n')) {
      const colon = line.indexOf(':');
      if (colon < 0) continue;
      const name = line.slice(0, colon).split(';')[0].toUpperCase();
      if (!(name in fields)) fields[name] = line.slice(colon + 1);
    }

    const kind = unescapeIcsText(fields.DESCRIPTION ?? '').split('\n')[0].trim();
    if (kind !== '祝日') continue;

    const date = (fields.DTSTART ?? '').match(/^(\d{4})(\d{2})(\d{2})/);
    if (!date) continue;

    const key = `${date[1]}-${date[2]}-${date[3]}`;
    holidays.set(key, { date: key, nameJa: unescapeIcsText(fields.SUMMARY ?? '').trim() });
  }

  return [...holidays.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function unescapeIcsText(value) {
  return value.replace(/\\([\\;,nN])/g, (_, char) => (char === 'n' || char === 'N' ? '\n' : char));
}

async function fetchIcs(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'text/calendar,text/plain;q=0.9,*/*;q=0.8',
        'User-Agent': 'rits-oic-map holiday sync (+https://rits-oic-map.app/)',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`${url} returned ${response.status}`);
    }
    return response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}
