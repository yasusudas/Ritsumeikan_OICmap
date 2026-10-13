// /food と /en/food 共用: NomNom! 由来の「本日のキッチンカー」を /api/food-trucks から取得して描画する。
// 表示言語は <html lang> から判定する(legal-page.js と同じ方針)。

const FOOD_TRUCKS_URL = '/api/food-trucks';
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

const container = document.querySelector('[data-food-trucks]');
const LANG = (document.documentElement.lang || '').toLowerCase().startsWith('en') ? 'en' : 'ja';

const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const STRINGS = {
  ja: {
    title: '本日のキッチンカー',
    empty: '本日の出店予定はありません。',
    error: '本日のキッチンカー情報を取得できませんでした。',
    source: 'データ提供',
    spots: { terrace: 'テラス', plaza: 'プラザ' },
  },
  en: {
    title: "Today's Food Trucks",
    empty: 'No food trucks are scheduled today.',
    error: 'Could not load today’s food trucks.',
    source: 'Source',
    spots: { terrace: 'Terrace', plaza: 'Plaza' },
  },
};

const t = STRINGS[LANG];

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// http/https のみ許可(third-party 由来の URL を src/href に入れる前のガード)。
function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function spotLabel(spot) {
  if (!spot) return '';
  return t.spots[spot] || spot;
}

// "2026-06-18" → ja: "6月18日(木)" / en: "Thu, Jun 18"
function formatDate(dateLabel) {
  const [y, m, d] = String(dateLabel || '').split('-').map(Number);
  if (!y || !m || !d) return '';
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return LANG === 'en'
    ? `${WEEKDAYS_EN[weekday]}, ${MONTHS_EN[m - 1]} ${d}`
    : `${m}月${d}日(${WEEKDAYS_JA[weekday]})`;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

function renderState(message, modifier = '') {
  return `<p class="food-state ${modifier}">${escapeHtml(message)}</p>`;
}

function renderTruck(truck) {
  const image = safeHttpUrl(truck.image);
  const thumb = image
    ? `<img class="food-truck-thumb" src="${escapeHtml(image)}" alt="${escapeHtml(truck.name)}" loading="lazy" decoding="async" />`
    : `<div class="food-truck-thumb food-truck-thumb--empty" aria-hidden="true">🍴</div>`;

  const tags = [truck.type, spotLabel(truck.spot)]
    .filter(Boolean)
    .map((tag) => `<span class="food-truck-tag">${escapeHtml(tag)}</span>`)
    .join('');

  const href = safeHttpUrl(truck.sourceUrl);
  const name = href
    ? `<a class="food-truck-name" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(truck.name)}</a>`
    : `<span class="food-truck-name">${escapeHtml(truck.name)}</span>`;

  return `
    <article class="food-truck-card">
      <div class="food-truck-thumb-wrap">${thumb}</div>
      <div class="food-truck-body">
        ${name}
        ${tags ? `<div class="food-truck-tags">${tags}</div>` : ''}
      </div>
    </article>
  `;
}

function render(payload) {
  const trucks = Array.isArray(payload?.trucks) ? payload.trucks : [];
  const dateText = formatDate(payload?.date);

  const head = `
    <div class="food-board-head">
      <h2 class="food-board-title">${escapeHtml(t.title)}</h2>
      ${dateText ? `<p class="food-board-date">${escapeHtml(dateText)}</p>` : ''}
    </div>
  `;

  const body = trucks.length
    ? `<div class="food-trucks-grid">${trucks.map(renderTruck).join('')}</div>`
    : renderState(t.empty, 'is-empty');

  const sourceUrl = safeHttpUrl(payload?.source?.url);
  const source = sourceUrl
    ? `<p class="food-board-source">${escapeHtml(t.source)}: <a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(payload.source?.name || sourceUrl)}</a></p>`
    : '';

  container.innerHTML = `${head}${body}${source}`;
}

async function refresh() {
  if (!container) return;
  try {
    render(await fetchJson(FOOD_TRUCKS_URL));
  } catch (error) {
    container.innerHTML = renderState(t.error, 'is-error');
  }
}

if (container) {
  refresh();
  window.setInterval(refresh, REFRESH_INTERVAL_MS);
}
