import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { describeFoodServiceHours, validateFoodPlaces } from '../src/food-guide-model.js';
import {
  FOOD_PAGE_COPY,
  foodMapPath,
  foodPlacesReady,
  renderFoodPlaceList,
  renderFoodPlaceStatus,
} from '../src/food-place-cards.js';
import { indexSearchRoutes, normalizeHashRouteId } from '../scripts/search-data-validation.mjs';

const payload = JSON.parse(readFileSync(new URL('../public/food-places.json', import.meta.url), 'utf8'));
const entries = JSON.parse(
  readFileSync(new URL('../public/manual-search-index.json', import.meta.url), 'utf8'),
).entries;
const i18n = readFileSync(new URL('../src/i18n.js', import.meta.url), 'utf8');
const pagesCss = readFileSync(new URL('../src/styles/pages.css', import.meta.url), 'utf8');
const now = new Date('2026-10-14T15:00:00Z');

function i18nValue(lang, key) {
  const block = lang === 'ja' ? i18n.slice(0, i18n.indexOf('\n  en: {')) : i18n.slice(i18n.indexOf('\n  en: {'));
  const match = block.match(new RegExp(`"${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}": "((?:\\\\.|[^"\\\\])*)"`));
  return match?.[1];
}

function linkedPlaces() {
  const routes = indexSearchRoutes(entries);
  return validateFoodPlaces(payload, entries).map((place) => ({
    ...place,
    mapHash: routes.hashById.get(place.entryId),
  }));
}

test('food page copy uses the same hours wording as the map', () => {
  for (const lang of ['ja', 'en']) {
    for (const [key, value] of Object.entries(FOOD_PAGE_COPY[lang])) {
      if (!i18n.includes(`"${key}"`)) continue;
      assert.equal(i18nValue(lang, key), value, `${lang} ${key}`);
    }
  }
});

test('map links are runtime search routes and stay on the same store in both languages', () => {
  const routes = indexSearchRoutes(entries);
  const places = linkedPlaces();
  assert.equal(foodPlacesReady(places.map(({ mapHash, ...place }) => place)), false);
  const byEnglish = entries.slice().sort((a, b) =>
    (a.labelEn || a.label).localeCompare(b.labelEn || b.label, 'en', { numeric: true, sensitivity: 'base' }),
  );
  const byJapanese = entries.slice().sort((a, b) =>
    a.label.localeCompare(b.label, 'ja', { numeric: true, sensitivity: 'base' }),
  );
  for (const place of places) {
    const entry = entries.find((item) => item.id === place.entryId);
    assert.equal(Object.hasOwn(entry, 'hashId'), false);
    assert.equal(routes.routes.get(place.mapHash)?.id, place.entryId);
    assert.equal(routes.routes.get(normalizeHashRouteId(place.entryId))?.id, place.entryId);
    assert.equal(indexSearchRoutes(byEnglish).hashById.get(place.entryId), place.mapHash);
    assert.equal(indexSearchRoutes(byJapanese).hashById.get(place.entryId), place.mapHash);
    assert.equal(foodMapPath(place.mapHash, 'ja'), `/#${encodeURIComponent(place.mapHash)}`);
    assert.equal(foodMapPath(place.mapHash, 'en'), `/en/#${encodeURIComponent(place.mapHash)}`);
  }
});

