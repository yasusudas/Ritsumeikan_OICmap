import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const config = readFileSync(new URL('vite.config.js', root), 'utf8');
const files = [...config.matchAll(/resolve\(__dirname, '([^']*index\.html)'\)/g)].map(([, file]) => file);
files.push('public/legacy-moved.html');
const attr = (tag, key) => tag.match(new RegExp(`\\b${key}="([^"]*)"`))?.[1] ?? null;
function coveredBy(tag, file) {
  const id = attr(tag, 'id');
  if (/\bdata-dialog|\bdata-legal-lang-toggle|site-menu-toggle/.test(tag) || ['about-menu-button', 'contact-form-menu-button', 'about-dialog-close', 'contact-form-dialog-close'].includes(id)) return 'pages.spec.js: PAGES';
  if (/\bdata-lang-toggle/.test(tag)) return file.startsWith('editor/') ? 'editor.spec.js: EDITOR language' : 'pages.spec.js: PAGES language';
  if (/\bdata-floor|\bdata-mobile-floor-toggle|\bdata-facility-key/.test(tag)) return file.startsWith('editor/') ? 'editor.spec.js: EDITOR controls/rings' : 'search.spec.js: MAP';
  if (id === 'search-input' || id === 'search-clear') return 'search.spec.js: SEARCH';
  if (id === 'facility-more-toggle') return 'search.spec.js: MAP';
  if (/\bdata-ring-color-variant/.test(tag)) return 'editor.spec.js: EDITOR rings';
  if (['editor-label', 'editor-save', 'editor-clear-point', 'editor-copy', 'editor-export', 'editor-import', 'editor-publish', 'editor-import-input', 'editor-json'].includes(id)) return 'editor.spec.js: EDITOR JSON and entry actions';
  if (['editor-area-entry', 'editor-area-new', 'editor-area-save', 'editor-area-undo', 'editor-area-cancel'].includes(id)) return 'editor.spec.js: EDITOR polygons';
  if (['editor-logout-button', 'editor-login-password', 'editor-login-submit'].includes(id)) return 'editor.spec.js: EDITOR login/logout';
  if (/\bmobile-quick-action/.test(tag)) return 'editor.spec.js: EDITOR controls (currently CSS-hidden placeholders)';
  if (/\bdata-reset-layout|\bdata-show-all|value="(?:cancel|hide)"/.test(tag)) return 'timetable.spec.js: TIMETABLE';
  throw Error(`Unmapped control in ${file}: ${tag}. Add its behavior test and inventory mapping.`);
}
const pages = files.map(file => {
  const html = readFileSync(new URL(file, root), 'utf8');
  return {
    route: `/${file.replace(/^public\//, '').replace(/index\.html$/, '')}`,
    source: file,
    controls: [...html.matchAll(/<(button|input|select|textarea|summary)\b[^>]*>/g)].map(([tag, type]) => ({
      type, id: attr(tag, 'id'), class: attr(tag, 'class'), label: attr(tag, 'aria-label'),
      testedBy: coveredBy(tag, file),
      attributes: [...tag.matchAll(/\b(data-[\w-]+)(?:="([^"]*)")?/g)].map(([, key, value]) => [key, value ?? '']),
    })),
    links: [...html.matchAll(/<a\b[^>]*>/g)].map(([tag]) => ({ href: attr(tag, 'href'), target: attr(tag, 'target') })),
  };
});
const search = JSON.parse(readFileSync(new URL('public/manual-search-index.json', root)));
const food = JSON.parse(readFileSync(new URL('public/food-places.json', root)));
const timetable = JSON.parse(readFileSync(new URL('public/timetable/data/manifest.json', root)));
const inventory = {
  note: 'Static controls plus data-generated targets. Behavioral expectations and test mapping: docs/site-test-matrix.md. This inventory alone is not a passing behavior test.',
  counts: { pages: pages.length, searchEntries: search.entries.length, aliases: search.entries.reduce((n, e) => n + (e.aliases?.length || 0), 0), facilityRings: search.facilityRings.length, foodPlaces: food.places.length, timetableCards: timetable.cards.length },
  pages,
  searchEntries: search.entries.map(({ id, label, labelEn, floorId, aliases }) => ({ id, label, labelEn, floorId, aliases })),
  foodPlaces: food.places.map(({ entryId, name, areaEntryId, areaPolygon, links }) => ({ entryId, name, areaEntryId, areaPolygon, links })),
  timetableCards: timetable.cards.map(({ id, calendars }) => ({ id, calendars })),
};
if (process.argv.includes('--json')) console.log(JSON.stringify(inventory, null, 2));
else {
  console.table(pages.map(page => ({ route: page.route, controls: page.controls.length, links: page.links.length })));
  console.log(inventory.counts);
  console.log('Detailed inventory: npm run --silent test:inventory -- --json');
}
