import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const analytics = readFileSync(new URL('../public/analytics-init.js', import.meta.url), 'utf8');
const notice = readFileSync(new URL('../public/legacy-moved.js', import.meta.url), 'utf8');
const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const marker = 'oicmap_migrated';

function browser(url, { legacy = false } = {}) {
  const timeline = [];
  const nodes = new Map(['migration-link', 'migration-title', 'migration-copy'].map(id => [id, {
    textContent: '', handlers: {}, addEventListener(name, fn) { this.handlers[name] = fn; }
  }]));
  const window = {
    location: new URL(url),
    history: {
      state: { retained: true },
      replaceState(state, _, target) {
        timeline.push('cleanup');
        this.state = state;
        window.location = new URL(target, window.location);
      }
    },
    dataLayer: []
  };
  const document = {
    documentElement: { lang: 'ja', hasAttribute: name => legacy && name === 'data-legacy-notice' },
    createElement: tag => ({ tag }),
    getElementById: id => nodes.get(id),
    head: { appendChild(script) { timeline.push({ tag: script.src, location: window.location.href }); } }
  };
  window.gtag = (...args) => { timeline.push(args[0]); window.dataLayer.push(args); };
  const context = vm.createContext({ window, document, URL, Date });
  return { context, window, document, nodes, timeline, run: code => vm.runInContext(code, context) };
}

const events = b => b.window.dataLayer.filter(row => row[0] === 'event').map(row => row[1]);

test('marker is snapshotted and removed before config/tag; campaign data, hash and history state survive', () => {
  const b = browser('https://rits-oic-map.app/en/?utm_source=campus&gclid=abc&_gl=1%2Ax%2A&x=1&x=2&oicmap_migrated=1#2f-ac230');
  b.run(analytics);
  assert.deepEqual(b.timeline.slice(0, 3), ['cleanup', 'js', 'config']);
  assert.equal(b.window.location.searchParams.has(marker), false);
  assert.equal(b.window.location.pathname, '/en/');
  assert.equal(b.window.location.searchParams.get('_gl'), '1*x*');
  assert.equal(b.window.location.searchParams.get('gclid'), 'abc');
  assert.equal(b.window.location.searchParams.get('utm_source'), 'campus');
  assert.deepEqual(b.window.location.searchParams.getAll('x'), ['1', '2']);
  assert.equal(b.window.location.hash, '#2f-ac230');
  assert.deepEqual(b.window.history.state, { retained: true });
  assert.deepEqual(events(b), ['domain_migration_marked_arrival']);
  assert.equal(b.window.dataLayer.filter(row => row[0] === 'config').length, 1);
  assert.equal(events(b).includes('page_view'), false);
  assert.equal(b.timeline.at(-1).location.includes(marker), false);
});

test('clean URL and repeated initialization do not produce extra config or arrival', () => {
  const b = browser('https://rits-oic-map.app/?source=pwa#2f-ac230');
  b.run(analytics); b.run(analytics);
  assert.equal(b.timeline.includes('cleanup'), false);
  assert.equal(b.window.dataLayer.filter(row => row[0] === 'config').length, 1);
  assert.deepEqual(events(b), []);
});

test('legacy notice records a view separately and does not clean the old URL', () => {
  const b = browser('https://rits-oic-map.vercel.app/en/access/?oicmap_migrated=1', { legacy: true });
  b.run(analytics);
  assert.deepEqual(events(b), ['domain_migration_notice_view']);
  assert.equal(b.timeline.includes('cleanup'), false);
});

test('only the exact new hostname and marker value count as marked arrival', () => {
  for (const url of ['https://rits-oic-map.app.evil.example/?oicmap_migrated=1', 'https://preview.example/?oicmap_migrated=1', 'https://rits-oic-map.app/?oicmap_migrated=0']) {
    const b = browser(url); b.run(analytics);
    assert.deepEqual(events(b), []);
  }
});

