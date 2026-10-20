import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const vercel = JSON.parse(read('vercel.json'));
const vite = read('vite.config.js');

test('the sources page exists in both languages and is built, routed and listed in the sitemap', () => {
  for (const [file, lang, canonical] of [
    ['sources/index.html', 'ja', 'https://rits-oic-map.app/sources/'],
    ['en/sources/index.html', 'en', 'https://rits-oic-map.app/en/sources/'],
  ]) {
    const html = read(file);
    assert.match(html, new RegExp(`<html lang="${lang}">`));
    assert.match(html, new RegExp(`<link rel="canonical" href="${canonical}" />`));
    assert.match(html, /data-sources-food/);
    assert.match(html, /src="\/src\/sources-page\.js"/);
    assert.equal((html.match(/src="\/analytics-init\.js"/g) || []).length, 1);
    assert.match(vite, new RegExp(`'${file.replace(/[./]/g, '\\$&')}'`));
    assert.match(read('public/sitemap.xml'), new RegExp(`<loc>${canonical}</loc>`));
  }
  const legacy = new RegExp(vercel.routes[0].src);
  for (const path of ['/sources/', '/sources', '/en/sources/', '/en/sources'])
    assert.equal(legacy.test(path), true, path);
  for (const [from, to] of [['/sources', '/sources/'], ['/en/sources', '/en/sources/']]) {
    const route = vercel.routes.find((r) => new RegExp(r.src).test(from) && r.headers?.Location === to);
    assert.ok(route, `${from} redirects to ${to}`);
  }
});

test('every page footer links to the sources page in its own language', () => {
  const ja = ['index.html', 'access/index.html', 'food/index.html', 'timetable/index.html', 'terms/index.html', 'privacy/index.html', 'sources/index.html', 'editor/index.html'];
  const en = ['en/index.html', 'en/access/index.html', 'en/food/index.html', 'en/timetable/index.html', 'en/terms/index.html', 'en/privacy/index.html', 'en/sources/index.html'];
  for (const file of ja) assert.match(read(file), /href="\/sources\/"/, file);
  for (const file of en) assert.match(read(file), /href="\/en\/sources\/"/, file);
});

test('the terms link on the sources page still points at the terms page', () => {
  assert.match(read('sources/index.html'), /href="\/terms\/">利用規約<\/a>/);
  assert.match(read('en/sources/index.html'), /href="\/en\/terms\/">Terms<\/a>/);
});

test('sources keep independent loading states and clear skeletons on both success and failure', async () => {
  const nodes = Object.fromEntries(['food', 'timetable'].map(name => [name, {
    innerHTML: '<div class="sources-loading">placeholder</div>',
    attributes: { 'aria-busy': 'true' },
    setAttribute(name, value) { this.attributes[name] = value; },
  }]));
  const requests = new Map();
  const context = vm.createContext({
    URL, foodDataUrl: '/food.json',
    document: {
      documentElement: { lang: 'en' },
      querySelector: selector => nodes[selector.includes('timetable') ? 'timetable' : 'food'],
    },
    fetch: url => new Promise(resolve => requests.set(url, resolve)),
  });
  vm.runInContext(read('src/sources-page.js').replace(/^import .*;$/m, ''), context);
  assert.equal(requests.size, 2);
  assert.equal(nodes.food.attributes['aria-busy'], 'true');
  assert.equal(nodes.timetable.attributes['aria-busy'], 'true');
  requests.get('/food.json')({ ok: true, json: async () => ({
    places: [{ name: { ja: '店舗', en: 'Shop' }, order: 1, sources: [{ title: 'Official', url: 'https://example.org/', checkedAt: '2026-10-20' }] }],
  }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(nodes.food.innerHTML, /Shop/);
  assert.doesNotMatch(nodes.food.innerHTML, /sources-loading/);
  assert.equal(nodes.food.attributes['aria-busy'], 'false');
  assert.equal(nodes.timetable.attributes['aria-busy'], 'true');
  requests.get('/timetable/data/manifest.json')({ ok: false });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(nodes.timetable.innerHTML, /Could not load the sources/);
  assert.doesNotMatch(nodes.timetable.innerHTML, /sources-loading/);
  assert.equal(nodes.timetable.attributes['aria-busy'], 'false');
});


test('resolved empty source lists show a localized empty state instead of loading or failure', async () => {
  for (const [lang, empty] of [['ja', '出典はまだありません。'], ['en', 'No sources are available yet.']]) {
    const nodes = Object.fromEntries(['food', 'timetable'].map(name => [name, {
      innerHTML: '<div class="sources-loading">placeholder</div>',
      attributes: { 'aria-busy': 'true' },
      setAttribute(name, value) { this.attributes[name] = value; },
    }]));
    const context = vm.createContext({
      URL, foodDataUrl: '/food.json',
      document: {
        documentElement: { lang },
        querySelector: selector => nodes[selector.includes('timetable') ? 'timetable' : 'food'],
      },
      fetch: async url => ({ ok: true, json: async () => url === '/food.json' ? { places: [] } : {} }),
    });
    vm.runInContext(read('src/sources-page.js').replace(/^import .*;$/m, ''), context);
    await new Promise(resolve => setImmediate(resolve));
    for (const node of Object.values(nodes)) {
      assert.equal(node.innerHTML, `<p class="meta-text">${empty}</p>`);
      assert.equal(node.attributes['aria-busy'], 'false');
    }
  }
});
