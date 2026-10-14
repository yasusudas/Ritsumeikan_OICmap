import { describeFoodServiceHours, isHttpUrl } from './food-guide-model.js';

const USAGE_KEYS = ['eatIn', 'takeaway', 'outsideFood', 'publicAccess'];
const LINK_KEYS = ['menu', 'hours', 'official'];

export const FOOD_PAGE_COPY = {
  ja: {
    'food.hours': '営業時間',
    'food.usage': '利用案内',
    'food.link.menu': 'メニュー',
    'food.link.hours': '営業時間を確認',
    'food.link.official': '公式サイト',
    'food.external': '（新しいタブで開く）',
    'food.markNotice': '目印は本サイト作成。公式ロゴではありません。',
    'food.hoursLoading': '営業時間を確認中…',
    'food.hoursUnknown': '公式の営業時間をご確認ください。',
    'food.closedDay': '休業',
    'food.allDay': '24時間',
    'food.coopSource': '生協の営業カレンダー',
    'food.temporary': '臨時',
    'food.regular': '通常',
    'food.usage.eatIn': '店内飲食',
    'food.usage.takeaway': '持ち帰り',
    'food.usage.outsideFood': '購入品以外の持ち込み',
    'food.usage.publicAccess': '一般の方の利用',
    'food.value.yes': '可',
    'food.value.no': '制限あり',
    'food.value.unknown': '公式情報をご確認ください',
    'food.period.弁当・ドリンク販売': '弁当・ドリンク販売',
    'food.period.クレープ・ドリンク販売': 'クレープ・ドリンク販売',
    'food.viewOnMap': '地図で見る',
    'food.loading': '食事場所を読み込んでいます…',
    'food.loadError': '食事場所を読み込めませんでした。',
    'food.retry': '再読み込み',
  },
  en: {
    'food.hours': 'Hours',
    'food.usage': 'Visitor information',
    'food.link.menu': 'Menu',
    'food.link.hours': 'Check hours',
    'food.link.official': 'Official website',
    'food.external': '(opens in a new tab)',
    'food.markNotice': 'Marks created for this site; these are not official logos.',
    'food.hoursLoading': 'Checking hours…',
    'food.hoursUnknown': 'Please check the official hours.',
    'food.closedDay': 'Closed',
    'food.allDay': '24 hours',
    'food.coopSource': 'Co-op calendar',
    'food.temporary': 'Temporary',
    'food.regular': 'Regular',
    'food.usage.eatIn': 'Eat in',
    'food.usage.takeaway': 'Takeaway',
    'food.usage.outsideFood': 'Bring outside food',
    'food.usage.publicAccess': 'Public access',
    'food.value.yes': 'Yes',
    'food.value.no': 'Restricted',
    'food.value.unknown': 'Check official information',
    'food.period.弁当・ドリンク販売': 'Bento & drinks',
    'food.period.クレープ・ドリンク販売': 'Crepes & drinks',
    'food.viewOnMap': 'View on map',
    'food.loading': 'Loading food places…',
    'food.loadError': 'Food places could not be loaded.',
    'food.retry': 'Try again',
  },
};

const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );

export function foodPageText(lang, key) {
  return FOOD_PAGE_COPY[lang === 'en' ? 'en' : 'ja'][key] ?? FOOD_PAGE_COPY.ja[key] ?? key;
}

export function foodMapPath(mapHash, lang) {
  const page = lang === 'en' ? '/en/' : '/';
  return `${page}#${encodeURIComponent(mapHash)}`;
}

export function foodPlacesReady(places) {
  if (!Array.isArray(places) || places.length !== 8) return false;
  const orders = new Set();
  return places.every((place) => {
    if (!place?.entryId || typeof place.mapHash !== 'string' || !place.mapHash) return false;
    if (!Number.isInteger(place.order) || place.order < 1 || place.order > 8 || orders.has(place.order))
      return false;
    orders.add(place.order);
    if (!place.name?.ja || !place.name?.en || !place.building?.ja || !place.summary?.ja) return false;
    if (!place.mark?.src || !place.mark?.fallbackSrc || !place.services?.length || !place.sources?.length)
      return false;
    return Boolean(place.links);
  });
}

function localText(value, lang) {
  return value?.[lang] || value?.ja || '';
}

