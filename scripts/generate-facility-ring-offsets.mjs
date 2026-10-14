// Regenerate from the floor SVGs; no manual English ring coordinates are needed.
// Requires Playwright. Optional PLAYWRIGHT_MODULE_PATH and CHROMIUM_EXECUTABLE_PATH
// can point at an existing installation without changing project dependencies.
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {})
});
const floors = {
  '1F': '1F.svg', '2F': '2F.svg', '3F': '3F.svg', '4F': '4F.svg', '5F': '5F.svg',
  'A-6-9F': '6F7F8F9F_BldgA.svg', 'H-6-9F': '6F7F8F9F_BldgH.svg'
};
function measureSvg() {
  const root = document.querySelector('svg');
  const box = (element) => {
    try {
      const bounds = element.getBBox();
      const matrix = root.getCTM().inverse().multiply(element.getCTM());
      const corners = [
        [bounds.x, bounds.y], [bounds.x + bounds.width, bounds.y],
        [bounds.x, bounds.y + bounds.height], [bounds.x + bounds.width, bounds.y + bounds.height]
      ].map(([x, y]) => [matrix.a * x + matrix.c * y + matrix.e, matrix.b * x + matrix.d * y + matrix.f]);
      const xs = corners.map(([x]) => x);
      const ys = corners.map(([, y]) => y);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
    } catch {
      return {};
    }
  };
  const rendered = (element) => !element.closest('defs,symbol,clipPath,mask');
  const all = [...root.querySelectorAll('use,path,circle,rect,ellipse,polygon')]
    .filter(rendered)
    .map((element) => ({ fill: getComputedStyle(element).fill, ...box(element) }))
    .filter((element) => element.w > 0);

  // Some disc outlines share one path with the icon's other contours. Resolve
  // relative moveto against the preceding contour before measuring each part.
  const splitPath = (path) => {
    const tokens = path.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) ?? [];
    const argumentCounts = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7 };
    const parts = [];
    let x = 0, y = 0, startX = 0, startY = 0, index = 0;
    let command = '', part = [];
    while (index < tokens.length) {
      if (/^[a-zA-Z]$/.test(tokens[index])) command = tokens[index++];
      const lower = command.toLowerCase();
      const relative = command === lower;
      if (lower === 'z') {
        part.push(command);
        x = startX;
        y = startY;
        command = '';
        continue;
      }
      const count = argumentCounts[lower];
      if (!count) throw new Error(`Unsupported path command ${command}`);
      const args = tokens.slice(index, index + count).map(Number);
      index += count;
      if (lower === 'm') {
        if (part.length) parts.push(part.join(' '));
        x = (relative ? x : 0) + args[0];
        y = (relative ? y : 0) + args[1];
        startX = x;
        startY = y;
        part = ['M', x, y];
        command = relative ? 'l' : 'L';
        continue;
      }
      part.push(command, ...args);
      if (lower === 'h') {
        x = (relative ? x : 0) + args[0];
      } else if (lower === 'v') {
        y = (relative ? y : 0) + args[0];
      } else {
        x = (relative ? x : 0) + args[count - 2];
        y = (relative ? y : 0) + args[count - 1];
      }
    }
    if (part.length) parts.push(part.join(' '));
    return parts;
  };
  const isDiscShape = (element) => element.w > 5 && element.w < 14 && Math.abs(element.w - element.h) < 0.4;
  for (const element of [...root.querySelectorAll('path')].filter(rendered)) {
    if (getComputedStyle(element).fill === 'rgb(255, 255, 255)') continue;
    const parts = splitPath(element.getAttribute('d') ?? '');
    if (parts.length < 2) continue;
    for (const path of parts) {
      const clone = element.cloneNode(false);
      clone.removeAttribute('id');
      clone.setAttribute('d', path);
      element.parentNode.append(clone);
      const disc = { fill: getComputedStyle(clone).fill, ...box(clone) };
      clone.remove();
      if (isDiscShape(disc) && !all.some((other) => other.fill === disc.fill &&
        Math.abs(other.cx - disc.cx) < 0.001 && Math.abs(other.cy - disc.cy) < 0.001 && Math.abs(other.w - disc.w) < 0.001)) {
        all.push(disc);
      }
    }
  }
  const discs = all.filter((element) => !['rgb(255, 255, 255)', 'none'].includes(element.fill) && isDiscShape(element));
  const whites = all.filter((element) => element.fill === 'rgb(255, 255, 255)' && element.w < 7.5 && element.h < 7.5);
  // Bilingual AEDs in the English SVGs use a red heart on white inside a red rim.
  const aedHearts = all.filter((element) => element.fill === 'rgb(164, 41, 49)' && element.w < 7.5 && element.h < 7.5);
  return {
    viewBox: root.getAttribute('viewBox').split(/\s+/).map(Number),
    discs: discs.map((disc) => ({
      ...disc,
      figs: (disc.fill === 'rgb(164, 41, 49)' ? [...whites, ...aedHearts] : whites)
        .filter((figure) => Math.abs(figure.cx - disc.cx) < disc.w * 0.3 && Math.abs(figure.cy - disc.cy) < disc.h * 0.3)
        .map(({ w, h }) => ({ w, h }))
    }))
  };
}

