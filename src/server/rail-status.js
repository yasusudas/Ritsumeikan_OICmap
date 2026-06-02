export const RAIL_STATUS_REFRESH_INTERVAL_SECONDS = 15 * 60;

const FETCH_TIMEOUT_MS = 12_000;
const DEFAULT_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
};

const SOURCES = [
  {
    id: 'hankyu-kyoto',
    railway: '阪急電鉄',
    line: '阪急京都線',
    color: '#7a4b2a',
    sourceUrl: 'https://www.hankyu.co.jp/railinfo/',
    scrapeUrl: 'https://www.hankyu.co.jp/railinfo/include/page_railinfo.html',
    fetcher: fetchHankyuKyotoStatus,
  },
  {
    id: 'osaka-monorail',
    railway: '大阪モノレール',
    line: '大阪モノレール',
    color: '#0072bc',
    sourceUrl: 'https://www.osaka-monorail.co.jp/',
    scrapeUrl: 'https://www.osaka-monorail.co.jp/',
    fetcher: fetchOsakaMonorailStatus,
  },
  {
    id: 'jr-kyoto',
    railway: 'JR西日本',
    line: 'JR京都線',
    color: '#0065b1',
    sourceUrl: 'https://trafficinfo.westjr.co.jp/kinki.html',
    scrapeUrl: 'https://trafficinfo.westjr.co.jp/api/v1/trafficinfo.json',
    fetcher: fetchJrKyotoStatus,
  },
];

const STATUS_LABELS = {
  normal: '平常運転',
  notice: 'お知らせあり',
  delay: '遅延あり',
  suspended: '運転見合わせ',
  unknown: '確認中',
  error: '取得不可',
};

const STATUS_SEVERITY = {
  normal: 0,
  unknown: 1,
  notice: 2,
  delay: 3,
  suspended: 4,
  error: 5,
};

export async function getRailStatusPayload() {
  const generatedAt = new Date();
  const statuses = await Promise.all(SOURCES.map((source) => safeFetchSourceStatus(source)));

  return {
    generatedAt: generatedAt.toISOString(),
    nextUpdateAt: new Date(generatedAt.getTime() + RAIL_STATUS_REFRESH_INTERVAL_SECONDS * 1000).toISOString(),
    refreshIntervalSeconds: RAIL_STATUS_REFRESH_INTERVAL_SECONDS,
    sources: statuses,
  };
}

async function safeFetchSourceStatus(source) {
  try {
    const status = await source.fetcher(source);
    return normalizeStatusResult(source, status);
  } catch (error) {
    return normalizeStatusResult(source, {
      status: 'error',
      summary: '運行情報を取得できませんでした。',
      details: [error instanceof Error ? error.message : String(error)],
    });
  }
}

function normalizeStatusResult(source, status) {
  const statusId = status.status || 'unknown';
  return {
    id: source.id,
    railway: source.railway,
    line: source.line,
    color: source.color,
    status: statusId,
    statusLabel: STATUS_LABELS[statusId] || STATUS_LABELS.unknown,
    summary: status.summary || STATUS_LABELS[statusId] || STATUS_LABELS.unknown,
    details: uniqueItems(status.details || []).slice(0, 4),
    sourceUrl: source.sourceUrl,
    fetchedAt: status.fetchedAt || new Date().toISOString(),
  };
}

async function fetchHankyuKyotoStatus(source) {
  const html = await fetchText(source.scrapeUrl);
  const fetchedAt = new Date().toISOString();
  const lineRows = [
    ...html.matchAll(
      /<div class="sec02_inner_cnt_line[^"]*"[\s\S]*?<h3[\s\S]*?<span>([\s\S]*?)<\/span>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>[\s\S]*?<\/div>/gi
    ),
  ];
  const kyotoRow = lineRows.find((row) => compactText(stripTags(row[1])).includes('京都線'));
  const lineStatusText = kyotoRow ? compactText(stripTags(kyotoRow[2])) : '';
  const notices = extractHankyuNotices(html);
  const statuses = [classifyStatus(lineStatusText), ...notices.map((notice) => classifyStatus(notice))];
  const status = mergeStatuses(statuses);
  const summary =
    status === 'normal'
      ? '京都線は平常運転です。'
      : lineStatusText.includes('平常')
        ? '京都線は平常運転ですが、お知らせがあります。'
        : `京都線: ${lineStatusText || STATUS_LABELS[status]}`;

  return {
    status,
    summary,
    details: notices.length ? notices : lineStatusText ? [lineStatusText] : [],
    fetchedAt,
  };
}

function extractHankyuNotices(html) {
  return uniqueItems(
    [...html.matchAll(/<div class="sec03_inner_cnt_text">([\s\S]*?)<\/div>/gi)]
      .map((match) => compactText(stripTags(match[1])))
      .filter(Boolean)
  );
}

