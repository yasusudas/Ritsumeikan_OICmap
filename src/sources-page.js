// /sources と /en/sources の「食事場所」の出典を、public/food-places.json から組み立てる。
// 食事案内のデータが唯一の元なので、店舗を足したり出典を更新したりすれば、ここにも反映される。
// 表示言語は <html lang> から判定する(legal-page.js と同じ方針)。

import { foodDataUrl } from 'virtual:rits-oic-food-data';

const root = document.querySelector('[data-sources-food]');
const LANG = (document.documentElement.lang || '').toLowerCase().startsWith('en') ? 'en' : 'ja';

const TEXT = {
  ja: { checked: '確認日', error: '出典を読み込めませんでした。' },
  en: { checked: 'Checked', error: 'Could not load the sources.' },
};
const t = TEXT[LANG];

const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function renderSource(source) {
  const title = escapeHtml(source.title);
  const name = isHttpUrl(source.url)
    ? `<a class="external" href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${title}</a>`
    : title;
  return `<li>${name}<span class="sources-meta">${t.checked}: ${escapeHtml(source.checkedAt)}</span></li>`;
}

function render(places) {
  const ordered = places.slice().sort((a, b) => a.order - b.order);
  // 2か所に分かれた同じ店（OICランチストリート）は、同じ出典なので1つにまとめる。
  const seen = new Set();
  const rows = [];
  for (const place of ordered) {
    const key = JSON.stringify([place.name?.ja, place.sources?.map((s) => [s.title, s.url])]);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(
      `<section class="sources-place"><h3 class="sources-place-name">${escapeHtml(place.name?.[LANG] || place.name?.ja)}</h3><ul>${(place.sources || []).map(renderSource).join('')}</ul></section>`,
    );
  }
  return rows.join('');
}

async function load() {
  if (!root) return;
  try {
    const response = await fetch(foodDataUrl, { cache: 'no-cache' });
    if (!response.ok) throw new Error('Food places unavailable');
    const payload = await response.json();
    const places = Array.isArray(payload?.places) ? payload.places : [];
    if (!places.length) throw new Error('No food places');
    root.innerHTML = render(places);
  } catch {
    root.innerHTML = `<p class="meta-text">${escapeHtml(t.error)}</p>`;
  }
}

void load();
