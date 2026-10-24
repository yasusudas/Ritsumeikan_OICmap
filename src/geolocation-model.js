// Trial georeference, 2026-10-23. OSM building corners were matched to the
// original Japanese 1F SVG (viewBox 1190.55 x 841.89). See docs/gps-trial.md.
import calibration from './assets/gps-calibration.json' with { type: 'json' };
import footprints from './assets/gps-building-footprints.json' with { type: 'json' };

export const GEOREFERENCE = calibration.georeference;

export const METERS_PER_LATITUDE = 111320;
export const METERS_PER_LONGITUDE = METERS_PER_LATITUDE * Math.cos(GEOREFERENCE.latitude * Math.PI / 180);

// Radius of the smallest screen-space circle enclosing the projected accuracy
// ellipse. Use the largest singular value, so making it round never shrinks
// the device's uncertainty along the more stretched map direction.
export function accuracyCircleRadius(matrix, accuracy, scaleX = 1, scaleY = 1) {
  const [a, b, c, d] = matrix.map((value, i) => value * (i % 2 ? scaleY : scaleX));
  const xx = a * a + c * c, yy = b * b + d * d, xy = a * b + c * d;
  return accuracy * Math.sqrt((xx + yy + Math.hypot(xx - yy, 2 * xy)) / 2);
}

// Match the same lift cores / AS wing corner across the floor drawings.
// H coordinates are relative to its viewBox origin (8.5, 0), like search data.
// Each upper-floor sheet contains four separate drawings of the same location.
function alignTriangle(source, target) {
  const [[x1, y1], [x2, y2], [x3, y3]] = source;
  const determinant = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
  const dx = [(y2 - y3) / determinant, (y3 - y1) / determinant, (y1 - y2) / determinant];
  const dy = [(x3 - x2) / determinant, (x1 - x3) / determinant, (x2 - x1) / determinant];
  const offset = [1 - dx[0] * x1 - dy[0] * y1, -dx[1] * x1 - dy[1] * y1, -dx[2] * x1 - dy[2] * y1];
  const sum = (weights, axis) => weights.reduce((value, weight, i) => value + weight * target[i][axis], 0);
  return [sum(dx, 0), sum(dx, 1), sum(dy, 0), sum(dy, 1), sum(offset, 0), sum(offset, 1)];
}

// Least-squares affine fit. Center the coordinates to avoid an ill-conditioned
// normal matrix; validation landmarks are deliberately not passed to this fit.
function alignPoints(source, target) {
  const origin = [0, 1].map(axis => source.reduce((sum, p) => sum + p[axis], 0) / source.length);
  const rows = source.map(([x, y]) => [x - origin[0], y - origin[1], 1]);
  const fit = axis => {
    const matrix = [0, 1, 2].map(i => [0, 1, 2].map(j => rows.reduce((sum, r) => sum + r[i] * r[j], 0))
      .concat(rows.reduce((sum, r, k) => sum + r[i] * target[k][axis], 0)));
    for (let i = 0; i < 3; i++) {
      const divisor = matrix[i][i];
      matrix[i] = matrix[i].map(value => value / divisor);
      for (let j = 0; j < 3; j++) if (j !== i) {
        const factor = matrix[j][i];
        matrix[j] = matrix[j].map((value, k) => value - factor * matrix[i][k]);
      }
    }
    const [a, b, c] = matrix.map(row => row[3]);
    return [a, b, c - a * origin[0] - b * origin[1]];
  };
  const x = fit(0), y = fit(1);
  return [x[0], y[0], x[1], y[1], x[2], y[2]];
}

// Ordinary floor SVGs, rings and search regions are already registered to 1F.
// GPS enters that common frame directly; it must not use raw-floor registration.
const commonFrame = [[1, 0, 0, 1, 0, 0]];
const aCores = [[645.77, 240.73], [736.4, 403.35], [854.94, 403.35]];
const hCores = [[123.03, 342.15], [442.24, 343.83], [196.92, 411.32]];
const floorTransforms = {
  '1F': commonFrame,
  '2F': commonFrame,
  '3F': commonFrame,
  '4F': commonFrame,
  '5F': commonFrame,
  'A-6-9F': [
    [[178.59, 176.441], [287.7, 364.95], [431.74, 364.95]],
    [[180.883, 492.204], [289.88, 674.51], [429.41, 674.50]],
    [[663.066, 181.786], [772.06, 364.04], [911.60, 364.04]],
    [[663.121, 492.410], [771.81, 674.51], [912.46, 674.50]],
  ].map(target => alignTriangle(aCores, target)),
  'H-6-9F': [
    [[94.33, 230.65], [500.06, 232.50], [191.61, 318.46], [88.38, 218.31]],
    [[94.33, 508.99], [500.06, 510.85], [191.61, 596.81], [88.38, 496.66]],
    [[689.61, 230.59], [1095.33, 232.44], [786.89, 318.40], [683.65, 218.25]],
    [[689.61, 508.94], [1095.33, 510.79], [786.89, 596.75], [683.65, 496.60]],
  ].map(target => alignPoints([...hCores, [116.668, 332.410]], target)),
};

const aStairSource = [934.34, 423.605];
const aStairTargets = [[499.426, 377.898], [495.582, 689.172], [977.768, 378.709], [977.932, 689.172]];
const aTipSource = [921.097, 249.426];
const aTipTargets = [[511.894, 178.750], [508.160, 492.200], [990.390, 181.778], [990.394, 492.410]];

