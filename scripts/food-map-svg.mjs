// SVG-native removal of the seven food pictograms, identified by geometry.
// Keeps compound-path leader dots, all labels, and the adjacent ATM intact.
const number = /[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g;
const arity = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

function arcPoints(x, y, values, relative) {
  let [rx, ry, rotation, large, sweep, ex, ey] = values;
  if (relative) {
    ex += x;
    ey += y;
  }
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (!rx || !ry || (ex === x && ey === y)) return [[ex, ey]];
  const angle = (rotation * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle);
  const px = (c * (x - ex)) / 2 + (s * (y - ey)) / 2,
    py = (-s * (x - ex)) / 2 + (c * (y - ey)) / 2;
  const scale = (px * px) / (rx * rx) + (py * py) / (ry * ry);
  if (scale > 1) {
    rx *= Math.sqrt(scale);
    ry *= Math.sqrt(scale);
  }
  const factor =
    (large === sweep ? -1 : 1) *
    Math.sqrt(
      Math.max(
        0,
        (rx * rx * ry * ry - rx * rx * py * py - ry * ry * px * px) /
          (rx * rx * py * py + ry * ry * px * px),
      ),
    );
  const cxp = (factor * rx * py) / ry,
    cyp = (-factor * ry * px) / rx;
  const cx = c * cxp - s * cyp + (x + ex) / 2,
    cy = s * cxp + c * cyp + (y + ey) / 2;
  const start = Math.atan2((py - cyp) / ry, (px - cxp) / rx);
  let delta = Math.atan2((-py - cyp) / ry, (-px - cxp) / rx) - start;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  return Array.from({ length: 129 }, (_, i) => {
    const t = start + (delta * i) / 128;
    return [
      cx + c * rx * Math.cos(t) - s * ry * Math.sin(t),
      cy + s * rx * Math.cos(t) + c * ry * Math.sin(t),
    ];
  });
}

export function pathSubpaths(d) {
  const tokens = d.match(number) || [];
  let i = 0,
    command = '',
    x = 0,
    y = 0,
    sx = 0,
    sy = 0,
    current = null;
  const result = [];
  const include = (px, py) => {
    current.points.push([px, py]);
  };
  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i])) command = tokens[i++];
    const upper = command.toUpperCase(),
      relative = command !== upper,
      n = arity[upper];
    if (n === undefined) throw Error(`Unsupported SVG command ${command}`);
    if (upper === 'Z') {
      x = sx;
      y = sy;
      if (current) current.commands.push('Z');
      command = '';
      continue;
    }
    const values = tokens.slice(i, i + n).map(Number);
    if (values.length < n || values.some((v) => !Number.isFinite(v)))
      throw Error('Invalid SVG path');
    i += n;
    if (upper === 'M') {
      x = values[0] + (relative ? x : 0);
      y = values[1] + (relative ? y : 0);
      sx = x;
      sy = y;
      current = { points: [], commands: [`M${x} ${y}`] };
      result.push(current);
      include(x, y);
      command = relative ? 'l' : 'L';
      continue;
    }
    if (!current) throw Error('Path without move');
    if (upper === 'H') {
      x = values[0] + (relative ? x : 0);
      include(x, y);
    } else if (upper === 'V') {
      y = values[0] + (relative ? y : 0);
      include(x, y);
    } else if (upper === 'A') {
      const nx = values[5] + (relative ? x : 0),
        ny = values[6] + (relative ? y : 0);
      arcPoints(x, y, values, relative).forEach(([px, py]) => include(px, py));
      x = nx;
      y = ny;
    } else {
      for (let k = 0; k < n; k += 2)
        include(
          values[k] + (relative ? x : 0),
          values[k + 1] + (relative ? y : 0),
        );
      x = values[n - 2] + (relative ? x : 0);
      y = values[n - 1] + (relative ? y : 0);
    }
    current.commands.push(command + values.join(' '));
  }
  return result.map((p) => ({
    ...p,
    d: p.commands.join(' '),
    bounds: bounds(p.points),
  }));
}

