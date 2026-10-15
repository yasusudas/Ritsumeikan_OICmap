import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

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
  const ja = ['index.html', 'access/index.html', 'food/index.html', 'timetable/index.html', 'terms/index.html', 'privacy/index.html', 'sources/index.html', 'hidden/timetable/index.html', 'editor/index.html'];
  const en = ['en/index.html', 'en/access/index.html', 'en/food/index.html', 'en/timetable/index.html', 'en/terms/index.html', 'en/privacy/index.html', 'en/sources/index.html'];
  for (const file of ja) assert.match(read(file), /href="\/sources\/"/, file);
  for (const file of en) assert.match(read(file), /href="\/en\/sources\/"/, file);
});

test('the terms link on the sources page still points at the terms page', () => {
  assert.match(read('sources/index.html'), /href="\/terms\/">利用規約<\/a>/);
  assert.match(read('en/sources/index.html'), /href="\/en\/terms\/">Terms<\/a>/);
});