export function renderFoodHours(place, { lang, payload = null, loading = false, now = new Date() } = {}) {
  const translate = (key) => foodPageText(lang, key);
  return place.services
    .map((service) => {
      const heading =
        place.services.length > 1 ? `<h5>${escapeHtml(localText(service.name, lang))}</h5>` : '';
      const block = describeFoodServiceHours(service, {
        text: (value) => localText(value, lang),
        translate,
        lang,
        payload,
        loading,
        now,
      });
      if (block.kind === 'message') return `${heading}<p>${escapeHtml(block.text)}</p>`;
      if (block.kind === 'coop') {
        const source = isHttpUrl(block.sourceUrl)
          ? `<a class="food-place-source external" href="${escapeHtml(block.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(translate('food.coopSource'))}</a>`
          : '';
        return `${heading}<p>${escapeHtml(block.dateLabel)} ${escapeHtml(block.text)}</p>${source}`;
      }
      return (
        heading +
        block.versions
          .map(
            (version) =>
              `${version.title ? `<h5>${escapeHtml(version.title)}</h5>` : ''}<p>${escapeHtml(version.text)}</p>`,
          )
          .join('')
      );
    })
    .join('');
}

function renderLinks(place, lang) {
  const seen = new Set();
  return LINK_KEYS.filter(
    (key) => place.links[key] && !seen.has(place.links[key]) && seen.add(place.links[key]),
  )
    .map((key) => {
      const label = foodPageText(lang, `food.link.${key}`);
      return `<a class="food-place-link external" href="${escapeHtml(place.links[key])}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(`${label} ${foodPageText(lang, 'food.external')}`)}">${escapeHtml(label)}</a>`;
    })
    .join('');
}

function renderUsage(place, lang) {
  return place.services
    .map((service) => {
      const heading =
        place.services.length > 1 ? `<h5>${escapeHtml(localText(service.name, lang))}</h5>` : '';
      const rows = USAGE_KEYS.map((key) => {
        const note = service.usageNotes?.[key];
        const noteText = note ? localText(note, lang) : '';
        return `<div><dt>${escapeHtml(foodPageText(lang, `food.usage.${key}`))}</dt><dd>${escapeHtml(foodPageText(lang, `food.value.${service.usage[key]}`))}${noteText ? `<span>${escapeHtml(noteText)}</span>` : ''}</dd></div>`;
      }).join('');
      return `${heading}<dl class="food-place-usage">${rows}</dl>`;
    })
    .join('');
}

function renderCard(place, options) {
  const { lang } = options;
  const name = localText(place.name, lang);
  const links = renderLinks(place, lang);
  return `<article class="food-place" data-food-place="${escapeHtml(place.entryId)}">
    <header class="food-place-brand">
      <span class="food-place-mark"><img src="${escapeHtml(place.mark.src)}" alt="" width="40" height="40" decoding="async" data-food-fallback="${escapeHtml(place.mark.fallbackSrc)}" /></span>
      <div>
        <h3>${escapeHtml(name)}</h3>
        <p class="food-place-meta">${escapeHtml(localText(place.building, lang))} · 1F</p>
      </div>
    </header>
    <p class="food-place-summary">${escapeHtml(localText(place.summary, lang))}</p>
    <section class="food-place-block">
      <h4>${escapeHtml(foodPageText(lang, 'food.hours'))}</h4>
      <div class="food-place-hours" data-food-hours="${escapeHtml(place.entryId)}">${renderFoodHours(place, options)}</div>
    </section>
    <section class="food-place-block">
      <h4>${escapeHtml(foodPageText(lang, 'food.usage'))}</h4>
      ${renderUsage(place, lang)}
    </section>
    ${links ? `<div class="food-place-links">${links}</div>` : ''}
    <a class="btn btn-primary food-place-map" href="${escapeHtml(foodMapPath(place.mapHash, lang))}">${escapeHtml(foodPageText(lang, 'food.viewOnMap'))}</a>
    <div class="food-place-sources">
      ${place.sources
        .map(
          (source) =>
            `<p><a class="text-link external" href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.title)}</a> · ${escapeHtml(source.checkedAt)}</p>`,
        )
        .join('')}
      <p>${escapeHtml(foodPageText(lang, 'food.markNotice'))}</p>
    </div>
  </article>`;
}

export function renderFoodPlaceList(places, options) {
  if (!foodPlacesReady(places)) return '';
  const ordered = places.slice().sort((a, b) => a.order - b.order);
  return `<ul class="food-place-grid">${ordered.map((place) => `<li>${renderCard(place, options)}</li>`).join('')}</ul>`;
}

export function renderFoodPlaceStatus(lang, kind) {
  const key = kind === 'error' ? 'food.loadError' : 'food.loading';
  const retry =
    kind === 'error'
      ? `<button class="btn food-place-retry" type="button" data-food-places-retry>${escapeHtml(foodPageText(lang, 'food.retry'))}</button>`
      : '';
  return `<div class="food-state${kind === 'error' ? ' is-error' : ''}"><p>${escapeHtml(foodPageText(lang, key))}</p>${retry}</div>`;
}
