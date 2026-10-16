import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const exists = (path) => existsSync(new URL(`../${path}`, import.meta.url));

test('/timetable/ shows the departure cards and stays out of search results', () => {
  const html = read('timetable/index.html');
  assert.match(html, /<link rel="canonical" href="https:\/\/rits-oic-map\.app\/timetable\/" \/>/);
  assert.match(html, /<meta name="robots" content="noindex,nofollow,noarchive" \/>/);
  assert.match(html, /src="\/src\/timetable\.js"/);
  assert.doesNotMatch(html, /timetable-links\.js/);
  assert.match(html, /data-card-grid/);
  assert.match(html, /class="site-nav-link" href="\/timetable\/" aria-current="page"/);
  assert.doesNotMatch(read('public/sitemap.xml'), /rits-oic-map\.app\/timetable\//);
});

test('the Japanese links page is archived, not built, and its old URL goes to /timetable/', () => {
  assert.equal(exists('hidden/timetable/index.html'), false);
  assert.equal(exists('archive/timetable-links/index.html'), true);
  assert.doesNotMatch(read('vite.config.js'), /hidden\/timetable/);
  const vercel = JSON.parse(read('vercel.json'));
  const route = vercel.routes.find((r) => r.src === '^/hidden/timetable/?$');
  assert.equal(route?.headers?.Location, '/timetable/');
  assert.equal(route?.status, 308);
  // The English links page is still served.
  assert.match(read('en/timetable/index.html'), /src="\/src\/timetable-links\.js"/);
});

test('the departure data lives under /timetable/data/ and nothing refers to /hidden/ any more', () => {
  assert.equal(exists('public/hidden'), false);
  assert.equal(exists('public/timetable/data/manifest.json'), true);
  assert.match(read('src/timetable.js'), /'\/timetable\/data\/manifest\.json'/);
  assert.match(read('public/sw.js'), /'\/timetable\/data\/'/);
  assert.match(read('scripts/fetch-timetable-data.mjs'), /public\/timetable\/data/);
  const manifest = JSON.parse(read('public/timetable/data/manifest.json'));
  const urls = JSON.stringify(manifest).match(/"\/[^"]*data\/[^"]*\.json"/g) || [];
  assert.ok(urls.length > 0);
  assert.ok(urls.every((url) => url.startsWith('"/timetable/data/')), 'every data URL is under /timetable/data/');
  for (const url of urls) assert.equal(exists(`public${url.slice(1, -1)}`), true, url);
});

test('the source notes moved from the timetable page to the sources page', () => {
  const timetable = read('timetable/index.html');
  assert.doesNotMatch(timetable, /data-source-note/);
  assert.match(timetable, /class="timetable-caution"[\s\S]*href="\/sources\/"/);
  assert.doesNotMatch(read('src/timetable.js'), /renderSourceNote|data-source-note/);

  for (const file of ['sources/index.html', 'en/sources/index.html'])
    assert.match(read(file), /data-sources-timetable/, file);
  assert.match(read('src/sources-page.js'), /'\/timetable\/data\/manifest\.json'/);
  // The notes and references that the page now lists come from the manifest.
  const manifest = JSON.parse(read('public/timetable/data/manifest.json'));
  assert.ok(manifest.sourceNotes.some((note) => /阪急電車の時刻表ページ/.test(note)));
  assert.ok(manifest.sourceNotes.some((note) => /JR西日本の時刻表ページ/.test(note)));
  assert.ok(manifest.sourceReferences.length >= 3);
  assert.match(read('sources/index.html'), /href="\/timetable\/"/);
  assert.match(read('en/sources/index.html'), /Hankyu's timetable pages state that permission is required/);
});
