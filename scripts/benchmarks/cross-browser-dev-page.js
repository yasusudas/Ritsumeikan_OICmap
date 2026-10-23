// Only the parent harness is new. Every browser receives the same unmodified Dev build.
const metadata = await fetch('/metadata').then(r => r.json());
const browser = new URL(location).searchParams.get('browser');
if (!['chrome', 'safari', 'firefox'].includes(browser)) throw Error('Set ?browser=chrome|safari|firefox');
document.title = `Vanilla Dev — ${browser}`;
document.querySelector('#label').textContent = `${browser} / Dev cb403e0`;
const frame = document.querySelector('#app'), status = document.querySelector('#status');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const raf = () => new Promise(requestAnimationFrame);
const errors = [];
addEventListener('error', e => errors.push(String(e.message)));
addEventListener('unhandledrejection', e => errors.push(String(e.reason)));
const post = async (name, data) => {
  const response = await fetch('/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `${browser}-${name}`, data }) });
  if (!response.ok) throw Error('Could not save result');
};
function environment() {
  const r = frame.getBoundingClientRect();
  return { browser, userAgent: navigator.userAgent, dpr: devicePixelRatio,
    parentViewport: [innerWidth, innerHeight], iframe: [frame.clientWidth, frame.clientHeight],
    iframeRect: r.toJSON(), iframeFullyVisible: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
    window: [screenX, screenY, outerWidth, outerHeight], screen: [screen.width, screen.height],
    visibility: document.visibilityState, focus: document.hasFocus(),
    gestureEvent: 'GestureEvent' in window, coarsePointer: matchMedia('(pointer: coarse)').matches,
    timestamp: new Date().toISOString() };
}
async function waitFor(check, label) {
  const deadline = performance.now() + 30000;
  while (performance.now() < deadline) { if (check()) return; await sleep(60); }
  throw Error(`Timed out: ${label}`);
}
async function load(language = 'ja', floor = '1F') {
  localStorage.setItem('oicmap:lang', language);
  await new Promise((resolve, reject) => { frame.onload = resolve; frame.onerror = reject; frame.src = `/baseline/${language === 'en' ? 'en/' : ''}index.html`; });
  const w = frame.contentWindow, d = frame.contentDocument;
  w.addEventListener('error', e => errors.push(String(e.message)));
  w.addEventListener('unhandledrejection', e => errors.push(String(e.reason)));
  await waitFor(() => d.querySelector('.floor-svg')?.complete && d.querySelector('#canvas-layer')?.style.width, 'initial floor');
  if (floor !== '1F') {
    d.querySelector(`.floor-tab[data-floor="${floor}"]`).click();
    await waitFor(() => d.querySelector('.floor-svg')?.getAttribute('src')?.includes(floor) && d.querySelector('.floor-svg').complete, 'floor');
  }
  await sleep(1200);
  await waitFor(() => d.querySelector('.floor-svg')?.naturalWidth > 0, 'image decoded');
  const app = { w, d, viewer: d.querySelector('#viewer'), layer: d.querySelector('#canvas-layer') };
  if (errors.length) throw Error(errors.join('; '));
  return app;
}
function snapshot(app, geometry = false) {
  const { width, height, transform } = app.layer.style;
  const scale = Number(transform.match(/scale\(([^)]+)\)/)?.[1] ?? 1);
  return { width, height, transform, scale, logicalWidth: parseFloat(width) * scale,
    ...(geometry ? { viewerRect: app.viewer.getBoundingClientRect().toJSON(), imageRect: app.d.querySelector('.floor-svg').getBoundingClientRect().toJSON() } : {}) };
}
function wheel(app, deltaY) {
  const r = app.viewer.getBoundingClientRect();
  app.viewer.dispatchEvent(new app.w.WheelEvent('wheel', { deltaY, clientX: r.left + r.width * .52,
    clientY: r.top + r.height * .53, bubbles: true, cancelable: true }));
}
function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b), total = samples.reduce((a, b) => a + b, 0);
  return { frames: samples.length, totalMs: total, fps: samples.length * 1000 / total,
    meanMs: total / samples.length, p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], maxMs: Math.max(...samples),
    over25ms: samples.filter(v => v > 25).length, over50ms: samples.filter(v => v > 50).length };
}
async function warm(app) {
  for (const delta of [-1, 1]) for (let i = 0; i < 24; i++) { wheel(app, delta); await raf(); }
  await sleep(600);
}
async function measure(app) {
  const raw = { zoomIn: [], zoomOut: [], settle: [], pan: [] }, phases = [], visibility = [], focus = [];
  for (let cycle = 0; cycle < 3; cycle++) for (const [phase, delta] of [['zoomIn', -1], ['zoomOut', 1]]) {
    let previous = await raf(); const initial = snapshot(app), trace = [], settled = [];
    for (let i = 0; i < 24; i++) {
      wheel(app, delta); const now = await raf(); raw[phase].push(now - previous); previous = now;
      trace.push(snapshot(app)); visibility.push(document.visibilityState); focus.push(document.hasFocus());
    }
    for (let i = 0; i < 18; i++) {
      const now = await raf(); raw.settle.push(now - previous); previous = now; settled.push(snapshot(app));
    }
    phases.push({ cycle, phase, initial, trace, settled });
  }
  for (let i = 0; i < 16; i++) { wheel(app, -1); await raf(); }
  await sleep(400);
  const r = app.viewer.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  const panBefore = snapshot(app, true), panTrace = [];
  app.viewer.dispatchEvent(new app.w.MouseEvent('mousedown', { clientX: x, clientY: y, button: 0, bubbles: true }));
  let previous = await raf();
  for (let i = 0; i < 60; i++) {
    app.viewer.dispatchEvent(new app.w.MouseEvent('mousemove', { clientX: x + 120 * Math.sin(i / 10), clientY: y + 70 * Math.cos(i / 10), buttons: 1, bubbles: true }));
    const now = await raf(); raw.pan.push(now - previous); previous = now; panTrace.push(snapshot(app));
  }
  app.viewer.dispatchEvent(new app.w.MouseEvent('mouseup', { bubbles: true }));
  if (errors.length) throw Error(errors.join('; '));
  return { zoom: stats([...raw.zoomIn, ...raw.zoomOut]), zoomIn: stats(raw.zoomIn), zoomOut: stats(raw.zoomOut),
    settle: stats(raw.settle), zoomAndSettle: stats([...raw.zoomIn, ...raw.zoomOut, ...raw.settle]), pan: stats(raw.pan),
    raw, phases, panBefore, panTrace, hiddenFrames: visibility.filter(v => v !== 'visible').length,
    unfocusedFrames: focus.filter(v => !v).length, actualLanguage: app.d.documentElement.lang,
    image: app.d.querySelector('.floor-svg').getAttribute('src'), environment: environment(), state: snapshot(app, true) };
}
let round = 0, busy = false, held;
async function performanceRun(smoke = false) {
  const env = environment();
  if (env.visibility !== 'visible' || !env.focus || !env.iframeFullyVisible) throw Error(`Invalid measurement environment: ${JSON.stringify(env)}`);
  if (!smoke) round++;
  const name = smoke ? 'smoke' : `round-${round}`, data = { commit: metadata.commit, environment: env, errors, trials: [] };
  const cases = [{ language: 'ja', floor: '1F' }, { language: 'en', floor: '1F' }, { language: 'ja', floor: '5F' }, { language: 'en', floor: '5F' }];
  if (!smoke && round % 2 === 0) cases.reverse();
  for (const c of (smoke ? cases.slice(0, 1) : cases)) {
    status.textContent = `${name}: ${c.language} ${c.floor} 計測中`;
    const app = await load(c.language, c.floor); await warm(app);
    data.trials.push({ ...c, round, ...await measure(app) }); await post(name + '-progress', data);
  }
  await post(name, data); status.textContent = `${name} 完了 / ${data.trials.map(t => `${t.language}${t.floor} ${t.zoom.fps.toFixed(1)}FPS`).join(' / ')}`;
  await load();
}
async function quality() {
  const app = await load(), initial = snapshot(app, true), set = app.w.setTimeout.bind(app.w), clear = app.w.clearTimeout.bind(app.w), pending = new Map();
  app.w.setTimeout = (callback, delay, ...args) => {
    if (Number(delay) === 140) { const id = set(() => {}, 2147483647); pending.set(id, { callback, args }); return id; }
    return set(callback, delay, ...args);
  };
  app.w.clearTimeout = id => { pending.delete(id); clear(id); };
  for (let i = 0; i < 23; i++) { wheel(app, -1); await raf(); } await raf();
  held = { app, set, clear, pending };
  await post('quality-moving', { environment: environment(), initial, state: snapshot(app, true), heldCallbacks: pending.size, errors });
  status.textContent = '23段階拡大中の状態を保持（画質撮影専用・FPSには含めない）';
}
async function stopQuality() {
  if (!held) return;
  const { app, set, clear, pending } = held; app.w.setTimeout = set; app.w.clearTimeout = clear;
  for (const [id, { callback, args }] of pending) { clear(id); set(callback, 140, ...args); }
  await sleep(1000); await raf(); await raf();
  await post('quality-stopped', { environment: environment(), state: snapshot(app, true), errors });
  held = undefined; status.textContent = '停止後の実寸描画を表示';
}
async function run(task) {
  if (busy) return; busy = true; document.querySelectorAll('button').forEach(b => b.disabled = true);
  try { await task(); } catch (e) { status.textContent = String(e); await post(`failure-${Date.now()}`, { error: String(e.stack ?? e), environment: environment(), errors }); }
  finally { busy = false; document.querySelectorAll('button').forEach(b => b.disabled = false); }
}
document.querySelector('#smoke').onclick = () => run(() => performanceRun(true));
document.querySelector('#round').onclick = () => run(() => performanceRun());
document.querySelector('#quality').onclick = () => run(quality);
document.querySelector('#stop').onclick = () => run(stopQuality);
document.querySelector('#demo').onclick = () => run(async () => { const app = await load(); await warm(app); status.textContent = 'デモ再生中'; for (let cycle = 0; cycle < 6; cycle++) for (const delta of [-1, 1]) { for (let i = 0; i < 24; i++) { wheel(app, delta); await raf(); } await sleep(300); } status.textContent = 'デモ完了'; });
await load();
await post('ready', { commit: metadata.commit, environment: environment(), errors });
status.textContent = `準備完了 / ${frame.clientWidth}×${frame.clientHeight} DPR ${devicePixelRatio}`;