async function fetchOsakaMonorailStatus(source) {
  const html = await fetchText(source.scrapeUrl);
  const fetchedAt = new Date().toISOString();
  const statusHtml = extractFirstMatch(html, /<p class="operationStatus__status">([\s\S]*?)<\/p>/i);
  const statusText = extractVisibleStatusSpans(statusHtml).join(' ') || compactText(stripTags(statusHtml));
  const detailTexts = uniqueItems(
    [...html.matchAll(/<p class="operationStatus__detail__text[^"]*"[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((match) => compactText(stripTags(match[1])))
      .filter(Boolean)
  );
  const status = mergeStatuses([classifyStatus(statusText), ...detailTexts.map((detail) => classifyStatus(detail))]);

  return {
    status,
    summary: status === 'normal' ? '現在、平常通り運行しています。' : detailTexts[0] || statusText || STATUS_LABELS[status],
    details: detailTexts.length ? detailTexts : statusText ? [statusText] : [],
    fetchedAt,
  };
}

async function fetchJrKyotoStatus(source) {
  const data = await fetchJson(source.scrapeUrl);
  const fetchedAt = new Date().toISOString();
  const area = findById(data.areaTrafficInfos, 2);
  const today = area?.dailyData?.[0];
  const place = findById(today?.placeTrafficInfos, 1);
  const lineInfo = findById(place?.conventionalLineTrafficInfos, 3);
  const lineDelay = findById(area?.conventionalLineDelayInfos, 3);
  const lineDetails = lineInfo?.conventionalLineTrafficInfoDetails || [];
  const noEffectNotices = place?.noEffectLineTrafficInfos || [];
  const statuses = [];
  const details = [];

  if (lineDetails.length) {
    lineDetails.forEach((detail) => {
      statuses.push(statusFromJrIcon(detail.iconType));
      details.push(formatJrTrafficDetail(detail));
    });
  }

  if (lineDelay) {
    statuses.push('delay');
    details.push(`列車に遅れが出ています。${lineDelay.updatedAt ? ` ${formatJapaneseDateTime(lineDelay.updatedAt)}更新` : ''}`);
  }

  if (!lineDetails.length && !lineDelay && noEffectNotices.length) {
    statuses.push(statusFromJrIcon(place?.iconType));
    details.push(...noEffectNotices.map(formatJrAreaNotice));
  }

  if (!statuses.length) statuses.push('normal');

  const status = mergeStatuses(statuses);
  return {
    status,
    summary:
      status === 'normal'
        ? 'JR京都線は平常運転です。'
        : lineDetails.length || lineDelay
          ? `JR京都線: ${STATUS_LABELS[status]}`
          : '京阪神地区のお知らせがあります。',
    details: uniqueItems(details.filter(Boolean)),
    fetchedAt: data.createdAt || fetchedAt,
  };
}

function findById(items, id) {
  return (items || []).find((item) => Number(item.id) === id);
}

function formatJrTrafficDetail(detail) {
  const sections = (detail.sections || [])
    .map((section) => [section.segment, section.upAndDown, formatSectionStations(section)].filter(Boolean).join(' '))
    .filter(Boolean);
  return [
    detail.conditionName,
    detail.cause && `原因: ${detail.cause}`,
    detail.supplementary,
    sections.length ? `区間: ${sections.join(' / ')}` : '',
    detail.publicationDate ? `${formatJapaneseDateTime(detail.publicationDate)}更新` : '',
  ]
    .filter(Boolean)
    .join(' / ');
}

function formatJrAreaNotice(notice) {
  return [
    notice.cause,
    notice.supplementary,
    notice.publicationDate ? `${formatJapaneseDateTime(notice.publicationDate)}更新` : '',
  ]
    .filter(Boolean)
    .join(' / ');
}

function formatSectionStations(section) {
  if (!section.startStation && !section.endStation) return '';
  if (!section.endStation || section.startStation === section.endStation) return section.startStation;
  return `${section.startStation} - ${section.endStation}`;
}

function statusFromJrIcon(iconType) {
  if (iconType === '0001') return 'suspended';
  if (iconType === '0003') return 'delay';
  if (iconType === '0000' || iconType === '0999') return 'notice';
  return 'normal';
}

async function fetchText(url) {
  const response = await fetchWithTimeout(url);
  return response.text();
}

async function fetchJson(url) {
  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: 'application/json',
    },
  });
  return response.json();
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...DEFAULT_HEADERS,
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`${url} returned ${response.status}`);
    }
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

function classifyStatus(text) {
  const value = compactText(text);
  if (!value) return 'unknown';

  const potentialNotice = /可能性|場合があります|見込|見込み|おそれ|予告|今後|注意|接近/.test(value);
  if (!potentialNotice && /運転見合わせ|見合わせ|運休|運転を取り止め|取り止め/.test(value)) {
    return 'suspended';
  }
  if (!potentialNotice && /遅延|遅れ|徐行/.test(value)) {
    return 'delay';
  }
  if (/お知らせ|可能性|場合があります|見込|見込み|おそれ|予告|台風|影響|注意|振替/.test(value)) {
    return 'notice';
  }
  if (/平常|通常|遅れはございません|遅れなどの情報はありません/.test(value)) {
    return 'normal';
  }
  return 'unknown';
}

function mergeStatuses(statuses) {
  return statuses
    .filter(Boolean)
    .reduce((current, next) => (STATUS_SEVERITY[next] > STATUS_SEVERITY[current] ? next : current), 'normal');
}

function extractFirstMatch(text, pattern) {
  return text.match(pattern)?.[1] || '';
}

function extractVisibleStatusSpans(html) {
  return [...String(html || '').matchAll(/<span([^>]*)>([\s\S]*?)<\/span>/gi)]
    .filter((match) => !/undisp/.test(match[1]))
    .map((match) => compactText(stripTags(match[2])))
    .filter(Boolean);
}

function stripTags(html) {
  return decodeHtmlEntities(String(html || ''))
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ');
}

function compactText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number.parseInt(number, 10)));
}

function uniqueItems(items) {
  return [...new Set(items.map((item) => compactText(item)).filter(Boolean))];
}

function formatJapaneseDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Tokyo',
  }).format(date);
}