for (const path of ['/', '/en/', '/access/', '/en/access/', '/en/index.html']) {
  test(`native destination preserves ${path}, query and classroom hash with a fixed origin`, () => {
    const b = browser(`https://rits-oic-map.vercel.app${path}?utm_source=campus&gclid=abc&_gl=abc%2Bdef&next=https%3A%2F%2Fevil.example&oicmap_migrated=0#2f-ac230`, { legacy: true });
    b.run(notice); b.run(analytics);
    const target = new URL(b.nodes.get('migration-link').href);
    assert.equal(target.origin, 'https://rits-oic-map.app');
    assert.equal(target.pathname, path);
    assert.equal(target.searchParams.get(marker), '1');
    assert.equal(target.searchParams.get('_gl'), 'abc+def');
    assert.equal(target.searchParams.get('gclid'), 'abc');
    assert.equal(target.searchParams.get('utm_source'), 'campus');
    assert.equal(target.hash, '#2f-ac230');
    assert.equal(b.document.documentElement.lang, path.startsWith('/en') ? 'en' : 'ja');
    b.nodes.get('migration-link').handlers.click();
    b.nodes.get('migration-link').handlers.click();
    assert.equal(events(b).filter(e => e === 'domain_migration_link_click').length, 1);
    assert.equal(b.window.location.hostname, 'rits-oic-map.vercel.app');
  });
}

test('a blocked/throwing analytics implementation never disables the anchor', () => {
  const b = browser('https://rits-oic-map.vercel.app/en/#2f-ac230', { legacy: true });
  b.run(notice);
  b.window.oicMapAnalytics = { track() { throw Error('blocked'); } };
  assert.doesNotThrow(() => b.nodes.get('migration-link').handlers.click());
  assert.equal(new URL(b.nodes.get('migration-link').href).hostname, 'rits-oic-map.app');
});

test('legacy route allowlist excludes files, APIs and unknown paths', () => {
  const rewrite = config.routes[0];
  assert.deepEqual(rewrite.has, [{ type: 'host', value: { eq: 'rits-oic-map.vercel.app' } }]);
  const regex = new RegExp(rewrite.src);
  for (const path of ['/', '/index.html', '/en', '/en/', '/en/index.html', '/en/access/', '/editor/login/', '/hidden/timetable/']) assert.equal(regex.test(path), true, path);
  for (const path of ['/robots.txt', '/sitemap.xml', '/sw.js', '/google4ddf7f320452e31a.html', '/assets/main.js', '/manual-search-index.json', '/api/rail-status', '/unknown', '/en/unknown/', '//evil.example']) assert.equal(regex.test(path), false, path);
  for (const redirect of config.routes.filter(r => r.status === 308)) assert.deepEqual(redirect.missing, rewrite.has);
});

test('standalone notice is initially noindex with no automatic navigation or map bundle', () => {
  const html = readFileSync(new URL('../public/legacy-moved.html', import.meta.url), 'utf8');
  assert.match(html, /name="robots" content="noindex,follow"/);
  assert.match(html, /<a id="migration-link"[^>]+href="https:\/\/rits-oic-map\.app/);
  assert.doesNotMatch(html, /http-equiv="refresh"|target="_blank"|src="[^\"]*main/);
  assert.doesNotMatch(notice, /location\.(?:href|assign|replace)\s*(?:=|\()|setTimeout|preventDefault/);
});

test('old-host rules run before filesystem; robots remains crawlable plain text', () => {
  const filesystem = config.routes.findIndex(r => r.handle === 'filesystem');
  assert.ok(filesystem > 1);
  assert.equal(config.routes[0].dest, '/legacy-moved.html');
  assert.equal(config.routes[1].dest, '/legacy-robots.txt');
  assert.equal(config.routes[0].headers['X-Robots-Tag'], 'noindex, follow');
  const robots = readFileSync(new URL('../public/legacy-robots.txt', import.meta.url), 'utf8');
  assert.match(robots, /Allow: \//);
  assert.doesNotMatch(robots, /Disallow/);
});

test('every built HTML entrypoint is gated on the old host and initializes GA only once', () => {
  const vite = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');
  const entries = [...vite.matchAll(/resolve\(__dirname, '([^']+\.html)'\)/g)].map(match => match[1]);
  assert.equal(entries.length, 16);
  const route = new RegExp(config.routes[0].src);
  for (const entry of entries) {
    const path = '/' + entry;
    assert.equal(route.test(path), true, path);
    const folder = path.replace(/index\.html$/, '');
    assert.equal(route.test(folder), true, folder);
    if (folder !== '/') assert.equal(route.test(folder.slice(0, -1)), true, folder);
    const html = readFileSync(new URL('../' + entry, import.meta.url), 'utf8');
    assert.equal((html.match(/src="\/analytics-init\.js"/g) || []).length, 1, entry);
    assert.doesNotMatch(html, /gtag\('config'|googletagmanager\.com\/gtag/);
  }
});

test('direct notice-file visits link to the new root, never back to the notice file', () => {
  const b = browser('https://rits-oic-map.app/legacy-moved.html', { legacy: true });
  b.run(notice);
  assert.equal(new URL(b.nodes.get('migration-link').href).pathname, '/');
});