function classify(disc) {
  if (disc.w <= 7.9 || disc.w >= 10) return null;
  const scale = disc.w / 8.095;
  const has = (w, h) => disc.figs.some((f) => Math.abs(f.w / scale - w) < 0.12 && Math.abs(f.h / scale - h) < 0.15);
  if (['rgb(173, 24, 31)', 'rgb(165, 13, 5)'].includes(disc.fill) && [5.14, 6.04, 6.2].some((h) => has(2.66, h))) return ['toilet', 'red'];
  if (disc.fill === 'rgb(52, 95, 148)') {
    if (has(4.97, 5.66)) return ['toilet', 'yellow'];
    if ([5.01, 6.05].some((h) => has(2.55, h))) return ['toilet', 'blue'];
  }
  if (disc.fill === 'rgb(164, 41, 49)' && has(5.34, 5.04)) return ['aed', 'red'];
  if (!['rgb(34, 24, 21)', 'rgb(34, 31, 32)'].includes(disc.fill)) return null;
  // The bottle is split differently in each language. Include the second
  // contour to distinguish it from the similarly sized shop pictogram.
  if ((has(4.61, 5.66) && has(0.94, 1.05)) || (has(4.08, 4.59) && has(1.84, 1.73))) return ['nursingRoom', 'red'];
  if (has(5.22, 4.76)) return ['atm', 'red'];
  if (has(3.25, 4.61)) return ['waterServer', 'red'];
  if (has(3.08, 5.31)) return ['vendingMachine', 'red'];
  if ([3.73, 6.03].some((h) => has(3.75, h))) return ['elevator', 'red'];
  if ([2.33, 4.34].some((h) => has(4.91, h))) return ['stairs', 'red'];
  if (has(5.5, 4.4) || has(5.5, 3.86)) return ['escalator', 'red'];
  return null;
}

function pictograms(measurement) {
  const icons = [];
  for (const disc of measurement.discs) {
    const kind = classify(disc);
    if (!kind) continue;
    const duplicate = icons.find((icon) => icon.kind.join('/') === kind.join('/') && Math.hypot(icon.cx - disc.cx, icon.cy - disc.cy) < 1);
    if (duplicate) {
      // 5F contains overlapping copies of one stair icon. Use the visible union.
      const x0 = Math.min(duplicate.cx - duplicate.w / 2, disc.cx - disc.w / 2);
      const x1 = Math.max(duplicate.cx + duplicate.w / 2, disc.cx + disc.w / 2);
      const y0 = Math.min(duplicate.cy - duplicate.h / 2, disc.cy - disc.h / 2);
      const y1 = Math.max(duplicate.cy + duplicate.h / 2, disc.cy + disc.h / 2);
      Object.assign(duplicate, { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 });
    } else {
      icons.push({ ...disc, kind });
    }
  }
  return icons;
}

const round = (value) => Number(value.toFixed(6));
const output = {};
try {
  for (const [floorId, file] of Object.entries(floors)) {
    const maps = {};
    const hashes = {};
    for (const lang of ['ja', 'en']) {
      const url = new URL(`../src/assets/floors/${lang}/${file}`, import.meta.url);
      hashes[lang] = createHash('sha256').update(await readFile(url)).digest('hex');
      const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
      // A standalone SVG avoids HTML quirks-mode collisions between .B and .b.
      await page.goto(url.href);
      maps[lang] = await page.evaluate(measureSvg);
      await page.close();
    }
    const ja = pictograms(maps.ja);
    const en = pictograms(maps.en);
    if (ja.length !== en.length) throw new Error(`${floorId}: Japanese/English pictogram counts differ`);
    const used = new Set();
    const points = {};
    const viewBox = maps.ja.viewBox;
    const enViewBox = maps.en.viewBox;
    ja.sort((a, b) => a.kind.join('/').localeCompare(b.kind.join('/'), 'en') || a.cy - b.cy || a.cx - b.cx);
    for (const icon of ja) {
      const distance = (other) => Math.hypot(icon.cx - viewBox[0] - (other.cx - enViewBox[0]), icon.cy - viewBox[1] - (other.cy - enViewBox[1]));
      const candidates = en.filter((other) => other.kind.join('/') === icon.kind.join('/')).sort((a, b) => distance(a) - distance(b));
      const match = candidates[0];
      // The 1F bilingual AED is shifted by 2.49 SVG units; visually verified.
      const maxDistance = icon.kind[0] === 'aed' ? 3 : 2;
      // Distinct nearest neighbors realize the sum of all per-row minima, so this
      // is also the minimum-cost one-to-one assignment. Stop on any ambiguity.
      if (!match || used.has(match) || distance(match) > maxDistance || (candidates[1] && distance(candidates[1]) <= maxDistance)) {
        throw new Error(`${floorId} ${icon.kind}: ambiguous or distant pictogram; inspect the SVGs`);
      }
      used.add(match);
      const x = round((icon.cx - viewBox[0]) / viewBox[2]);
      const y = round((icon.cy - viewBox[1]) / viewBox[3]);
      const ex = round((match.cx - enViewBox[0]) / enViewBox[2]);
      const ey = round((match.cy - enViewBox[1]) / enViewBox[3]);
      const [facility, color] = icon.kind;
      // Japanese anchor, English offset, then each language's disc diameter
      // normalized against its own viewBox width.
      ((points[facility] ??= {})[color] ??= []).push([
        x, y, round(ex - x), round(ey - y),
        round(icon.w / viewBox[2]), round(match.w / enViewBox[2])
      ]);
    }
    output[floorId] = { file, viewBox, svgSha256: hashes, points };
    console.log(`${floorId}: ${ja.length} pictograms`);
  }
  const target = new URL('../src/assets/facility-ring-offsets.json', import.meta.url);
  const generated = JSON.stringify(output, null, 2) + '\n';
  const current = await readFile(target, 'utf8').catch(() => null);
  if (process.argv.includes('--check')) {
    if (current !== generated) throw new Error('Pictogram offsets need regeneration');
    console.log('Pictogram offsets are current');
  } else if (current !== generated) {
    await writeFile(target, generated);
    console.log(`Updated ${fileURLToPath(target)}`);
  } else {
    console.log('Pictogram offsets are unchanged');
  }
} finally {
  await browser.close();
}