function bounds(points) {
  return {
    x: Math.min(...points.map((p) => p[0])),
    y: Math.min(...points.map((p) => p[1])),
    width:
      Math.max(...points.map((p) => p[0])) -
      Math.min(...points.map((p) => p[0])),
    height:
      Math.max(...points.map((p) => p[1])) -
      Math.min(...points.map((p) => p[1])),
  };
}
function attributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)].map((m) => [
      m[1],
      m[3],
    ]),
  );
}
function multiply(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
function matrix(value = '') {
  let result = [1, 0, 0, 1, 0, 0];
  for (const [, type, args] of value.matchAll(
    /(matrix|translate|scale)\(([^)]+)\)/g,
  )) {
    const v = args.trim().split(/[ ,]+/).map(Number);
    const next =
      type === 'matrix'
        ? v
        : type === 'translate'
          ? [1, 0, 0, 1, v[0], v[1] || 0]
          : [v[0], 0, 0, v[1] ?? v[0], 0, 0];
    result = multiply(result, next);
  }
  return result;
}
function transformed(box, m) {
  return bounds(
    [
      [box.x, box.y],
      [box.x + box.width, box.y],
      [box.x, box.y + box.height],
      [box.x + box.width, box.y + box.height],
    ].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]),
  );
}
function isWhite(fill) {
  return /100%\s*,\s*100%\s*,\s*100%|^#fff(?:fff)?$|^white$/i.test(fill || '');
}
function isBlack(fill) {
  return /13\.333|^#(?:221815|221f20|000000|000)$|^black$/i.test(fill || '');
}
function within(box, p, pad = 0.4) {
  const r = p.diameter / 2 + pad;
  return (
    box.x >= p.cx - r &&
    box.y >= p.cy - r &&
    box.x + box.width <= p.cx + r &&
    box.y + box.height <= p.cy + r
  );
}

export function removeFoodPictograms(svg, places, lang) {
  const pictograms = places
    .map((p) => p.legacyPictogram?.[lang])
    .filter(Boolean);
  const classes = new Map(
    [...svg.matchAll(/\.([\w-]+)\{[^}]*\bfill:([^;}]+)/g)].map((m) => [
      m[1],
      m[2],
    ]),
  );
  const definitions = new Map();
  for (const match of svg.matchAll(/<path\b[^>]*\bid="[^"]+"[^>]*\/?\s*>/g)) {
    const a = attributes(match[0]);
    if (a.d) definitions.set(a.id, pathSubpaths(a.d));
  }
  const edits = [],
    removed = new Set();
  const stack = [{ fill: null, matrix: [1, 0, 0, 1, 0, 0], defs: false }];
  for (const match of svg.matchAll(/<\/?[a-zA-Z][^>]*>/g)) {
    const tag = match[0],
      closing = tag.startsWith('</'),
      type = tag.match(/^<\/?([\w:]+)/)?.[1];
    if (closing) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const a = attributes(tag),
      parent = stack.at(-1);
    const fill =
      a.fill ||
      a.style?.match(/fill:([^;]+)/)?.[1] ||
      (a.class || '')
        .split(' ')
        .map((c) => classes.get(c))
        .filter(Boolean)
        .at(-1) ||
      parent.fill;
    const ctx = {
      fill,
      matrix: multiply(parent.matrix, matrix(a.transform)),
      defs: parent.defs || type === 'defs',
    };
    if (!tag.endsWith('/>')) stack.push(ctx);
    if (ctx.defs || !['path', 'use', 'circle'].includes(type)) continue;
    let parts = [],
      transform = ctx.matrix;
    if (type === 'path') parts = pathSubpaths(a.d || '');
    if (type === 'use') {
      parts =
        definitions.get((a['xlink:href'] || a.href || '').replace('#', '')) ||
        [];
      transform = multiply(transform, [
        1,
        0,
        0,
        1,
        Number(a.x) || 0,
        Number(a.y) || 0,
      ]);
    }
    if (type === 'circle')
      parts = [
        {
          bounds: {
            x: Number(a.cx) - Number(a.r),
            y: Number(a.cy) - Number(a.r),
            width: 2 * Number(a.r),
            height: 2 * Number(a.r),
          },
        },
      ];
    const discard = [];
    parts.forEach((part, index) => {
      const b = transformed(part.bounds, transform);
      const p = pictograms.find(
        (p) =>
          within(b, p) &&
          (isWhite(fill) ||
            (isBlack(fill) &&
              Math.abs(b.width - p.diameter) < 0.15 &&
              Math.abs(b.height - p.diameter) < 0.15 &&
              Math.abs(b.x + b.width / 2 - p.cx) < 0.06 &&
              Math.abs(b.y + b.height / 2 - p.cy) < 0.06)),
      );
      if (p) {
        discard.push(index);
        if (isBlack(fill)) removed.add(p);
      }
    });
    if (!discard.length) continue;
    let replacement = '';
    if (type === 'path' && discard.length < parts.length) {
      const keep = parts
        .filter((_, i) => !discard.includes(i))
        .map((p) => p.d)
        .join(' ');
      replacement = tag.replace(/\bd=(['"])[\s\S]*?\1/, `d="${keep}"`);
    }
    edits.push({
      start: match.index,
      end: match.index + tag.length,
      replacement,
    });
  }
  if (removed.size !== pictograms.length)
    throw Error(
      `${lang}: removed ${removed.size} of ${pictograms.length} food circles`,
    );
  let output = svg;
  for (const edit of edits.reverse())
    output =
      output.slice(0, edit.start) + edit.replacement + output.slice(edit.end);
  return output;
}