test('campus cards keep every comparison field and do not absorb the food-truck section', () => {
  const places = linkedPlaces();
  const html = renderFoodPlaceList(places, { lang: 'ja', now });
  assert.match(html, /class="food-place-grid"/);
  assert.doesNotMatch(html, /food-truck/);
  assert.equal(html.indexOf('GARDEN TERRACE LION') < html.indexOf('みなめんcafe'), true);
  assert.equal([...html.matchAll(/<h3>/g)].length, 11);
  // The two lunch-street spots are marked so that, on two columns, they stack in one cell.
  assert.equal([...html.matchAll(/<li class="is-compact">/g)].length, 2);
  // Three places have no visitor information (all answers 'na') and omit the usage section.
  for (const label of ['営業時間', '地図で見る']) {
    assert.equal([...html.matchAll(new RegExp(label, 'g'))].length >= 8, true, label);
  }
  for (const label of ['利用案内', '店内飲食', '持ち帰り', '購入品以外の持ち込み', '一般の方の利用']) {
    assert.equal([...html.matchAll(new RegExp(label, 'g'))].length >= 5, true, label);
  }
  // Sources and rights are listed on the sources page, not repeated on every card.
  assert.doesNotMatch(html, /aria-label="GARDEN TERRACE LION （新しいタブで開く）"/);
  assert.doesNotMatch(html, /立命館大学 OIC Food Map/);
  assert.equal([...html.matchAll(/class="btn btn-primary food-place-map"/g)].length, 11);
  assert.doesNotMatch(html, /food-place-map"[^>]*target=/);
  const seven = html.slice(html.indexOf('セブン-イレブン'), html.indexOf('みなめんcafe'));
  assert.equal([...seven.matchAll(/class="food-place-link /g)].length, 1);
  assert.match(seven, /class="food-place-link btn external"[^>]*>公式サイト<\/a>/);
  assert.match(html, /11:30–15:00/);
  assert.match(html, /臨時 \(2026-10-07〜2026-11-22\)/);
  assert.match(html, /公式の営業時間をご確認ください。/);
  const error = renderFoodPlaceStatus('ja', 'error');
  assert.match(error, /食事場所を読み込めませんでした/);
  assert.match(error, /data-food-places-retry/);
  assert.doesNotMatch(error, /キッチンカー/);
});

test('every store keeps unique destinations and one co-op calendar action in both languages', () => {
  const places = linkedPlaces();
  const calendarUrl = 'https://www.ritsco-op.jp/schedule/schedule_202610.html';
  const calendar = {
    nextUpdateAt: new Date(now.getTime() + 60_000).toISOString(),
    source: { url: 'https://www.ritsco-op.jp/schedule/index.html#s03' },
    months: [{ month: '2026-10', url: calendarUrl }],
    stores: places.flatMap((place) => place.services.filter((service) => service.coopScheduleName).map((service) => ({
      name: service.coopScheduleName,
      days: [{ date: '2026-10-15', closed: false, periods: [{ start: '10:30', end: '19:00' }] }],
    }))),
  };
  for (const lang of ['ja', 'en']) {
    for (const data of [calendar, null, { ...calendar, nextUpdateAt: now.toISOString() }]) {
      const html = renderFoodPlaceList(places, { lang, payload: data, now });
      const cards = [...html.matchAll(/<article\b[^]*?<\/article>/g)].map(([card]) => card);
      assert.equal(cards.length, places.length);
      cards.forEach((card, index) => {
        const hrefs = [...card.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((match) => match[1]);
        assert.equal(new Set(hrefs).size, hrefs.length, `${lang}: ${places[index].name.ja}`);
        if (places[index].services.some((service) => service.coopScheduleName)) {
          assert.equal(hrefs.includes(data === calendar ? calendarUrl : places[index].links.hours), true);
          const label = FOOD_PAGE_COPY[lang]['food.coopSource'];
          assert.equal(card.split(`>${label}</a>`).length - 1, 1);
          assert.doesNotMatch(card, /class="food-source-link external"/);
        }
      });
    }
  }
});

test('co-op failure hides only co-op hours, while registered hours stay visible', () => {
  const places = linkedPlaces();
  const cafeteria = places.find((place) => place.name.ja === 'OIC Cafeteria');
  const expired = describeFoodServiceHours(cafeteria.services[0], {
    text: (value) => value.ja,
    translate: (key) => FOOD_PAGE_COPY.ja[key],
    payload: {
      nextUpdateAt: new Date(now.getTime() - 1000).toISOString(),
      source: { url: 'https://www.ritsco-op.jp/schedule/index.html' },
      months: [],
      stores: [
        {
          name: 'OIC Cafeteria',
          days: [{ date: '2026-10-15', closed: false, periods: [{ start: '10:30', end: '19:00' }] }],
        },
      ],
    },
    now,
  });
  assert.equal(expired.kind, 'message');
  const fresh = describeFoodServiceHours(cafeteria.services[0], {
    text: (value) => value.ja,
    translate: (key) => FOOD_PAGE_COPY.ja[key],
    lang: 'ja',
    payload: {
      nextUpdateAt: new Date(now.getTime() + 60_000).toISOString(),
      source: { url: 'https://www.ritsco-op.jp/schedule/index.html' },
      months: [{ month: '2026-10', url: 'https://www.ritsco-op.jp/schedule/schedule_202610.html' }],
      stores: [
        {
          name: 'OIC Cafeteria',
          days: [
            {
              date: '2026-10-15',
              closed: false,
              periods: [{ label: '弁当・ドリンク販売', start: '11:30', end: '12:45' }],
            },
          ],
        },
      ],
    },
    now,
  });
  assert.equal(fresh.kind, 'coop');
  assert.match(fresh.text, /弁当・ドリンク販売 11:30–12:45/);
  assert.equal(fresh.sourceUrl, 'https://www.ritsco-op.jp/schedule/schedule_202610.html');
  const page = renderFoodPlaceList(places, { lang: 'en', payload: null, now });
  assert.match(page, /Please check the official hours\./);
  assert.match(page, /11:30–15:00/);
  assert.match(page, /View on map/);
  assert.match(page, /href="\/en\/#/);
});

test('the food pages place today’s trucks ahead of the campus stores and use two columns from 721px', () => {
  for (const file of ['../food/index.html', '../en/food/index.html']) {
    const html = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.equal(html.indexOf('data-food-trucks') < html.indexOf('data-food-places'), true, file);
  }
  assert.match(pagesCss, /@media \(min-width: 721px\)[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(pagesCss, /\.food-place[\s\S]{0,400}box-shadow/);
});

test('a service whose usage answers are all na has no usage section', async () => {
  const { hasFoodUsage } = await import('../src/food-place-cards.js');
  const na = { eatIn: 'na', takeaway: 'na', outsideFood: 'na', publicAccess: 'na' };
  assert.equal(hasFoodUsage({ services: [{ usage: na }] }), false);
  assert.equal(hasFoodUsage({ services: [{ usage: { ...na, eatIn: 'yes' } }] }), true);
});

test('the truck photo grid is two columns of fixed-ratio tiles, with the shop name as alt text', async () => {
  const { renderFoodTruckPhotos, safeFoodTruckImage } = await import('../src/food-place-cards.js');
  assert.equal(renderFoodTruckPhotos([]), '');
  assert.equal(renderFoodTruckPhotos(null), '');
  const trucks = [
    { name: 'ARAPSUN', image: '/lunch-street/arapsun.webp' },
    { name: 'A&B "kitchen"', image: '/lunch-street/arapsun.webp' },
    { name: 'No photo', image: '' },
    { name: 'Unsafe path', image: '//evil.example/x.webp' },
    { name: 'Script', image: 'javascript:alert(1)' },
  ];
  const html = renderFoodTruckPhotos(trucks);
  assert.equal((html.match(/<li /g) || []).length, 5);
  assert.match(html, /alt="ARAPSUN" loading="lazy" decoding="async"/);
  // The name is escaped in the alt text, and a photo that cannot be used becomes a name tile.
  assert.match(html, /alt="A&amp;B &quot;kitchen&quot;"/);
  assert.equal((html.match(/is-fallback/g) || []).length, 3);
  assert.doesNotMatch(html, /evil\.example|javascript:/);
  assert.equal(safeFoodTruckImage('https://example.com/a.webp'), 'https://example.com/a.webp');

  const css = readFileSync(new URL('../src/styles/food-guide.css', import.meta.url), 'utf8');
  assert.match(css, /\.food-truck-photos \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.food-truck-photo \{[^}]*aspect-ratio: 4 \/ 3/);
  // The phone's detail sheet keeps its buttons at the bottom edge; the short-screen sheet keeps them sticky.
  assert.match(css, /\.food-panel\.is-narrow:not\(\.is-compact\):not\(\.has-short-space\) \.food-panel-body:not\(:last-child\) \{[^}]*flex: 1 1 auto/);
  assert.match(css, /\.food-panel\.has-short-space \.food-panel-footer \{[^}]*position: sticky;[^}]*bottom: 0/);
});

test('the map card shows the photos under the names, and the photo letter after each name', () => {
  const viewer = readFileSync(new URL('../src/food-guide-viewer.js', import.meta.url), 'utf8');
  assert.match(viewer, /return names \+ renderFoodTruckPhotos\(here\);/);
  assert.match(viewer, /truck\.tag \? ` \(\$\{escape\(truck\.tag\)\}\)` : ''/);
});

test('the Lunch Street cards open at the summary height and have no details or back-to-summary button', () => {
  const viewer = readFileSync(new URL('../src/food-guide-viewer.js', import.meta.url), 'utf8');
  assert.match(viewer, /detailOnly\(id\) \{\s*return Boolean\(this\.getPlace\(id\)\?\.todayTrucks\);/);
  assert.match(viewer, /this\.panelMode = this\.narrow \? 'compact' : 'detail';/);
  assert.match(viewer, /!this\.shortScreen && !this\.detailOnly\(this\.selected\) \? `<button class="food-text-control" data-food-action="collapse"/);
  assert.match(viewer, /if \(this\.panelMode === 'compact' && truckCard\) footer = '';/);
  assert.match(viewer, /this\.detailOnly\(this\.selected\) \? 320 : this\.facilityHeight/);
});
