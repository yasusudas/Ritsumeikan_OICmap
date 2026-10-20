import { describeFoodServiceHours, isHttpUrl, judgeFoodServiceStatus } from './food-guide-model.js';

const USAGE_KEYS = ['eatIn', 'takeaway', 'outsideFood', 'publicAccess'];

export const FOOD_PAGE_COPY = {
  ja: {
    'food.hours': '営業時間',
    'food.usage': '利用案内',
    'food.link.menu': 'メニュー',
    'food.link.hours': '営業時間を確認',
    'food.link.official': '公式サイト',
    'food.link.order': 'モバイルオーダー',
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
    'food.link.order': 'Mobile order',
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

// The open/closed label: 'within', 'outside' or 'unknown'. Shared by the map card, the store list,
// the hover summary and the OIC Food page.
export function renderFoodStateLabel(state, translate) {
  if (state === 'loading')
    return `<span class="food-open-state is-loading" role="status" aria-label="${escapeHtml(translate('food.hoursLoading'))}"><span aria-hidden="true">—</span></span>`;
  return `<span class="food-open-state is-${state}">${escapeHtml(translate(`food.status.${state}`))}</span>`;
}

export function renderFoodStatus(service, { translate, now, fetchFailed = false, payload = null, loading = false } = {}) {
  const judgment = judgeFoodServiceStatus(service, { now, fetchFailed, payload, loading });
  if (judgment.state === 'disabled') return '';
  const label = renderFoodStateLabel(judgment.state, translate);
  return `<p class="food-status${judgment.state === 'unknown' ? ' is-unknown' : ''}">${label}</p>`;
}

// A place with one service shows its label above the 営業時間 heading. With several services,
// each label stays under its service name inside the hours.
export function renderFoodLeadStatus(place, { translate, now, payload = null, fetchFailed = false, loading = false } = {}) {
  if (place.services.length !== 1) return '';
  const [service] = place.services;
  return renderFoodStatus(service, {
    translate,
    now,
    payload,
    loading,
    fetchFailed: Boolean(service.coopScheduleName && fetchFailed),
  });
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

// A truck photo is shown only from this site's own path (/lunch-street/…) or an http(s) URL.
export function safeFoodTruckImage(value) {
  const text = String(value ?? '');
  if (/^\/(?!\/)[\w./-]+$/.test(text)) return text;
  return isHttpUrl(text) ? text : '';
}

// Today's trucks for one spot as a grid of photos, two to a row. The grid keeps a fixed 4:3 frame per
// photo (food-guide.css), so rows never shift while the lazy images load. The name is the alt text;
// a truck without a usable photo gets a tile with its name (the viewer does the same when a photo
// fails to load). Returns '' when there is nothing to show.
export function renderFoodTruckPhotos(trucks) {
  const items = (Array.isArray(trucks) ? trucks : []).filter((truck) => truck?.name);
  if (!items.length) return '';
  const tiles = items.map((truck) => {
    const name = escapeHtml(truck.name);
    const image = safeFoodTruckImage(truck.image);
    return image
      ? `<li class="food-truck-photo"><img src="${escapeHtml(image)}" alt="${name}" loading="lazy" decoding="async" draggable="false" /></li>`
      : `<li class="food-truck-photo is-fallback"><span>${name}</span></li>`;
  });
  return `<ul class="food-truck-photos">${tiles.join('')}</ul>`;
}

export function renderFoodHours(place, { lang, payload = null, loading = false, fetchFailed = false, now = new Date() } = {}) {
  loading = loading && !fetchFailed;
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
      const status =
        place.services.length > 1
          ? renderFoodStatus(service, {
              translate,
              now,
              payload,
              loading,
              fetchFailed: Boolean(service.coopScheduleName && fetchFailed),
            })
          : '';
      // With several services, each label comes right under its service name.
      if (block.kind === 'loading') return `${heading}${status}${renderFoodHoursLoading(block.label)}`;
      if (block.kind === 'message') return `${heading}${status}<p>${escapeHtml(block.text)}</p>`;
      if (block.kind === 'coop') {
        return `${heading}${status}<p>${escapeHtml(block.dateLabel)}\n${escapeHtml(block.text)}</p>`;
      }
      return (
        heading +
        status +
        block.versions
          .map(
            (version) =>
              `${version.title ? `<h5 class="food-version-title">${escapeHtml(version.title)}</h5>` : ''}<p>${escapeHtml(block.dateLabel ? `${block.dateLabel}\n${version.text}` : version.text)}</p>`,
          )
          .join('')
      );
    })
    .join('');
}

// Keep one action per destination, including the source of the co-op hours.
export function renderFoodLinkButtons(place, { translate, className, lang = 'ja', payload = null, now = new Date() }) {
  const coop = place.services.filter((service) => service.coopScheduleName);
  const calendars = coop.map((service) => describeFoodServiceHours(service, {
    text: (value) => localText(value, lang), translate, lang, payload, now,
  })).filter((block) => block.kind === 'coop' && isHttpUrl(block.sourceUrl));
  const actions = ['order', 'menu', 'official'].map((key) => ({ key, url: place.links[key], label: translate(`food.link.${key}`) }));
  if (calendars.length) {
    actions.push(...calendars.map((block) => ({ url: block.sourceUrl, label: translate('food.coopSource') })));
  } else {
    actions.push({ url: place.links.hours, label: translate(coop.length ? 'food.coopSource' : 'food.link.hours') });
  }
  const seen = new Set();
  return actions
    .filter(({ url }) => url && !seen.has(url) && seen.add(url))
    .map(({ key, url, label }) => {
      return `<a class="${className}${key === 'order' ? ' food-order-link' : ''}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(`${label} ${translate('food.external')}`)}">${escapeHtml(label)}</a>`;
    })
    .join('');
}

function renderCard(place, options) {
  const { lang } = options;
  const name = localText(place.name, lang);
  const translate = (key) => foodPageText(lang, key);
  const linkButtons = renderFoodLinkButtons(place, { ...options, translate, className: 'food-place-link btn external' });
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
      <div class="food-lead-status" data-food-lead-status="${escapeHtml(place.entryId)}">${renderFoodLeadStatus(place, { ...options, translate })}</div>
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
  </article>`;
}

export function renderFoodPlaceList(places, options) {
  if (!foodPlacesReady(places)) return '';
  const ordered = places.slice().sort((a, b) => a.order - b.order);
  // The lunch-street spots have short cards; on two columns two of them stack in one cell (pages.css).
  return `<ul class="food-place-grid">${ordered
    .map((place) => `<li${place.todayTrucks ? ' class="is-compact"' : ''}>${renderCard(place, options)}</li>`)
    .join('')}</ul>`;
}

// Two lines reserve the date and hours while the calendar is pending. Dashes are
// visual placeholders; the loading explanation remains available to screen readers.
export function renderFoodHoursLoading(label) {
  return `<p class="food-hours-pending" role="status" aria-label="${escapeHtml(label)}"><span aria-hidden="true">—<br>—</span></p>`;
}

export function renderFoodPlaceSkeleton(label, { compact = false } = {}) {
  const bar = '<span class="loading-skeleton"></span>';
  const item = compact
    ? `<li class="food-loading-row"><span class="food-loading-mark loading-skeleton"></span><span class="food-loading-lines">${bar}${bar}</span></li>`
    : `<li><div class="food-place food-place-skeleton"><div class="food-loading-brand"><span class="food-loading-mark loading-skeleton"></span><span class="food-loading-lines">${bar}${bar}</span></div>${bar}${bar}<span class="food-loading-dash">—</span>${bar}${bar}</div></li>`;
  return `<div class="food-loading-state" role="status" aria-label="${escapeHtml(label)}"><ul class="${compact ? 'food-loading-rows' : 'food-place-grid'}" aria-hidden="true">${item.repeat(compact ? 3 : 2)}</ul></div>`;
}

export function renderFoodTruckSkeleton(label, { compact = false } = {}) {
  const item = compact
    ? '<li class="food-truck-photo loading-skeleton"></li>'
    : '<li class="food-truck"><div class="food-truck-thumb loading-skeleton"></div><span class="loading-skeleton"></span><span class="food-loading-dash">—</span></li>';
  return `<div class="food-loading-state" role="status" aria-label="${escapeHtml(label)}"><ul class="${compact ? 'food-truck-photos' : 'food-trucks'}" aria-hidden="true">${item.repeat(2)}</ul></div>`;
}

export function renderFoodPlaceStatus(lang, kind) {
  if (kind === 'loading') return renderFoodPlaceSkeleton(foodPageText(lang, 'food.loading'));
  const key = kind === 'error' ? 'food.loadError' : 'food.loading';
  const retry =
    kind === 'error'
      ? `<button class="btn food-place-retry" type="button" data-food-places-retry>${escapeHtml(foodPageText(lang, 'food.retry'))}</button>`
      : '';
  return `<div class="food-state${kind === 'error' ? ' is-error' : ''}"><p>${escapeHtml(foodPageText(lang, key))}</p>${retry}</div>`;
}
