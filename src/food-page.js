// /food と /en/food 共用: NomNom! 由来の「本日のキッチンカー」を /api/food-trucks から取得して描画する。
// 表示言語は <html lang> から判定する(legal-page.js と同じ方針)。

const FOOD_TRUCKS_URL = '/api/food-trucks';
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

const container = document.querySelector('[data-food-trucks]');
const dateSlot = document.querySelector('[data-food-date]');
const LANG = (document.documentElement.lang || '').toLowerCase().startsWith('en') ? 'en' : 'ja';

const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const STRINGS = {
  ja: {
    empty: '本日の出店予定はありません。',
    error: '本日のキッチンカー情報を取得できませんでした。',
    source: 'データ提供',
    noImage: 'NO IMAGE',
    metaSeparator: ' / ',
    spots: { terrace: 'テラス', plaza: 'プラザ' },
  },
  en: {
    empty: 'No food trucks are scheduled today.',
    error: 'Could not load today’s food trucks.',
    source: 'Source',
    noImage: 'NO IMAGE',
    metaSeparator: ' / ',
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
  // 画像は装飾扱い(名前は直下の見出しで読める)。
  const thumb = image
    ? `<img class="food-truck-image" src="${escapeHtml(image)}" alt="" loading="lazy" decoding="async" />`
    : `<span class="food-truck-noimage" aria-hidden="true">${escapeHtml(t.noImage)}</span>`;

  const meta = [truck.type, spotLabel(truck.spot)].filter(Boolean).map(escapeHtml).join(t.metaSeparator);

  const href = safeHttpUrl(truck.sourceUrl);
  const name = href
    ? `<a class="food-truck-link external" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(truck.name)}</a>`
    : escapeHtml(truck.name);

  return `
    <li class="food-truck${href ? ' has-link' : ''}">
      <div class="food-truck-thumb${image ? '' : ' is-empty'}">${thumb}</div>
      <h3 class="food-truck-name">${name}</h3>
      ${meta ? `<p class="food-truck-meta">${meta}</p>` : ''}
    </li>
  `;
}

function renderDate(dateText) {
  if (!dateSlot) return;
  dateSlot.textContent = dateText;
  dateSlot.hidden = !dateText;
}

function render(payload) {
  const trucks = Array.isArray(payload?.trucks) ? payload.trucks : [];
  renderDate(formatDate(payload?.date));

  const body = trucks.length
    ? `<ul class="food-trucks">${trucks.map(renderTruck).join('')}</ul>`
    : renderState(t.empty, 'is-empty');

  const sourceUrl = safeHttpUrl(payload?.source?.url);
  const source = sourceUrl
    ? `<p class="food-source">${escapeHtml(t.source)}: <a class="text-link external" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(payload.source?.name || sourceUrl)}</a></p>`
    : '';

  container.innerHTML = `${body}${source}`;
}

async function refresh() {
  if (!container) return;
  try {
    render(await fetchJson(FOOD_TRUCKS_URL));
  } catch (error) {
    renderDate('');
    container.innerHTML = renderState(t.error, 'is-error');
  }
}

if (container) {
  refresh();
  window.setInterval(refresh, REFRESH_INTERVAL_MS);
}