// A's AN end of the concourse is drawn with a different spacing from 1F.
// Blend that area's measured stair and outer-corner residuals. Keep the lift
// cores and AS wing unchanged; a whole-building refit worsened held-out points.
// The returned Jacobian also transforms the device accuracy circle.
export function projectFloorDrawing(x, y, floorId, index = 0, transform = floorTransforms[floorId]?.[index]) {
  if (!transform) return null;
  let [a, b, c, d, e, f] = transform;
  let pointX = a * x + c * y + e, pointY = b * x + d * y + f;
  if (floorId === 'A-6-9F') {
    const left = aCores[2][0], top = 359.891;
    const base = [a, b, c, d];
    for (const [source, target] of [[aStairSource, aStairTargets[index]], [aTipSource, aTipTargets[index]]]) {
      const width = source[0] - left, height = source[1] - top;
      const rawU = (x - left) / width, rawV = (y - top) / height;
      const u = Math.max(0, Math.min(1, rawU)), v = Math.max(0, Math.min(1, rawV));
      const du = rawU > 0 && rawU < 1 ? 1 / width : 0;
      const dv = rawV > 0 && rawV < 1 ? 1 / height : 0;
      const dx = target[0] - (base[0] * source[0] + base[2] * source[1] + e);
      const dy = target[1] - (base[1] * source[0] + base[3] * source[1] + f);
      pointX += dx * u * v; pointY += dy * u * v;
      a += dx * du * v; b += dy * du * v; c += dx * u * dv; d += dy * u * dv;
    }
  }
  return { x: pointX, y: pointY, matrix: [a, b, c, d] };
}

function insideBuilding(longitude, latitude, outline) {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [xi, yi] = outline[i], [xj, yj] = outline[j];
    // A point exactly on an exterior wall is not a confirmed interior point.
    const cross = (longitude - xi) * (yj - yi) - (latitude - yi) * (xj - xi);
    if (Math.abs(cross) < 1e-15 && longitude >= Math.min(xi, xj) && longitude <= Math.max(xi, xj)
      && latitude >= Math.min(yi, yj) && latitude <= Math.max(yi, yj)) return false;
    if ((yi > latitude) !== (yj > latitude) && longitude < (xj - xi) * (latitude - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToBuildingEdge(longitude, latitude, outline) {
  const longitudeScale = METERS_PER_LONGITUDE;
  let nearest = Infinity;
  for (let i = 1; i < outline.length; i++) {
    const ax = (outline[i - 1][0] - longitude) * longitudeScale;
    const ay = (outline[i - 1][1] - latitude) * 111320;
    const bx = (outline[i][0] - longitude) * longitudeScale;
    const by = (outline[i][1] - latitude) * 111320;
    const dx = bx - ax, dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared)) : 0;
    nearest = Math.min(nearest, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return nearest;
}

export function projectCampusPosition(coords, lang = 'ja', floorId = '1F') {
  const { latitude, longitude, accuracy } = coords ?? {};
  if (![latitude, longitude, accuracy].every(Number.isFinite) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || accuracy <= 0) return { kind: 'invalid' };
  if (accuracy > 100) return { kind: 'imprecise', accuracy };
  const east = (longitude - GEOREFERENCE.longitude) * METERS_PER_LONGITUDE;
  const north = (latitude - GEOREFERENCE.latitude) * METERS_PER_LATITUDE;
  const transforms = floorTransforms[floorId];
  if (!transforms) return { kind: 'unsupported', accuracy };
  const building = floorId === 'A-6-9F' ? 'A' : floorId === 'H-6-9F' ? 'H' : null;
  if (building) {
    const outline = footprints.buildings[building].outline;
    if (!insideBuilding(longitude, latitude, outline)) return { kind: 'outsideBuilding', accuracy };
    if (distanceToBuildingEdge(longitude, latitude, outline) < accuracy) return { kind: 'uncertainBuilding', accuracy };
  }
  const x = GEOREFERENCE.x[0] * east + GEOREFERENCE.x[1] * north + GEOREFERENCE.x[2];
  const y = GEOREFERENCE.y[0] * east + GEOREFERENCE.y[1] * north + GEOREFERENCE.y[2];
  // The park, field and the legend/office index are not part of this floor
  // drawing. Never clamp an out-of-map position onto a building or legend.
  const mapped = x >= 90 && x <= 1010 && y >= 100 && y <= 810
    && !(x > 620 && y > 510) && !(x > 610 && y < 220);
  if (!mapped) return { kind: 'outside', accuracy };
  const scale = lang === 'en' && floorId !== 'H-6-9F' ? 0.999625 : 1;
  const offsetY = scale === 1 ? 0 : 0.106;
  const points = transforms.map((transform, index) => {
    const drawing = projectFloorDrawing(x, y, floorId, index, transform);
    const [a, b, c, d] = drawing.matrix;
    const pointX = scale * drawing.x;
    const pointY = scale * drawing.y + offsetY;
    return {
      x: pointX, y: pointY, xRatio: pointX / GEOREFERENCE.width, yRatio: pointY / GEOREFERENCE.height,
      matrix: [
        scale * (a * GEOREFERENCE.x[0] + c * GEOREFERENCE.y[0]),
        scale * (b * GEOREFERENCE.x[0] + d * GEOREFERENCE.y[0]),
        scale * (a * GEOREFERENCE.x[1] + c * GEOREFERENCE.y[1]),
        scale * (b * GEOREFERENCE.x[1] + d * GEOREFERENCE.y[1]),
      ],
    };
  });
  return { kind: 'position', accuracy, ...points[0], points };
}
