import registration from './assets/floor-alignment.json' with { type: 'json' };

export const FLOOR_VIEWBOX = registration.viewBox;
const [, , WIDTH, HEIGHT] = FLOOR_VIEWBOX;
const IDENTITY = [1, 0, 0, 1, 0, 0];
const cache = new Map();

// Solve three non-collinear diagram landmarks in SVG user units. Keep the
// matrix (rather than rounded CSS pixels) as the shared map/overlay transform.
export function landmarkMatrix(source, target) {
  const [[x0, y0], [x1, y1], [x2, y2]] = source;
  const det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (Math.abs(det) < 1e-8) throw new Error('Collinear floor alignment landmarks');
  const fit = axis => {
    const u = target[1][axis] - target[0][axis], v = target[2][axis] - target[0][axis];
    const a = (u * (y2 - y0) - v * (y1 - y0)) / det;
    const b = ((x1 - x0) * v - (x2 - x0) * u) / det;
    return [a, b, target[0][axis] - a * x0 - b * y0];
  };
  const x = fit(0), y = fit(1);
  return [x[0], y[0], x[1], y[1], x[2], y[2]];
}

export function getFloorAlignment(floorId, language = 'ja') {
  const key = `${floorId}:${language}`;
  if (!cache.has(key)) cache.set(key, (registration.floors[floorId]?.[language] ?? []).map(patch => ({
    ...patch, matrix: landmarkMatrix(patch.source, patch.target),
  })));
  return cache.get(key);
}

export function transformPoint([a, b, c, d, e, f], x, y) {
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

const contains = ([left, top, right, bottom], x, y) => x >= left && x <= right && y >= top && y <= bottom;
export function alignFloorPoint(point, floorId, language = 'ja') {
  const x = point.xRatio * WIDTH, y = point.yRatio * HEIGHT;
  const patch = getFloorAlignment(floorId, language).find(p => contains(p.bounds, x, y));
  const matrix = patch?.matrix ?? IDENTITY;
  const mapped = transformPoint(matrix, x, y);
  return { xRatio: mapped.x / WIDTH, yRatio: mapped.y / HEIGHT, matrix, patch: patch?.id ?? null };
}

// Clip in the ORIGINAL frame before transforming, just like the served SVG.
// Splitting crossing polygons avoids bending an edge or leaving a search
// outline behind at the boundary between independently placed buildings.
function halfPlane(points, axis, value, greater) {
  const output = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i], q = points[(i + 1) % points.length];
    const pin = greater ? p[axis] >= value : p[axis] <= value;
    const qin = greater ? q[axis] >= value : q[axis] <= value;
    if (pin) output.push(p);
    if (pin !== qin) {
      const t = (value - p[axis]) / (q[axis] - p[axis]);
      const intersection = [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
      intersection[axis] = value;
      output.push(intersection);
    }
  }
  return output;
}
function hasArea(points) {
  return points.length >= 3 && Math.abs(points.reduce((area, p, i) => {
    const q = points[(i + 1) % points.length];
    return area + p[0] * q[1] - q[0] * p[1];
  }, 0)) > 1e-8;
}
function splitRectangle(points, [left, top, right, bottom]) {
  let inside = points;
  const outside = [];
  for (const [axis, edge, greater] of [[0, left, true], [0, right, false], [1, top, true], [1, bottom, false]]) {
    const piece = halfPlane(inside, axis, edge, !greater);
    if (hasArea(piece)) outside.push(piece);
    inside = halfPlane(inside, axis, edge, greater);
    if (!hasArea(inside)) break;
  }
  return { inside: hasArea(inside) ? inside : [], outside };
}

export function alignFloorPolygons(polygons, floorId, language = 'ja') {
  const patches = getFloorAlignment(floorId, language);
  if (!patches.length) return polygons;
  return polygons.flatMap(polygon => {
    let remaining = [polygon.map(p => [p.xRatio * WIDTH, p.yRatio * HEIGHT])];
    const output = [];
    for (const patch of patches) {
      const next = [];
      for (const points of remaining) {
        const split = splitRectangle(points, patch.bounds);
        if (split.inside.length) output.push(split.inside.map(p => transformPoint(patch.matrix, ...p)));
        next.push(...split.outside);
      }
      remaining = next;
    }
    output.push(...remaining.map(points => points.map(([x, y]) => ({ x, y }))));
    return output.map(points => points.map(({ x, y }) => ({ xRatio: x / WIDTH, yRatio: y / HEIGHT })));
  });
}

export function alignFloorLocation(result, floorId, language = 'ja') {
  const points = result.points.map(point => {
    const mapped = alignFloorPoint(point, floorId, language);
    const [a, b, c, d] = mapped.matrix, [u, v, w, z] = point.matrix;
    return { ...point, ...mapped, x: mapped.xRatio * WIDTH, y: mapped.yRatio * HEIGHT,
      matrix: [a * u + c * v, b * u + d * v, a * w + c * z, b * w + d * z] };
  });
  return { ...result, ...points[0], points };
}
