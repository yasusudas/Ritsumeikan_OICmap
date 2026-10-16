// /food と /en/food 共用。常設店舗は地図と同じデータ、キッチンカーは別 API。
// 表示言語は <html lang> から判定する(legal-page.js と同じ方針)。

import { foodDataUrl } from 'virtual:rits-oic-food-data';
import { CoopHoursClient, japaneseDate, FOOD_STATUS_MS } from './food-guide-model.js';
import {
  foodPlacesReady,
  renderFoodHours,
  renderFoodPlaceList,
  renderFoodPlaceStatus,
} from './food-place-cards.js';

const FOOD_TRUCKS_URL = '/api/food-trucks';
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

const container = document.querySelector('[data-food-trucks]');
const placesRoot = document.querySelector('[data-food-places]');
const dateSlot = document.querySelector('[data-food-date]');
const LANG = (document.documentElement.lang || '').toLowerCase().startsWith('en') ? 'en' : 'ja';

const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const STRINGS = {
  ja: {
    empty: '本日の出店予定はありません。',
    outOfPeriod: '営業カレンダーの期間外です。最新の出店予定は公式の案内をご確認ください。',
    error: '本日のキッチンカー情報を取得できませんでした。',
    noImage: 'NO IMAGE',
    metaSeparator: ' / ',
    spots: { terrace: 'TERRACE GATE前', plaza: '空のプラザ' },
  },
  en: {
    empty: 'No food trucks are scheduled today.',
    outOfPeriod: 'Today is outside the published schedule. Please check the official announcement.',
    error: 'Could not load today’s food trucks.',
    noImage: 'NO IMAGE',
    metaSeparator: ' / ',
    spots: { terrace: 'In front of TERRACE GATE', plaza: 'Sky Plaza' },
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

// 画像は同じサイト内のパス（/lunch-street/…）か http(s) の URL だけを許可する。
function safeImageUrl(value) {
  const text = String(value ?? '');
  if (/^\/(?!\/)[\w./-]+$/.test(text)) return text;
  return safeHttpUrl(text);
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

function renderTruck(truck, hours) {
  const image = safeImageUrl(truck.image);
  // 画像は装飾扱い(名前は直下の見出しで読める)。
  const whole = image.startsWith('/');
  const thumb = image
    ? `<img class="food-truck-image${whole ? ' is-whole' : ''}" src="${escapeHtml(image)}" alt="" loading="lazy" decoding="async" />`
    : `<span class="food-truck-noimage" aria-hidden="true">${escapeHtml(t.noImage)}</span>`;

  const meta = [truck.type, spotLabel(truck.spot), hours]
    .filter(Boolean)
    .map(escapeHtml)
    .join(t.metaSeparator);

  const href = safeHttpUrl(truck.sourceUrl);
  const name = href
    ? `<a class="food-truck-link external" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(truck.name)}</a>`
    : escapeHtml(truck.name);

  return `
    <li class="food-truck${href ? ' has-link' : ''}">
      <div class="food-truck-thumb${image ? '' : ' is-empty'}${whole ? ' is-whole' : ''}">${thumb}</div>
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

  const hours = payload?.hours?.start && payload?.hours?.end ? `${payload.hours.start}–${payload.hours.end}` : '';
  const body = trucks.length
    ? `<ul class="food-trucks">${trucks.map((truck) => renderTruck(truck, hours)).join('')}</ul>`
    : renderState(payload?.outOfPeriod ? t.outOfPeriod : t.empty, 'is-empty');

  // 出典は情報源・権利のページ（/sources/）にまとめている。
  container.innerHTML = body;
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

let places = [];
let placesLoaded = false;
let awaitingHours = false;
let hoursTimer = 0;
const hours = new CoopHoursClient({
  changed() {
    awaitingHours = false;
    paintHours();
    scheduleHours();
  },
});

function placesNeedCoop() {
  return placesLoaded && places.some((place) => place.services.some((service) => service.coopScheduleName));
}

function placesNeedStatus() {
  return placesLoaded && places.some((place) => place.services.some((service) => service.status?.assignee));
}

function hourOptions() {
  return {
    lang: LANG,
    payload: hours.payload,
    loading: awaitingHours || (Boolean(hours.pending) && !hours.error),
    fetchFailed: Boolean(hours.error),
    now: new Date(),
  };
}

function paintHours() {
  if (!placesRoot || !placesLoaded) return;
  for (const place of places) {
    const node = placesRoot.querySelector(`[data-food-hours="${CSS.escape(place.entryId)}"]`);
    if (node) node.innerHTML = renderFoodHours(place, hourOptions());
  }
}

function bindMarkFallback() {
  placesRoot?.querySelectorAll('[data-food-fallback]').forEach((img) => {
    img.addEventListener(
      'error',
      () => {
        img.src = img.dataset.foodFallback;
      },
      { once: true },
    );
  });
}

function scheduleHours() {
  window.clearTimeout(hoursTimer);
  const coop = placesNeedCoop();
  const status = placesNeedStatus();
  if ((!coop && !status) || document.visibilityState !== 'visible') return;
  const today = japaneseDate();
  const wait = Math.min(coop ? hours.nextCheck() : FOOD_STATUS_MS, status ? FOOD_STATUS_MS : Infinity);
  hoursTimer = window.setTimeout(() => {
    paintHours();
    if (coop && (japaneseDate() !== today || hours.needsRefresh())) void hours.refresh();
    else scheduleHours();
  }, Math.min(wait, 2_147_483_647));
}

function requestHours() {
  void hours.refresh().then((result) => {
    if (result === null) {
      awaitingHours = false;
      paintHours();
      scheduleHours();
    }
  });
}

async function loadPlaces() {
  if (!placesRoot) return;
  placesLoaded = false;
  places = [];
  placesRoot.innerHTML = renderFoodPlaceStatus(LANG, 'loading');
  try {
    const response = await fetch(foodDataUrl, { cache: 'no-cache' });
    if (!response.ok) throw new Error('Food places unavailable');
    const payload = await response.json();
    const next = Array.isArray(payload?.places) ? payload.places : [];
    if (!foodPlacesReady(next)) throw new Error('Food places incomplete');
    places = next.slice().sort((a, b) => a.order - b.order);
    awaitingHours = places.some((place) => place.services.some((service) => service.coopScheduleName));
    placesLoaded = true;
    placesRoot.innerHTML = renderFoodPlaceList(places, hourOptions());
    bindMarkFallback();
    if (placesNeedCoop()) requestHours();
    else scheduleHours();
  } catch {
    places = [];
    placesLoaded = false;
    awaitingHours = false;
    placesRoot.innerHTML = renderFoodPlaceStatus(LANG, 'error');
  }
}

placesRoot?.addEventListener('click', (event) => {
  if (event.target.closest('[data-food-places-retry]')) void loadPlaces();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (placesNeedStatus()) paintHours();
  if (!placesNeedCoop()) {
    scheduleHours();
    return;
  }
  paintHours();
  requestHours();
});

if (placesRoot) void loadPlaces();
