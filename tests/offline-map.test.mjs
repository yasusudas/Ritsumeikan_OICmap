import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { offlineMapPlugin } from '../scripts/vite-offline-map-plugin.mjs';

const workerSource = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const clientSource = (await readFile(new URL('../src/offline-map.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/, '').replace('export function', 'function');
const origin = 'https://map.example';

function worker({ fail = '', networkFails = false } = {}) {
  const stored = new Map([['rits-oic-map-static-v24', new Map()], ['another-app-cache', new Map()]]);
  const handlers = {}, requests = [], messages = [];
  const key = value => new URL(typeof value === 'string' ? value : value.url, origin).href;
  const caches = {
    keys: async () => [...stored.keys()],
    delete: async name => stored.delete(name),
    open: async name => {
      if (!stored.has(name)) stored.set(name, new Map());
      return {
        put: async (url, response) => stored.get(name).set(key(url), response.clone()),
        match: async url => stored.get(name).get(key(url))?.clone(),
      };
    },
  };
  const context = vm.createContext({
    URL, Response,
    Request: class extends Request {
      constructor(url, options) { super(new URL(url, origin), options); this.priority = options?.priority; }
    },
    caches,
    fetch: async request => {
      requests.push(request);
      if (networkFails) throw Error('offline');
      return new Response(request.url.endsWith(fail) && fail ? 'unavailable' : request.url, { status: request.url.endsWith(fail) && fail ? 503 : 200 });
    },
    self: {
      location: { origin },
      clients: { matchAll: async () => [{ postMessage: value => messages.push(value) }], claim: async () => {} },
      addEventListener: (name, callback) => { handlers[name] = callback; },
    },
  });
  vm.runInContext(workerSource.replace("'development'", "'test-version'").replace('const APP_SHELL_URLS = [];', 'const APP_SHELL_URLS = ["/index.html", "/en/index.html", "/assets/5F.svg"];'), context);
  const install = () => new Promise((resolve, reject) => handlers.install({ waitUntil: value => value.then(resolve, reject) }));
  return { stored, handlers, requests, messages, install, context, caches };
}

test('background installation saves unseen assets sequentially at low priority before reporting ready', async () => {
  const w = worker();
  await w.install();
  assert.deepEqual(w.requests.map(request => new URL(request.url).pathname), ['/index.html', '/en/index.html', '/assets/5F.svg']);
  assert.ok(w.requests.every(request => request.priority === 'low'));
  assert.equal(w.requests.at(-1).cache, 'force-cache');
  assert.deepEqual(w.messages.map(value => value.state), ['saving', 'ready']);
  assert.ok(w.stored.get('rits-oic-map-static-v25-test-version').has(`${origin}/assets/5F.svg`));
});

test('failed background installation removes its partial download and preserves the previous map', async () => {
  const w = worker({ fail: '/assets/5F.svg' });
  await assert.rejects(w.install(), /Offline asset unavailable/);
  assert.ok(w.stored.has('rits-oic-map-static-v24'));
  assert.ok(!w.stored.has('rits-oic-map-static-v25-test-version'));
  assert.deepEqual(w.messages.map(value => value.state), ['saving', 'error']);
});

test('activation cleans this map’s old caches and leaves other apps’ caches alone', async () => {
  const w = worker();
  await w.install();
  await new Promise((resolve, reject) => w.handlers.activate({ waitUntil: value => value.then(resolve, reject) }));
  assert.ok(!w.stored.has('rits-oic-map-static-v24'));
  assert.ok(w.stored.has('another-app-cache'));
  assert.ok(w.stored.has('rits-oic-map-static-v25-test-version'));
});

test('offline navigation retains the English shell with query parameters; unsupported pages get an explicit notice', async () => {
  const w = worker();
  await w.install();
  vm.runInContext("fetch = async () => { throw new Error('offline'); };", w.context);
  const response = await w.context.networkFirst({ url: `${origin}/en/?source=pwa` });
  assert.equal(await response.text(), `${origin}/en/index.html`);
  const unsupported = await w.context.networkFirst({ url: `${origin}/en/timetable/` });
  assert.equal(unsupported.status, 503);
  assert.match(await unsupported.text(), /Connection required/);
});

test('live APIs, authenticated editor pages and other origins are never intercepted by offline caching', () => {
  const w = worker();
  for (const url of [`${origin}/api/rail-status`, `${origin}/api/coop-hours`, `${origin}/editor/`, `${origin}/editor/login/`, 'https://external.example/assets/map.svg']) {
    w.handlers.fetch({ request: { method: 'GET', url, mode: 'navigate' }, respondWith: () => assert.fail(url) });
  }
});

function client() {
  let now = 0, next = 0, ready = false;
  const timers = new Map(), handlers = {}, registrations = [];
  const status = { hidden: true, dataset: {} };
  const setTimeout = (callback, delay) => { const id = ++next; timers.set(id, { callback, at: now + delay }); return id; };
  const clearTimeout = id => timers.delete(id);
  const document = { getElementById: () => status, readyState: 'complete', visibilityState: 'visible', addEventListener: (name, fn) => { handlers[name] = fn; } };
  const window = {
    location: { origin }, setTimeout, clearTimeout,
    requestIdleCallback: callback => setTimeout(callback, 0), cancelIdleCallback: clearTimeout,
    addEventListener: (name, fn) => { handlers[name] = fn; },
  };
  const navigator = { onLine: true, serviceWorker: {
    addEventListener() {}, getRegistration: async () => undefined,
    register: async () => { registrations.push(now); return { addEventListener() {} }; },
  } };
  const context = vm.createContext({ document, window, navigator, URL, performance: { now: () => now }, onLanguageChange() {}, t: key => key });
  vm.runInContext(clientSource, context);
  context.initOfflineMap({ isMapReady: () => ready });
  function advance(ms) {
    const target = now + ms;
    while (true) {
      const due = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      const [id, timer] = due;
      timers.delete(id); now = timer.at; timer.callback();
    }
    now = target;
  }
  return { handlers, registrations, advance, document, navigator, setReady: () => { ready = true; } };
}

test('registration waits for the foreground map/search, then yields until three seconds after the last interaction', async () => {
  const c = client();
  c.advance(3000);
  assert.equal(c.registrations.length, 0, 'the initial map is still loading');
  c.setReady();
  c.advance(2000);
  c.handlers.wheel();
  c.advance(2999);
  assert.equal(c.registrations.length, 0, 'interaction postponed the background download');
  c.advance(1);
  assert.deepEqual(c.registrations, [8000]);
});

test('hidden and disconnected pages defer registration until visible and online again', () => {
  const c = client(); c.setReady();
  c.document.visibilityState = 'hidden'; c.handlers.visibilitychange();
  c.advance(6000); assert.equal(c.registrations.length, 0);
  c.document.visibilityState = 'visible'; c.navigator.onLine = false; c.handlers.visibilitychange();
  c.advance(6000); assert.equal(c.registrations.length, 0);
  c.navigator.onLine = true; c.handlers.online();
  c.advance(3000); assert.equal(c.registrations.length, 1);
});

test('a held drag or pinch keeps the background registration paused until the pointer is released', () => {
  const c = client(); c.setReady();
  c.handlers.pointerdown({ type: 'pointerdown', pointerId: 1 });
  c.advance(9000); assert.equal(c.registrations.length, 0);
  c.handlers.pointerup({ type: 'pointerup', pointerId: 1 });
  c.advance(2999); assert.equal(c.registrations.length, 0);
  c.advance(1); assert.equal(c.registrations.length, 1);
});

test('build manifest includes emitted map assets, excludes hidden files and revises the cache for worker or data changes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'oic-offline-plugin-'));
  try {
    for (const name of ['food-marks', 'iconsvg', 'icon']) await mkdir(join(directory, name));
    for (const name of ['manifest.webmanifest', 'analytics-init.js', 'food-marks/cafe.svg', 'food-marks/.DS_Store']) await writeFile(join(directory, name), name);
    await writeFile(join(directory, 'sw.js'), workerSource);
    async function build(data = 'floor') {
      let output;
      const plugin = offlineMapPlugin(); plugin.configResolved({ publicDir: directory });
      await plugin.generateBundle.call({ emitFile: value => { output = value.source; } }, {}, {
        'index.html': { fileName: 'index.html', source: 'shell' },
        'en/index.html': { fileName: 'en/index.html', source: 'English shell' },
        'assets/5F.svg': { fileName: 'assets/5F.svg', source: data },
        'editor/index.html': { fileName: 'editor/index.html', source: 'editor' },
      });
      return output;
    }
    const first = await build();
    assert.match(first, /"\/assets\/5F.svg"/);
    assert.match(first, /"\/en\/index.html"/);
    assert.doesNotMatch(first, /DS_Store|"\/editor\/index.html"/);
    const revision = value => value.match(/const PRECACHE_REVISION = '([^']+)'/)[1];
    assert.equal(revision(first), revision(await build()));
    assert.notEqual(revision(first), revision(await build('updated floor')));
    await writeFile(join(directory, 'sw.js'), `${workerSource}\n// updated worker\n`);
    assert.notEqual(revision(first), revision(await build()));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
