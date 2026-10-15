import { describeFoodServiceHours, isHttpUrl, judgeFoodServiceStatus } from './food-guide-model.js';

const USAGE_KEYS = ['eatIn', 'takeaway', 'outsideFood', 'publicAccess'];

export const FOOD_PAGE_COPY = {
  ja: {
    'food.hours': '営業時間',
    'food.usage': '利用案内',
    'food.link.menu': 'メニュー',
    'food.link.hours': '営業時間を確認',
    'food.link.official': '公式サイト',
    'food.external': '（新しいタブで開く）',
    'food.hoursLoading': '営業時間を確認中…',
    'food.hoursUnknown': '公式の営業時間をご確認ください。',
    'food.status.within': '営業時間内',
    'food.status.outside': '営業時間外',
    'food.status.unknown': '営業状況を確認できません',
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
    'food.value.no': '不可',
    'food.value.unknown': '未確認',
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
    'food.hoursLoading': 'Checking hours…',
    'food.hoursUnknown': 'Please check the official hours.',
    'food.status.within': 'Within opening hours',
    'food.status.outside': 'Outside opening hours',
    'food.status.unknown': 'Opening status unavailable',
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
    'food.value.no': 'Not available',
    'food.value.unknown': 'Unconfirmed',
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
  if (!Array.isArray(places) || !places.length) return false;
  const orders = new Set();
  return places.every((place) => {
    if (!place?.entryId || typeof place.mapHash !== 'string' || !place.mapHash) return false;
    if (!Number.isInteger(place.order) || place.order < 1 || place.order > places.length || orders.has(place.order))
      return false;
    orders.add(place.order);
    if (!place.name?.ja || !place.name?.en || !place.building?.ja || !place.summary?.ja) return false;
    if (!place.mark?.src || !place.mark?.fallbackSrc || !place.services?.length || !place.sources?.length)
      return false;
    return Boolean(place.links);
  });
}

export function renderFoodStatus(service, { translate, now, fetchFailed = false, payload = null } = {}) {
  const judgment = judgeFoodServiceStatus(service, { now, fetchFailed, payload });
  if (judgment.state === 'disabled') return '';
  const label = escapeHtml(translate(`food.status.${judgment.state}`));
  if (judgment.state === 'unknown') return `<p class="food-status is-unknown">${label}</p>`;
  const chip = `<span class="food-chip${judgment.state === 'within' ? ' is-accent' : ''}">${label}</span>`;
  return `<p class="food-status">${chip}</p>`;
}

// A service whose four answers are all 'na' has no visitor information to show.
export function hasFoodUsage(place) {
  return place.services.some((service) => USAGE_KEYS.some((key) => service.usage[key] !== 'na'));
}

// Visitor information in one white block. Services with identical answers
// (for example the cafeteria and the café inside it) are shown once.
export function renderFoodUsage(place, { translate, text, headingTag = 'h5' }) {
  const answers = (service) =>
    JSON.stringify(USAGE_KEYS.map((key) => [service.usage[key], text(service.usageNotes?.[key])]));
  const shared = place.services.every((service) => answers(service) === answers(place.services[0]));
  return (shared ? place.services.slice(0, 1) : place.services)
    .filter((service) => USAGE_KEYS.some((key) => service.usage[key] !== 'na'))
    .map((service) => {
      const heading = shared
        ? ''
        : `<${headingTag} class="food-service-name">${escapeHtml(text(service.name))}</${headingTag}>`;
      const rows = USAGE_KEYS.map((key) => {
        const note = service.usageNotes?.[key] ? text(service.usageNotes[key]) : '';
        return `<div><dt>${escapeHtml(translate(`food.usage.${key}`))}</dt><dd>${escapeHtml(translate(`food.value.${service.usage[key]}`))}${note ? `<span>${escapeHtml(note)}</span>` : ''}</dd></div>`;
      }).join('');
      return `${heading}<dl class="food-usage-grid">${rows}</dl>`;
    })
    .join('');
}

function localText(value, lang) {
  return value?.[lang] || value?.ja || '';
}

export function renderFoodHours(place, { lang, payload = null, loading = false, fetchFailed = false, now = new Date() } = {}) {
  const translate = (key) => foodPageText(lang, key);
  return place.services
    .map((service) => {
      const heading =
        place.services.length > 1
          ? `<h5 class="food-service-name">${escapeHtml(localText(service.name, lang))}</h5>`
          : '';
      const block = describeFoodServiceHours(service, {
        text: (value) => localText(value, lang),
        translate,
        lang,
        payload,
        loading,
        now,
      });
      const status = renderFoodStatus(service, {
        translate,
        now,
        payload,
        fetchFailed: Boolean(service.coopScheduleName && fetchFailed),
      });
      if (block.kind === 'message') return `${heading}<p>${escapeHtml(block.text)}</p>${status}`;
      if (block.kind === 'coop') {
        const source = isHttpUrl(block.sourceUrl)
          ? `<a class="food-source-link external" href="${escapeHtml(block.sourceUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(`${translate('food.coopSource')} ${translate('food.external')}`)}">${escapeHtml(translate('food.coopSource'))}</a>`
          : '';
        return `${heading}<p>${escapeHtml(block.dateLabel)}\n${escapeHtml(block.text)}</p>${status}${source}`;
      }
      return (
        heading +
        block.versions
          .map(
            (version) =>
              `${version.title ? `<h5 class="food-version-title">${escapeHtml(version.title)}</h5>` : ''}<p>${escapeHtml(version.text)}</p>`,
          )
          .join('') + status
      );
    })
    .join('');
}

// Menu and official site stay buttons (one per distinct URL); the hours link is a
// plain text row in the source list, so it is always shown.
export function renderFoodLinkButtons(place, { translate, className }) {
  const seen = new Set();
  return ['menu', 'official']
    .filter((key) => place.links[key] && !seen.has(place.links[key]) && seen.add(place.links[key]))
    .map((key) => {
      const label = translate(`food.link.${key}`);
      return `<a class="${className}" href="${escapeHtml(place.links[key])}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(`${label} ${translate('food.external')}`)}">${escapeHtml(label)}</a>`;
    })
    .join('');
}

export function renderFoodLinkRows(place, { translate }) {
  if (!place.links.hours) return '';
  const label = translate('food.link.hours');
  return `<p><a class="food-source-link external" href="${escapeHtml(place.links.hours)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(`${label} ${translate('food.external')}`)}">${escapeHtml(label)}</a></p>`;
}

function renderCard(place, options) {
  const { lang } = options;
  const name = localText(place.name, lang);
  const translate = (key) => foodPageText(lang, key);
  const linkButtons = renderFoodLinkButtons(place, { translate, className: 'food-place-link btn external' });
  const linkRows = renderFoodLinkRows(place, { translate });
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
      <h4 class="food-heading">${escapeHtml(foodPageText(lang, 'food.hours'))}</h4>
      <div class="food-place-hours food-hours-list" data-food-hours="${escapeHtml(place.entryId)}">${renderFoodHours(place, options)}</div>
    </section>
    ${
      hasFoodUsage(place)
        ? `<section class="food-place-block">
      <h4 class="food-heading">${escapeHtml(foodPageText(lang, 'food.usage'))}</h4>
      ${renderFoodUsage(place, { translate: (key) => foodPageText(lang, key), text: (value) => localText(value, lang) })}
    </section>`
        : ''
    }
    <div class="food-place-actions">
      <a class="btn btn-primary food-place-map" href="${escapeHtml(foodMapPath(place.mapHash, lang))}">${escapeHtml(foodPageText(lang, 'food.viewOnMap'))}</a>
      ${linkButtons}
    </div>
    ${linkRows ? `<div class="food-sources">${linkRows}</div>` : ''}
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
