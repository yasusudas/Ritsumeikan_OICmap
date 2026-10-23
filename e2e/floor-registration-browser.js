// Runs inside the real app page. Expected transforms are read from the served
// floor SVG, independently of the viewer's coordinate-conversion functions.
export async function readRegistrationReference() {
  const image = document.querySelector('#canvas-layer img.floor-svg');
  const xml = new DOMParser().parseFromString(await (await fetch(image.src)).text(), 'image/svg+xml');
  if (xml.querySelector('parsererror')) throw new Error('Invalid served floor SVG');
  const root = xml.documentElement;
  const numbers = s => (s.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi) ?? []).map(Number);
  const patches = [...root.querySelectorAll('[data-alignment-region]')].map(group => {
    const clipId = group.querySelector('[clip-path]').getAttribute('clip-path').slice(5, -1);
    const p = numbers(xml.getElementById(clipId).querySelector('path').getAttribute('d'));
    const m = group.transform.baseVal.consolidate().matrix;
    return { id: group.dataset.alignmentRegion, bounds: p.slice(0, 4), matrix: [m.a, m.b, m.c, m.d, m.e, m.f] };
  });
  return { viewBox: numbers(root.getAttribute('viewBox')), patches, src: image.src };
}

export function auditRenderedRings({ reference, rings }) {
  const image = document.querySelector('#canvas-layer img.floor-svg'), box = image.getBoundingClientRect();
  const [, , width, height] = reference.viewBox;
  const scale = Math.min(box.width / width, box.height / height);
  const origin = [box.x + (box.width - width * scale) / 2, box.y + (box.height - height * scale) / 2];
  const identity = [1, 0, 0, 1, 0, 0];
  const errors = [];
  let maxCenter = 0, maxEdge = 0;
  for (const ring of rings) {
    const node = [...document.querySelectorAll('.facility-ring:not([data-registration-copy])')].find(n => n.dataset.ringId === ring.id);
    if (!node) throw new Error('Missing rendered ring ' + ring.id);
    const circle = node.querySelector('.facility-ring-line');
    if (circle.closest('defs') || getComputedStyle(circle).stroke === 'none') throw new Error('Ring is not directly rendered: ' + ring.id);
    const svg = node.closest('.facility-rings-svg');
    const x = ring.source[0] * width, y = ring.source[1] * height;
    const patch = reference.patches.find(p => x >= p.bounds[0] && y >= p.bounds[1] && x <= p.bounds[2] && y <= p.bounds[3]);
    const displayed = patch ? svg.querySelector(`[data-alignment-region="${patch.id}"] [data-ring-id="${ring.id}"] .facility-ring-line`) : circle;
    const matrix = displayed.getScreenCTM();
    const [a, b, c, d, e, f] = patch?.matrix ?? identity;
    const project = (x, y) => [origin[0] + (a * x + c * y + e) * scale, origin[1] + (b * x + d * y + f) * scale];
    const cx = circle.cx.baseVal.value, cy = circle.cy.baseVal.value, r = circle.r.baseVal.value;
    const center = new DOMPoint(cx, cy).matrixTransform(matrix), expected = project(x, y);
    const centerError = Math.hypot(center.x - expected[0], center.y - expected[1]);
    maxCenter = Math.max(maxCenter, centerError);
    const radius = ring.diameter * width / 2;
    let edgeError = 0;
    for (let i = 0; i < 16; i++) {
      const angle = i * Math.PI / 8, u = Math.cos(angle), v = Math.sin(angle);
      const actual = new DOMPoint(cx + r * u, cy + r * v).matrixTransform(matrix);
      const expected = project(x + radius * u, y + radius * v);
      edgeError = Math.max(edgeError, Math.hypot(actual.x - expected[0], actual.y - expected[1]));
    }
    maxEdge = Math.max(maxEdge, edgeError);
    if (centerError > .08 || edgeError > .08) errors.push({ id: ring.id, centerError, edgeError, expected, actual: [center.x, center.y], source: ring.source, box: [box.x, box.y, box.width, box.height], viewBox: reference.viewBox, style: node.style.cssText });
  }
  return { count: rings.length, maxCenter, maxEdge, errors };
}

