// Experimental renderer only: original Dev camera/handlers and DOM overlays.
// PNG blocks contain the unoptimized SVG, including its original mask/filter.
import './canvas-block-adapter.css';

let canvas, context, last, queued = 0, active = 0, draws = 0, drawMs = 0, held = false;
const cache = new Map(), errors = [];
let requested = 0, loaded = 0, transferred = 0, current = {};
const MAX_IMAGES = 64, CONCURRENCY = 6;
const tileKey = (file, z, x, y) => `${file}/${z}/${x}/${y}`;
function evict() {
  const file = last && new URL(last.url, location.href).pathname.split('/').at(-1);
  // Keep the current floor's overview blocks available as fallback at every LOD.
  const ready = [...cache].filter(([, value]) => value.image);
  const removable = ready.filter(([key]) => !key.startsWith(`${file}/0/`));
  let count = ready.length;
  while (count > MAX_IMAGES && removable.length) { const [key] = removable.shift(); cache.delete(key); count--; }
}
function schedule() {
  if (!queued) queued = requestAnimationFrame(() => { queued = 0; if (last) paint(last); });
}
function get(file, z, x, y, request = true) {
  const key = tileKey(file, z, x, y), entry = cache.get(key);
  if (entry) { if (entry.image) { cache.delete(key); cache.set(key, entry); } return entry?.image; }
  if (!request || active >= CONCURRENCY) return;
  const item = { image: null }; cache.set(key, item); active++; requested++;
  const image = new Image(); image.decoding = 'async';
  image.onload = async () => {
    try { await image.decode(); item.image = image; loaded++; transferred += Number(image.dataset.bytes ?? 0); }
    catch (e) { errors.push(String(e)); }
    active--; evict(); schedule();
  };
  image.onerror = () => { active--; errors.push(image.src); schedule(); };
  image.src = `/tiles/${file}/${z}/${x}/${y}.png`;
}
function draw(image, z, x, y, view, sourceRegion) {
  const worldSize = 256 / 2 ** z, scale = view.width / 1024, dpr = devicePixelRatio;
  const left = Math.round((view.x + x * worldSize * scale) * dpr) / dpr;
  const right = Math.round((view.x + (x + 1) * worldSize * scale) * dpr) / dpr;
  const top = Math.round((view.y + y * worldSize * scale) * dpr) / dpr;
  const bottom = Math.round((view.y + (y + 1) * worldSize * scale) * dpr) / dpr;
  context.drawImage(image, ...(sourceRegion ?? [1, 1, 512, 512]), left, top, right - left, bottom - top);
}
function paint(view) {
  if (held) return;
  const start = performance.now(), width = canvas.clientWidth, height = canvas.clientHeight, dpr = devicePixelRatio;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0); context.fillStyle = '#fff'; context.fillRect(0, 0, width, height);
  const file = new URL(view.url, location.href).pathname.split('/').at(-1), scale = view.width / 1024;
  const z = Math.max(0, Math.min(4, Math.ceil(Math.log2(scale * dpr))));
  const worldSize = 256 / 2 ** z, worldHeight = 1024 * view.height / view.width;
  const maxX = Math.ceil(1024 / worldSize) - 1, maxY = Math.ceil(worldHeight / worldSize) - 1;
  const x0 = Math.max(0, Math.floor(-view.x / scale / worldSize)), x1 = Math.min(maxX, Math.floor((width - view.x) / scale / worldSize));
  const y0 = Math.max(0, Math.floor(-view.y / scale / worldSize)), y1 = Math.min(maxY, Math.floor((height - view.y) / scale / worldSize));
  let desired = 0, missing = 0, fallback = 0, blank = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    desired++;
    const image = get(file, z, x, y);
    if (image) { draw(image, z, x, y, view); continue; }
    missing++;
    let replacement;
    for (let ancestor = z - 1; ancestor >= 0; ancestor--) {
      const factor = 2 ** (z - ancestor), ax = Math.floor(x / factor), ay = Math.floor(y / factor);
      replacement = get(file, ancestor, ax, ay, false);
      if (replacement) { draw(replacement, z, x, y, view, [1 + (x % factor) * 512 / factor, 1 + (y % factor) * 512 / factor, 512 / factor, 512 / factor]); fallback++; break; }
    }
    if (!replacement) { blank++; if (z) get(file, 0, Math.floor(x / 2 ** z), Math.floor(y / 2 ** z)); }
  }
  draws++; drawMs += performance.now() - start;
  current = { z, desired, missing, fallback, blank, cacheImages: [...cache.values()].filter(v => v.image).length,
    decodedBytes: [...cache.values()].filter(v => v.image).reduce((sum, v) => sum + v.image.naturalWidth * v.image.naturalHeight * 4, 0),
    active, requested, loaded, draws, drawMs, transferred, width: canvas.width, height: canvas.height, file };
}
export function renderCanvasBlocks(view) {
  if (!view.width || !view.height || !view.url) return;
  if (!canvas) {
    const viewer = document.querySelector('#viewer'); viewer.classList.add('canvas-block-viewer');
    canvas = document.createElement('canvas'); canvas.className = 'canvas-block-floor'; canvas.setAttribute('aria-hidden', 'true'); viewer.prepend(canvas);
    context = canvas.getContext('2d', { alpha: false }); context.imageSmoothingQuality = 'high';
  }
  last = view; paint(view);
}
window.__canvasBlocks = { info: () => ({ ...current, ready: current.desired > 0 && current.missing === 0, errors: [...errors] }),
  hold: value => { held = value; if (!held && last) paint(last); },
  draw: target => target.getContext('2d').drawImage(canvas, 0, 0, target.width, target.height),
  clearCache: () => { cache.clear(); requested = 0; loaded = 0; drawMs = 0; draws = 0; schedule(); },
  get view() { return last; } };
