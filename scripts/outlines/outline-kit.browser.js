// Outline kit: helpers for tracing search outlines (entry.outlines) from a floor SVG.
//
// Open a floor SVG straight from the dev server, e.g.
//   http://localhost:5173/src/assets/floors/ja/1F.svg
// paste this whole file into the page (browser console, or the browser tool's
// JavaScript runner), then use `await OK.init('1F')`. Everything is in SVG user units
// (the viewBox space); OK.toRatio() converts to the 0-1 ratios stored in
// public/manual-search-index.json. See docs/search-outlines-runbook.md.
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.documentElement;
  const originalViewBox = svg.getAttribute('viewBox');
  const [vbX, vbY, vbW, vbH] = originalViewBox.trim().split(/[\s,]+/).map(Number);
  // Fills that are text, pictogram ink or white glyph parts, never rooms.
  const GLYPH_FILLS = new Set(['rgb(34, 24, 21)', 'rgb(34, 31, 32)', 'rgb(255, 255, 255)']);

  // Path data -> subpaths of absolute points. Curves keep their end points plus three
  // samples, which is enough for room shapes (rooms are drawn with straight lines).
  function parsePath(d) {
    const toks = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || [];
    let i = 0, cmd = null, x = 0, y = 0, sx = 0, sy = 0, cur = null;
    const subs = [];
    const num = () => parseFloat(toks[i++]);
    while (i < toks.length) {
      if (/^[a-zA-Z]$/.test(toks[i])) cmd = toks[i++];
      const rel = cmd === cmd.toLowerCase();
      const C = cmd.toUpperCase();
      if (C === 'Z') { x = sx; y = sy; cur = null; continue; }
      if (C === 'M') {
        let nx = num(), ny = num();
        if (rel) { nx += x; ny += y; }
        x = nx; y = ny; sx = x; sy = y;
        cur = { pts: [[x, y]] }; subs.push(cur);
        cmd = rel ? 'l' : 'L';
        continue;
      }
      if (!cur) { cur = { pts: [[x, y]] }; subs.push(cur); sx = x; sy = y; }
      if (C === 'L') { let nx = num(), ny = num(); if (rel) { nx += x; ny += y; } x = nx; y = ny; cur.pts.push([x, y]); }
      else if (C === 'H') { let nx = num(); if (rel) nx += x; x = nx; cur.pts.push([x, y]); }
      else if (C === 'V') { let ny = num(); if (rel) ny += y; y = ny; cur.pts.push([x, y]); }
      else if (C === 'C' || C === 'S' || C === 'Q' || C === 'T') {
        const n = C === 'C' ? 6 : (C === 'S' || C === 'Q') ? 4 : 2;
        const a = [];
        for (let k = 0; k < n; k++) a.push(num());
        if (rel) for (let k = 0; k < n; k += 2) { a[k] += x; a[k + 1] += y; }
        const ex = a[n - 2], ey = a[n - 1];
        if (C === 'C') {
          for (const t of [0.25, 0.5, 0.75]) {
            const mt = 1 - t;
            cur.pts.push([
              mt ** 3 * x + 3 * mt * mt * t * a[0] + 3 * mt * t * t * a[2] + t ** 3 * ex,
              mt ** 3 * y + 3 * mt * mt * t * a[1] + 3 * mt * t * t * a[3] + t ** 3 * ey
            ]);
          }
        }
        x = ex; y = ey; cur.pts.push([x, y]);
      } else if (C === 'A') {
        const a = [num(), num(), num(), num(), num(), num(), num()];
        let nx = a[5], ny = a[6];
        if (rel) { nx += x; ny += y; }
        x = nx; y = ny; cur.pts.push([x, y]);
      } else { i++; }
    }
    return subs;
  }

  const area = (pts) => {
    let s = 0;
    for (let k = 0; k < pts.length; k++) {
      const [x1, y1] = pts[k], [x2, y2] = pts[(k + 1) % pts.length];
      s += x1 * y2 - x2 * y1;
    }
    return Math.abs(s) / 2;
  };
  const bbox = (pts) => {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };
  const pip = ([px, py], poly) => {
    let inside = false;
    for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
      const [xi, yi] = poly[a], [xj, yj] = poly[b];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const round2 = (v) => +v.toFixed(2);
  const fmt = (p) => `${p.fill.replace('rgb', '')} a=${Math.round(p.area)} bb=${p.bb.map(round2)} n=${p.pts.length}`;

  // Every filled subpath, from <path> and from <use> (the SVGs reuse shapes through <use>).
  function collectFills() {
    svg.setAttribute('viewBox', originalViewBox);
    const rootInv = svg.getCTM().inverse();
    const fills = [];
    document.querySelectorAll('path, use').forEach((el) => {
      if (el.closest('defs, clipPath, mask, #outline-kit-overlay')) return;
      let pathEl = el, m;
      if (el.tagName === 'use') {
        const id = (el.getAttribute('href') || el.getAttribute('xlink:href') || '').slice(1);
        pathEl = document.getElementById(id);
        if (!pathEl || pathEl.tagName !== 'path') return;
        m = rootInv.multiply(el.getCTM()).translate(+el.getAttribute('x') || 0, +el.getAttribute('y') || 0);
      } else {
        m = rootInv.multiply(el.getCTM());
      }
      const fill = getComputedStyle(el).fill;
      if (fill === 'none') return;
      parsePath(pathEl.getAttribute('d')).forEach((sp) => {
        if (sp.pts.length < 3) return;
        const pts = sp.pts.map(([x, y]) => {
          const q = new DOMPoint(x, y).matrixTransform(m);
          return [q.x, q.y];
        });
        const a = area(pts);
        if (a > 5) fills.push({ fill, pts, area: a, bb: bbox(pts) });
      });
    });
    return fills;
  }

  // Straight horizontal / vertical pieces of every stroked path: room dividers, dotted
  // area borders, white partition lines and leader lines.
  function collectStrokes() {
    svg.setAttribute('viewBox', originalViewBox);
    const rootInv = svg.getCTM().inverse();
    const strokes = [];
    document.querySelectorAll('path').forEach((el) => {
      if (el.closest('defs, clipPath, mask, #outline-kit-overlay')) return;
      const cs = getComputedStyle(el);
      if (cs.stroke === 'none') return;
      const m = rootInv.multiply(el.getCTM());
      const length = el.getTotalLength();
      const steps = Math.max(2, Math.min(4000, Math.ceil(length / 0.25)));
      const pts = [];
      for (let k = 0; k <= steps; k++) {
        const p = el.getPointAtLength((length * k) / steps).matrixTransform(m);
        pts.push([p.x, p.y]);
      }
      let run = null;
      const flush = () => { if (run) { strokes.push({ stroke: cs.stroke, width: cs.strokeWidth, dash: cs.strokeDasharray, from: run[0], to: run[1] }); run = null; } };
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1], b = pts[k];
        const horizontal = Math.abs(a[1] - b[1]) < 0.01, vertical = Math.abs(a[0] - b[0]) < 0.01;
        const jump = Math.hypot(a[0] - b[0], a[1] - b[1]) > 1; // a moveto inside the path
        if ((horizontal || vertical) && !jump) {
          if (run && ((horizontal && Math.abs(run[0][1] - b[1]) < 0.01) || (vertical && Math.abs(run[0][0] - b[0]) < 0.01))) run[1] = b;
          else { flush(); run = [a, b]; }
        } else flush();
      }
      flush();
    });
    return strokes.filter((s) => Math.hypot(s.from[0] - s.to[0], s.from[1] - s.to[1]) > 0.3);
  }

  // Rectilinear union on a coordinate grid. Cells narrower than `gap` that sit between
  // two filled cells are filled too, so rooms split by a thin wall merge into one shape.
  function union(polys, gap = 1.6) {
    const xs = [...new Set(polys.flatMap((p) => p.map((q) => +q[0].toFixed(3))))].sort((a, b) => a - b);
    const ys = [...new Set(polys.flatMap((p) => p.map((q) => +q[1].toFixed(3))))].sort((a, b) => a - b);
    const nx = xs.length - 1, ny = ys.length - 1;
    const f = [...Array(ny)].map(() => Array(nx).fill(false));
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const c = [(xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2];
      f[j][i] = polys.some((p) => pip(c, p));
    }
    for (let pass = 0; pass < 2; pass++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (f[j][i]) continue;
      if (xs[i + 1] - xs[i] < gap && i > 0 && i < nx - 1 && f[j][i - 1] && f[j][i + 1]) f[j][i] = true;
      else if (ys[j + 1] - ys[j] < gap && j > 0 && j < ny - 1 && f[j - 1][i] && f[j + 1][i]) f[j][i] = true;
    }
    const edges = new Map();
    const key = (p) => p.join(',');
    const add = (a, b) => edges.set(key(a), (edges.get(key(a)) || []).concat([b]));
    const F = (j, i) => j >= 0 && j < ny && i >= 0 && i < nx && f[j][i];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (!f[j][i]) continue;
      const x0 = xs[i], x1 = xs[i + 1], y0 = ys[j], y1 = ys[j + 1];
      if (!F(j - 1, i)) add([x0, y0], [x1, y0]);
      if (!F(j, i + 1)) add([x1, y0], [x1, y1]);
      if (!F(j + 1, i)) add([x1, y1], [x0, y1]);
      if (!F(j, i - 1)) add([x0, y1], [x0, y0]);
    }
    const loops = [];
    while (edges.size) {
      const [startKey] = edges.keys();
      const start = startKey.split(',').map(Number);
      let cur = start;
      const loop = [cur];
      for (;;) {
        const k = key(cur);
        const nexts = edges.get(k);
        if (!nexts || !nexts.length) break;
        const next = nexts.shift();
        if (!nexts.length) edges.delete(k);
        cur = next;
        if (key(cur) === key(start)) break;
        loop.push(cur);
      }
      loops.push(loop.filter((p, i) => {
        const a = loop[(i - 1 + loop.length) % loop.length], b = loop[(i + 1) % loop.length];
        return !((a[0] === p[0] && p[0] === b[0]) || (a[1] === p[1] && p[1] === b[1]));
      }));
    }
    const signed = (pts) => pts.reduce((s, [x1, y1], k) => { const [x2, y2] = pts[(k + 1) % pts.length]; return s + x1 * y2 - x2 * y1; }, 0) / 2;
    return loops.filter((l) => signed(l) > 0); // outer boundaries only
  }

  // Sutherland-Hodgman: keep the part of `poly` inside the rectangle x0..x1, y0..y1.
  function clip(poly, x0, y0, x1, y1) {
    const edge = (pts, inside, cross) => {
      const out = [];
      pts.forEach((cur, i) => {
        const prev = pts[(i - 1 + pts.length) % pts.length];
        if (inside(cur)) { if (!inside(prev)) out.push(cross(prev, cur)); out.push(cur); }
        else if (inside(prev)) out.push(cross(prev, cur));
      });
      return out;
    };
    const atX = (X) => (a, b) => [X, a[1] + ((b[1] - a[1]) * (X - a[0])) / (b[0] - a[0])];
    const atY = (Y) => (a, b) => [a[0] + ((b[0] - a[0]) * (Y - a[1])) / (b[1] - a[1]), Y];
    let out = poly;
    out = edge(out, (p) => p[0] >= x0, atX(x0));
    out = edge(out, (p) => p[0] <= x1, atX(x1));
    out = edge(out, (p) => p[1] >= y0, atY(y0));
    out = edge(out, (p) => p[1] <= y1, atY(y1));
    return out;
  }

  const OK = {
    viewBox: { x: vbX, y: vbY, width: vbW, height: vbH },
    fills: [],
    strokes: [],
    entries: [],
    pip, area, bbox, union, clip,
    rect: (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]],

    // Parse the SVG and load this floor's search entries from the dev server.
    async init(floorId) {
      this.fills = collectFills();
      this.strokes = collectStrokes();
      const data = await fetch('/@rits-oic-search-data/search-entries.json').then((r) => r.json());
      this.entries = data.entries.filter((e) => e.floorId === floorId);
      return `${floorId}: ${this.fills.length} fills, ${this.strokes.length} straight stroke pieces, ${this.entries.length} entries`;
    },

    // Ratio point <-> SVG point. Ratios are measured from the viewBox origin
    // (H-6-9F starts at x = 8.5).
    toSvg: ([xr, yr]) => [vbX + xr * vbW, vbY + yr * vbH],
    toRatio: ([x, y]) => [+((x - vbX) / vbW).toFixed(6), +((y - vbY) / vbH).toFixed(6)],
    polygonToRatios(poly) { return poly.map((p) => this.toRatio(p)); },

    // The pin of an entry (centre of rects[0]) in SVG units.
    pin(entry) {
      const r = entry.rects[0];
      return this.toSvg([r.xRatio + r.widthRatio / 2, r.yRatio + r.heightRatio / 2]);
    },
    entry(label) { return this.entries.filter((e) => e.label === label || e.id === label); },

    // Filled shapes containing a point, smallest first.
    at(x, y, { minArea = 5 } = {}) {
      return this.fills.filter((p) => p.area >= minArea && pip([x, y], p.pts)).sort((a, b) => a.area - b.area);
    },
    describeAt(x, y) { return this.at(x, y).slice(0, 5).map(fmt); },

    // The room under a point: the smallest fill in the size range that is not text or icon ink.
    pick(x, y, { minArea = 60, maxArea = 10000 } = {}) {
      return this.at(x, y).find((p) => p.area >= minArea && p.area <= maxArea && !GLYPH_FILLS.has(p.fill)) ?? null;
    },

    // Straight stroke pieces touching a box. Filter by colour, e.g. 'rgb(220, 221, 221)'
    // (room dividers), 'rgb(255, 255, 255)' (white partitions), 'rgb(34, 24, 21)' (leader lines).
    strokesIn(x0, y0, x1, y1, color = null) {
      return this.strokes
        .filter((s) => (!color || s.stroke === color))
        .filter((s) => Math.max(s.from[0], s.to[0]) >= x0 && Math.min(s.from[0], s.to[0]) <= x1 && Math.max(s.from[1], s.to[1]) >= y0 && Math.min(s.from[1], s.to[1]) <= y1)
        .map((s) => `${s.stroke.replace('rgb', '')} w=${s.width} dash=${s.dash} ${s.from.map(round2)} -> ${s.to.map(round2)}`);
    },

    // First-pass outline for every entry that has none yet: the room under its pin.
    // Returns { auto: {id: [polygon]}, report: [...] } for review; nothing is written.
    autoPick({ skipIds = new Set() } = {}) {
      const auto = {}, report = [];
      for (const e of this.entries) {
        if (skipIds.has(e.id) || e.outlines?.length) continue;
        const pin = this.pin(e);
        const hit = this.pick(...pin);
        const sharedWith = hit ? this.entries.filter((o) => o !== e && pip(this.pin(o), hit.pts)).map((o) => o.label) : [];
        if (hit) auto[e.id] = [hit.pts];
        report.push(`${e.label}${e.locationHint ? `(${e.locationHint})` : ''} pin=${pin.map(round2)} -> ${hit ? fmt(hit) : 'NONE'}${sharedWith.length ? ` SHARED with ${sharedWith.join(', ')}` : ''}`);
      }
      return { auto, report };
    },

    // Room-coloured fills that no pin, outline or hover area covers: candidates for
    // places named on the map but missing from search. Check each one by eye.
    unmatched({ minArea = 120, maxArea = 20000 } = {}) {
      const toPts = (poly) => poly.map((p) => this.toSvg([p.xRatio, p.yRatio]));
      const pins = this.entries.map((e) => this.pin(e));
      const covers = this.entries.flatMap((e) => [...(e.outlines || []), ...(e.polygons || [])].map(toPts));
      const base = /rgb\((220, 221, 221|201, 202, 202|137, 137, 137|159, 160, 160|247, 248, 248|237, 225, 203|62, 58, 57)\)/;
      return this.fills
        .filter((p) => p.area >= minArea && p.area <= maxArea && !GLYPH_FILLS.has(p.fill) && !base.test(p.fill))
        .filter((p) => {
          const c = [(p.bb[0] + p.bb[2]) / 2, (p.bb[1] + p.bb[3]) / 2];
          return !pins.some((pt) => pip(pt, p.pts)) && !covers.some((o) => pip(c, o));
        })
        .map((p, i) => ({ name: `U${i}`, ...p }));
    },

    // Overlay for review: map {id: [polygon]} drawn in red, plus blue pins and labels.
    draw(outlinesById = {}, { pins = true, labels = true, extra = [] } = {}) {
      this.clear();
      const g = document.createElementNS(NS, 'g');
      g.id = 'outline-kit-overlay';
      svg.append(g);
      const poly = (pts, style) => {
        const n = document.createElementNS(NS, 'polygon');
        n.setAttribute('points', pts.map((p) => p.join(',')).join(' '));
        n.setAttribute('style', style);
        g.append(n);
      };
      Object.values(outlinesById).forEach((polys) => polys.forEach((pts) => poly(pts, 'fill:rgba(155,27,48,0.18);stroke:#9b1b30;stroke-width:0.8')));
      extra.forEach((pts) => poly(pts, 'fill:rgba(255,140,0,0.25);stroke:#ff8c00;stroke-width:0.8;stroke-dasharray:2 1'));
      if (pins) this.entries.forEach((e, idx) => {
        const [x, y] = this.pin(e);
        const c = document.createElementNS(NS, 'circle');
        c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 1.4);
        c.setAttribute('style', 'fill:#00f;stroke:#fff;stroke-width:0.4');
        g.append(c);
        if (labels) {
          const t = document.createElementNS(NS, 'text');
          t.setAttribute('x', x + 1.6); t.setAttribute('y', y - 1.6);
          t.setAttribute('style', 'font:bold 3.5px sans-serif;fill:#00f;paint-order:stroke;stroke:#fff;stroke-width:0.6');
          t.textContent = idx;
          g.append(t);
        }
      });
      return `${g.childElementCount} overlay nodes`;
    },
    // Draw every stored outline of this floor (what the app will show).
    drawStored(opts) {
      const map = {};
      this.entries.forEach((e) => { if (e.outlines?.length) map[e.id] = e.outlines.map((poly) => poly.map((p) => this.toSvg([p.xRatio, p.yRatio]))); });
      return this.draw(map, opts);
    },
    clear() { document.getElementById('outline-kit-overlay')?.remove(); },
    hideOverlay(hidden = true) { const g = document.getElementById('outline-kit-overlay'); if (g) g.style.display = hidden ? 'none' : ''; },

    // Zoom the page to a part of the floor (SVG units) for screenshots; reset() restores.
    view(x, y, w, h) {
      svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      return `${innerWidth}x${innerHeight}`;
    },
    reset() { return this.view(vbX, vbY, vbW, vbH); },

    // Index number of each entry, as drawn by draw() / drawStored().
    index() { return this.entries.map((e, i) => `${i} ${e.label}${e.locationHint ? `(${e.locationHint})` : ''}${e.outlines?.length ? ` [${e.outlines.length}]` : ''}`); }
  };

  window.OK = OK;
  return 'OutlineKit ready: await OK.init(floorId)';
})();
