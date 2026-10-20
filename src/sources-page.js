// /sources と /en/sources の出典の一覧を、データから組み立てる。
// - 「食事場所」: public/food-places.json（店舗を足したり出典を更新したりすれば、ここにも反映される）
// - 「時刻表」: public/timetable/data/manifest.json の sourceNotes・sourceReferences・holidayCalendar
// 表示言語は <html lang> から判定する(legal-page.js と同じ方針)。

import { foodDataUrl } from 'virtual:rits-oic-food-data';

const root = document.querySelector('[data-sources-food]');
const timetableRoot = document.querySelector('[data-sources-timetable]');
const TIMETABLE_MANIFEST_URL = '/timetable/data/manifest.json';
const LANG = (document.documentElement.lang || '').toLowerCase().startsWith('en') ? 'en' : 'ja';

const TEXT = {
  ja: { checked: '確認日', error: '出典を読み込めませんでした。', holidays: '祝日', empty: '出典はまだありません。' },
  en: { checked: 'Checked', error: 'Could not load the sources.', holidays: 'Holidays', empty: 'No sources are available yet.' },
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
    if (!Array.isArray(payload?.places)) throw new Error('Invalid food places');
    root.innerHTML = render(payload.places) || `<p class="meta-text">${escapeHtml(t.empty)}</p>`;
  } catch {
    root.innerHTML = `<p class="meta-text">${escapeHtml(t.error)}</p>`;
  } finally {
    root.setAttribute('aria-busy', 'false');
  }
}

// 時刻表データの出典。注記の文言は日本語だけなので、英語版には出典のリンクだけを出す
// （英語版の注記は、ページの本文に英語で書いてある）。
const GROUP_TITLES_EN = {
  '時刻表データ取得元': 'Timetable data sources',
  '運行情報確認先': 'Service status pages',
  '利用条件・注記の根拠': 'Pages that state the terms and notes',
};

function renderTimetable(manifest) {
  const notes = LANG === 'ja' ? (manifest.sourceNotes || []).map((note) => `<li>${escapeHtml(note)}</li>`).join('') : '';
  const groups = (manifest.sourceReferences || []).slice();
  const holiday = manifest.holidayCalendar;
  if (holiday?.sourceUrl) {
    groups.push({ labelJa: t.holidays, items: [{ labelJa: holiday.sourceNameJa, url: holiday.sourceUrl }] });
  }
  const groupsHtml = groups
    .map((group) => {
      const title = LANG === 'en' ? GROUP_TITLES_EN[group.labelJa] || group.labelJa : group.labelJa;
      const items = (group.items || [])
        .filter((item) => isHttpUrl(item.url))
        .map(
          (item) =>
            `<li><a class="external" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.labelJa)}</a></li>`,
        )
        .join('');
      return `<section class="sources-place"><h3 class="sources-place-name">${escapeHtml(title)}</h3><ul>${items}</ul></section>`;
    })
    .join('');
  return `${notes ? `<ul class="sources-notes">${notes}</ul>` : ''}${groupsHtml}`;
}

async function loadTimetable() {
  if (!timetableRoot) return;
  try {
    const response = await fetch(TIMETABLE_MANIFEST_URL, { cache: 'no-cache' });
    if (!response.ok) throw new Error('Timetable manifest unavailable');
    timetableRoot.innerHTML = renderTimetable(await response.json()) || `<p class="meta-text">${escapeHtml(t.empty)}</p>`;
  } catch {
    timetableRoot.innerHTML = `<p class="meta-text">${escapeHtml(t.error)}</p>`;
  } finally {
    timetableRoot.setAttribute('aria-busy', 'false');
  }
}

void load();
void loadTimetable();
