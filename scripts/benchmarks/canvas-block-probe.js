// Canvas block experiment; adapted from Claude session c0a55593-57a8-4ab6-8237-0e26328710a5, line 10115.
// Reuses its fixed label/HUD, start-file polling, measure loop, 120-frame
// 20-in/20-out x3 zoom and 120-frame pan. Only the vanilla Dev path is tested.
const browser = /Firefox\//.test(navigator.userAgent) ? 'Firefox' : /Chrome\//.test(navigator.userAgent) ? 'Chrome' : /Safari\//.test(navigator.userAgent) ? 'Safari' : 'Browser';
const id = browser.toLowerCase(), metadata = await fetch('/metadata').then(r => r.json());
const hud = document.getElementById('hud'), label = document.getElementById('label');
let iframe = document.querySelector('iframe');
const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [], lines = [];
const visibilityEvents = [];
document.addEventListener('visibilitychange', () => visibilityEvents.push({ at: performance.timeOrigin + performance.now(), state: document.visibilityState }));
const parameters = new URL(location).searchParams;
let activeVariant = 'baseline';
let started = 0, finished = '', status = '準備中…', phase = 'prepare';
label.firstChild.textContent = browser;
addEventListener('error', e => errors.push(String(e.message)));
addEventListener('unhandledrejection', e => errors.push(String(e.reason)));
const post = async (name, data) => {
  const r = await fetch('/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `${id}-${name}`, data }) });
  if (!r.ok) throw Error('Result save failed');
};
function environment() {
  const r = iframe.getBoundingClientRect();
  return { browser, userAgent: navigator.userAgent, dpr: devicePixelRatio, parentViewport: [innerWidth, innerHeight],
    iframe: [iframe.clientWidth, iframe.clientHeight], iframeRect: r.toJSON(), iframeFullyVisible: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
    window: [screenX, screenY, outerWidth, outerHeight], screen: [screen.width, screen.height], visibility: document.visibilityState,
    focus: document.hasFocus(), gestureEvent: 'GestureEvent' in window, coarsePointer: matchMedia('(pointer: coarse)').matches, timestamp: new Date().toISOString() };
}
const show = () => { hud.textContent = lines.join('\n') + `\n${status}`; document.title = `${browser} — 未改善Dev — ${status}`; };
setInterval(() => { label.lastChild.textContent = finished || (started ? `${activeVariant} / ${phase} ${((performance.now() - started) / 1000).toFixed(1)}s` : status); }, 100);
async function load(language = 'ja', floor = '1F') {
  const loadStart = performance.now();
  localStorage.setItem('oicmap:lang', language);
  const previousDocument = iframe.contentDocument;
  // A fresh browsing context also isolates each trial from a pending navigation
  // or unload in the previous frame (seen in the real Chrome session).
  const freshFrame = document.createElement('iframe');
  iframe.replaceWith(freshFrame); iframe = freshFrame;
  iframe.src = `/${activeVariant}/${language === 'en' ? 'en/' : ''}index.html?probe=${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const navigationDeadline = performance.now() + 30000;
  // Google Fonts/analytics may keep window.load pending even after the map is
  // usable. Test the new document and actual map readiness, with a deadline.
  while (iframe.contentDocument === previousDocument || iframe.contentDocument.readyState === 'loading' || !iframe.contentDocument.querySelector('#viewer')) {
    if (performance.now() > navigationDeadline) throw Error('New map document timed out'); await wait(60);
  }
  const w = iframe.contentWindow, d = iframe.contentDocument;
  w.addEventListener('error', e => errors.push(String(e.message)));
  w.addEventListener('unhandledrejection', e => errors.push(String(e.reason)));
  const deadline = performance.now() + 30000;
  const ready = () => d.querySelector('.floor-svg')?.complete && d.querySelector('.floor-svg').naturalWidth > 0 && d.querySelector('#canvas-layer')?.style.width;
  while (!ready()) { if (performance.now() > deadline) throw Error('Map load timed out'); await wait(60); }
  if (floor !== '1F') {
    d.querySelector(`.floor-tab[data-floor="${floor}"]`).click();
    while (!ready() || !(d.querySelector('.floor-svg').dataset.originalSvgUrl ?? d.querySelector('.floor-svg').getAttribute('src')).includes(floor)) { if (performance.now() > deadline) throw Error('Floor load timed out'); await wait(60); }
  }
  if (activeVariant === 'canvas') {
    while (!w.__canvasBlocks?.info().ready) { if (performance.now() > deadline) throw Error('Canvas initial tiles timed out'); await wait(40); }
  }
  const assetReadyMs = performance.now() - loadStart;
  await wait(1500);
  if (errors.length) throw Error(errors.join('; '));
  return { w, d, viewer: d.querySelector('#viewer'), layer: d.querySelector('#canvas-layer'), assetReadyMs };
}
function stats(list) {
  const sorted = [...list].sort((a, b) => a - b), sum = list.reduce((s, x) => s + x, 0);
  return { frames: list.length, totalMs: sum, fps: list.length * 1000 / sum, slow25: list.filter(x => x > 25).length,
    slow50: list.filter(x => x > 50).length, worstMs: sorted.at(-1), p50Ms: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1] };
}
function snapshot(app) {
  const { width, height, transform } = app.layer.style;
  const scale = Number(transform.match(/scale\(([^)]+)\)/)?.[1] ?? 1);
  return { width, height, transform, scale, logicalWidth: parseFloat(width) * scale, tiles: app.w.__canvasBlocks?.info() ?? null };
}
async function measure(app, step, count) {
  const times = [], trace = [], start = performance.timeOrigin + performance.now();
  let last = await frame();
  for (let i = 0; i < count; i++) {
    const before = performance.now(); step(i); const now = await frame(); times.push(now - last); last = now;
    trace.push({ index: i, inputAt: performance.timeOrigin + before, frameAt: performance.timeOrigin + now,
      ...snapshot(app), visibility: document.visibilityState, focus: document.hasFocus() });
  }
  const end = performance.timeOrigin + performance.now();
  return { ...stats(times), times, trace, start, end, visibilityEvents: visibilityEvents.filter(e => e.at >= start && e.at <= end) };
}
function wheel(app, dy) {
  const r = app.viewer.getBoundingClientRect();
  app.viewer.dispatchEvent(new app.w.WheelEvent('wheel', { deltaY: dy, clientX: r.left + r.width * .45, clientY: r.top + r.height * .55, bubbles: true, cancelable: true }));
}
async function barrier(key) {
  phase = '同期待ち'; status = `${key} 準備OK`; show();
  const deadline = performance.now() + 600000;
  for (;;) {
    const b = await fetch(`/probe-barrier?browser=${id}&key=${encodeURIComponent(key)}`, { cache: 'no-store' }).then(r => r.json());
    if (b.key === key && b.startAt) { while (Date.now() < b.startAt) await wait(Math.min(20, b.startAt - Date.now())); return b.startAt; }
    if (performance.now() > deadline) throw Error(`Barrier timeout ${key}`);
    await wait(100);
  }
}
async function run(command) {
  started = performance.now();
  const data = { commit: metadata.commit, command, method: 'Claude original measure loop: 120 zoom steps (20 in/out x3), then 120 pan steps; per-phase barrier; identical unmodified Dev; simultaneous real browsers, no recording; baseline/canvas ABBA-BAAB order; 4 repetitions per variant and floor/language', environment: environment(), trials: [], errors };
  const cases = [{ language: 'ja', floor: '1F' }, { language: 'en', floor: '1F' }, { language: 'ja', floor: '5F' }, { language: 'en', floor: '5F' }];
  const sequence = command.smoke ? ['baseline', 'canvas'] : ['baseline', 'canvas', 'canvas', 'baseline', 'canvas', 'baseline', 'baseline', 'canvas'];
  for (const c of (command.smoke ? cases.slice(0, 1) : cases)) for (const [order, variant] of sequence.entries()) {
    const round = order + 1; activeVariant = variant;
    const key = `${command.runId}-${round}-${variant}-${c.language}-${c.floor}`;
    phase = variant; status = `${round}/${sequence.length} ${c.language} ${c.floor} 読込中`; show();
    while (document.visibilityState !== 'visible') { status = `${activeVariant} 非表示のため待機`; show(); await wait(200); }
    const app = await load(c.language, c.floor);
    while (document.visibilityState !== 'visible') { status = `${activeVariant} 表示復帰待ち`; show(); await wait(200); }
    const env = environment(); if (!env.iframeFullyVisible || env.dpr !== 1) throw Error('Invalid trial dimensions');
    // Cache warmup is independent of the measured samples.
    for (let i = 0; i < 40; i++) { wheel(app, i < 20 ? -40 : 40); await frame(); } await wait(600);
    if (activeVariant === 'canvas') { const until = performance.now() + 30000; while (!app.w.__canvasBlocks.info().ready) { if (performance.now() > until) throw Error('Warm tiles timed out'); await wait(40); } }
    const initial = snapshot(app), idle = await measure(app, () => {}, 60);
    const zoomScheduledAt = await barrier(key + '-zoom'); phase = '拡大・縮小'; status = `${round}/${sequence.length} ${c.language} ${c.floor} 拡大・縮小120コマ`; show();
    const zoom = await measure(app, i => wheel(app, Math.floor(i / 20) % 2 === 0 ? -40 : 40), 120);
    await wait(400); const stopped = snapshot(app);
    for (let i = 0; i < 20; i++) { wheel(app, -40); await frame(); } await wait(800);
    const panScheduledAt = await barrier(key + '-pan'); phase = 'パン'; status = `${round}/${sequence.length} ${c.language} ${c.floor} パン120コマ`; show();
    const r = app.viewer.getBoundingClientRect(), cx = r.left + r.width * .45, cy = r.top + r.height * .55;
    const panBefore = snapshot(app);
    app.viewer.dispatchEvent(new app.w.MouseEvent('mousedown', { clientX: cx, clientY: cy, button: 0, bubbles: true }));
    const pan = await measure(app, i => app.viewer.dispatchEvent(new app.w.MouseEvent('mousemove', { clientX: cx + Math.sin(i / 10) * 200, clientY: cy + Math.cos(i / 10) * 150, bubbles: true })), 120);
    app.viewer.dispatchEvent(new app.w.MouseEvent('mouseup', { clientX: cx, clientY: cy, bubbles: true }));
    if (errors.length || app.w.__canvasBlocks?.info().errors.length) throw Error([...errors, ...(app.w.__canvasBlocks?.info().errors ?? [])].join('; '));
    const resources = app.w.performance.getEntriesByType('resource').filter(r => /\/tiles\/|\/assets\/.*\.svg/.test(r.name)).map(r => ({ url: new URL(r.name).pathname, bytes: r.encodedBodySize, durationMs: r.duration }));
    const trial = { ...c, variant, order, round, assetReadyMs: app.assetReadyMs, resources, initial, stopped, panBefore, zoomScheduledAt, panScheduledAt, idle, zoom, pan,
      actualLanguage: app.d.documentElement.lang, image: app.d.querySelector('.floor-svg').dataset.originalSvgUrl ?? app.d.querySelector('.floor-svg').getAttribute('src'),
      viewer: [app.viewer.clientWidth, app.viewer.clientHeight], environment: environment() };
    data.trials.push(trial); await post(command.runId + '-progress', data);
    const z = zoom.fps.toFixed(1), p = pan.fps.toFixed(1);
    lines.splice(1, lines.length - 1, ...data.trials.slice(-4).map(t => `${t.variant} ${t.language} ${t.floor}: zoom ${t.zoom.fps.toFixed(1)}fps pan ${t.pan.fps.toFixed(1)}fps slow ${t.zoom.slow25}/120`));
    status = `${c.language} ${c.floor} 完了 zoom ${z} / pan ${p}`; show();
  }
  data.elapsedMs = performance.now() - started; data.environmentEnd = environment();
  await post(command.runId, data);
  finished = `完了 ${(data.elapsedMs / 1000).toFixed(1)}s`;
  phase = '完了'; status = finished; show();
}

async function quality() {
  activeVariant = parameters.get('variant') ?? 'baseline';
  const language = parameters.get('language') ?? 'ja', floor = parameters.get('floor') ?? '1F', steps = Number(parameters.get('steps') ?? 23);
  const app = await load(language, floor), initial = snapshot(app), originalSet = app.w.setTimeout.bind(app.w), originalClear = app.w.clearTimeout.bind(app.w), pending = new Map();
  app.w.setTimeout = (callback, delay, ...args) => { if (Number(delay) === 140) { const token = originalSet(() => {}, 2147483647); pending.set(token, { callback, args }); return token; } return originalSet(callback, delay, ...args); };
  app.w.clearTimeout = token => { pending.delete(token); originalClear(token); };
  for (let i = 0; i < steps; i++) { wheel(app, -40); await frame(); } await frame();
  app.w.__canvasBlocks?.hold(true);
  const name = `quality-${activeVariant}-${language}-${floor}-${steps}`;
  const geometry = () => ({ environment: environment(), state: snapshot(app), initial,
    viewer: app.viewer.getBoundingClientRect().toJSON(), image: app.d.querySelector('.floor-svg').getBoundingClientRect().toJSON(),
    topbar: app.d.querySelector('.topbar')?.getBoundingClientRect().toJSON(), errors });
  await post(name + '-moving', geometry()); status = `${activeVariant} 拡大中を保持（撮影専用）`; show();
  const button = document.createElement('button'); button.textContent = '停止後の描画'; button.style.cssText = 'position:fixed;top:78px;right:12px;z-index:20'; document.body.append(button);
  button.onclick = async () => {
    button.disabled = true; app.w.setTimeout = originalSet; app.w.clearTimeout = originalClear;
    for (const [token, { callback, args }] of pending) { originalClear(token); originalSet(callback, 140, ...args); }
    app.w.__canvasBlocks?.hold(false); await wait(1200); await frame(); await frame();
    await post(name + '-stopped', geometry()); status = `${activeVariant} 停止後`; show(); button.textContent = '停止後・完了';
  };
}
async function usability() {
  activeVariant = parameters.get('variant') ?? 'baseline';
  const language = parameters.get('language') ?? 'ja', query = parameters.get('query') ?? (language === 'ja' ? 'AC130' : 'AS555');
  const app = await load(language), input = app.d.querySelector('#search-input');
  const until = async (check, text) => { const end = performance.now() + 30000; while (!check()) { if (performance.now() > end) throw Error(text); await wait(40); } };
  input.focus(); input.value = query; input.dispatchEvent(new app.w.Event('input', { bubbles: true }));
  const option = () => [...app.d.querySelectorAll('.search-result[role="option"]')].find(n => n.textContent.includes(query));
  await until(option, 'Search suggestion timeout'); const suggestion = option().textContent; option().click(); await wait(1200);
  if (activeVariant === 'canvas') await until(() => app.w.__canvasBlocks.info().ready, 'Search tiles timeout');
  const mark = app.d.querySelector('.search-highlight-area-outline, .search-highlight-pin');
  const search = { suggestion, hash: app.w.location.hash, highlight: mark?.getBoundingClientRect().toJSON() ?? null,
    floor: app.d.querySelector('.floor-tab.is-active')?.dataset.floor, state: snapshot(app) };
  app.d.querySelector('.search-icon-button[data-facility-key="toilet"]').click();
  await until(() => app.d.querySelectorAll('.facility-ring').length > 0, 'Facility rings timeout');
  const rings = [...app.d.querySelectorAll('.facility-ring')].map(n => n.getBoundingClientRect().toJSON());
  const result = { variant: activeVariant, language, query, search, rings, image: app.d.querySelector('.floor-svg').dataset.originalSvgUrl ?? app.d.querySelector('.floor-svg').getAttribute('src'), environment: environment(), errors };
  await post(`usage-${activeVariant}-${language}-${query}`, result);
  status = `${activeVariant} ${query} 検索・施設表示を確認`; show();
}
try {
  if (parameters.get('run') === 'quality') { await quality(); }
  else if (parameters.get('run') === 'usage') { await usability(); }
  else {
  await load();
  const env = environment();
  if (!env.iframeFullyVisible || env.dpr !== 1 || env.visibility !== 'visible') throw Error(`Invalid environment: ${JSON.stringify(env)}`);
  lines.push(`${browser} / Dev vs Canvas / 900×440 / DPR ${devicePixelRatio}`);
  status = '準備OK・同期開始待ち'; show(); await post('sync-ready', { environment: env, errors, commit: metadata.commit });
  for (;;) {
    const command = await fetch(`/probe-start.txt?browser=${id}&ready=1&t=${Date.now()}`, { cache: 'no-store' }).then(r => r.json());
    if (command.runId && command.startAt > 0 && (!command.participants || command.participants.includes(id))) {
      status = '準備OK・カウントダウン'; show();
      while (Date.now() < command.startAt) await wait(Math.min(30, command.startAt - Date.now()));
      await run(command); break;
    }
    await wait(100);
  }
  }
} catch (e) {
  finished = 'エラー'; status = String(e); show(); await post('sync-failure-' + Date.now(), { error: String(e.stack ?? e), environment: environment(), errors });
}