export async function auditSearchOutlines({ reference, entries, language }) {
  const [, , width, height] = reference.viewBox;
  const identity = [1, 0, 0, 1, 0, 0];
  const report = { entries: 0, polygons: 0, vertices: 0, samples: 0, maxError: 0, maxClipError: 0, errors: [] };
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
  for (const entry of entries) {
    location.hash = entry.id;
    await frame();
    const start = performance.now();
    let svg;
    while (!(svg = document.querySelector(`.search-highlight-area[data-entry-id="${entry.id}"]`))) {
      if (performance.now() - start > 8000) throw new Error('Search selection timed out: ' + entry.id);
      await frame();
    }
    await frame();
    svg = document.querySelector(`.search-highlight-area[data-entry-id="${entry.id}"]`);
    if (!svg) throw new Error("Outline replaced before measurement: " + entry.id);
    const image = document.querySelector('#canvas-layer img.floor-svg'), box = image.getBoundingClientRect();
    const scale = Math.min(box.width / width, box.height / height);
    const origin = [box.x + (box.width - width * scale) / 2, box.y + (box.height - height * scale) / 2];
    if (svg.querySelector('use')) throw new Error('Search overlays must contain directly rendered geometry');
    const polygons = [...svg.querySelectorAll('.search-highlight-area-outline:not([data-registration-copy])')];
    if (polygons.some(p => p.closest('defs') || getComputedStyle(p).stroke === 'none')) throw new Error('Search outline is not directly rendered');
    if (polygons.length !== entry.outlines.length) throw new Error('Outline count changed: ' + entry.id);
    const groups = new Map([...svg.querySelectorAll('[data-alignment-region]')].map(n => [n.dataset.alignmentRegion, n]));
    for (const patch of reference.patches) {
      const group = groups.get(patch.id);
      if (!group) throw new Error('Missing outline transform ' + patch.id);
      const clipId = group.querySelector('[clip-path]').getAttribute('clip-path').slice(5, -1);
      const bounds = [...document.getElementById(clipId).querySelector('path').getAttribute('d').matchAll(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi)].map(m => Number(m[0]));
      const expected = [patch.bounds[0] / width * 1000, patch.bounds[1] / height * 1000, patch.bounds[2] / width * 1000, patch.bounds[3] / height * 1000];
      for (let i = 0; i < 4; i++) report.maxClipError = Math.max(report.maxClipError, Math.abs(bounds[i] - expected[i]));
    }
    for (let index = 0; index < polygons.length; index++) {
      const node = polygons[index], raw = entry.outlines[index];
      if (node.points.numberOfItems !== raw.length) throw new Error('Outline vertex count changed: ' + entry.id);
      for (let i = 0; i < raw.length; i++) {
        const p = node.points.getItem(i), next = node.points.getItem((i + 1) % raw.length);
        const expectedRaw = raw[i];
        if (Math.abs(p.x / 1000 - expectedRaw.xRatio) > .00000051 || Math.abs(p.y / 1000 - expectedRaw.yRatio) > .00000051) throw new Error('Original outline altered: ' + entry.id);
        report.vertices++;
        for (const t of [0, .25, .5, .75]) {
          const sourceX = (p.x + t * (next.x - p.x)) / 1000 * width;
          const sourceY = (p.y + t * (next.y - p.y)) / 1000 * height;
          const patch = reference.patches.find(p => sourceX >= p.bounds[0] && sourceY >= p.bounds[1] && sourceX <= p.bounds[2] && sourceY <= p.bounds[3]);
          const [a, b, c, d, e, f] = patch?.matrix ?? identity;
          const region = patch ? groups.get(patch.id) : svg.querySelector('[data-alignment-outside]');
          const displayed = region ? region.querySelector(`[data-registration-geometry="${node.dataset.registrationGeometry}"]`) : node;
          if (!displayed) throw new Error('Missing rendered outline instance: ' + entry.id);
          const actual = new DOMPoint(sourceX / width * 1000, sourceY / height * 1000).matrixTransform(displayed.getScreenCTM());
          const expected = [origin[0] + (a * sourceX + c * sourceY + e) * scale, origin[1] + (b * sourceX + d * sourceY + f) * scale];
          const error = Math.hypot(actual.x - expected[0], actual.y - expected[1]);
          report.maxError = Math.max(report.maxError, error);
          report.samples++;
          if (error > .08 && report.errors.length < 12) report.errors.push({ id: entry.id, index, i, t, error });
        }
      }
      report.polygons++;
    }
    report.entries++;
  }
  return report;
}

export function auditFacilityAreas({ reference, areas }) {
  const box = document.querySelector('#canvas-layer img.floor-svg').getBoundingClientRect();
  const [, , width, height] = reference.viewBox;
  const scale = Math.min(box.width / width, box.height / height);
  const origin = [box.x + (box.width - width * scale) / 2, box.y + (box.height - height * scale) / 2];
  const report = { polygons: 0, vertices: 0, maxError: 0, errors: [] };
  for (const area of areas) {
    const nodes = [...document.querySelectorAll(`.food-area[data-food-area="${area.id}"] .food-area-outline`)];
    if (nodes.length !== area.polygons.length) throw new Error('Missing facility area: ' + area.id);
    const pending = [...area.polygons];
    for (const node of nodes) {
      const actual = [...node.points].map(p => [p.x, p.y]);
      const index = pending.findIndex(poly => poly.length === actual.length && Math.abs((poly[0].xRatio + area.offset.xRatio) * 1000 - actual[0][0]) < .001 && Math.abs((poly[0].yRatio + area.offset.yRatio) * 1000 - actual[0][1]) < .001);
      if (index < 0) throw new Error('Facility polygon changed: ' + area.id);
      const polygon = pending.splice(index, 1)[0], matrix = node.getScreenCTM();
      for (let i = 0; i < polygon.length; i++) {
        const p = polygon[i], expected = [origin[0] + (p.xRatio + area.offset.xRatio) * width * scale, origin[1] + (p.yRatio + area.offset.yRatio) * height * scale];
        const actual = new DOMPoint(node.points.getItem(i).x, node.points.getItem(i).y).matrixTransform(matrix);
        const error = Math.hypot(actual.x - expected[0], actual.y - expected[1]);
        report.maxError = Math.max(report.maxError, error);
        if (error > .08 && report.errors.length < 12) report.errors.push({ id: area.id, i, error });
        report.vertices++;
      }
      report.polygons++;
    }
  }
  return report;
}
