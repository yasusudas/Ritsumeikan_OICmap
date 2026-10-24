// Reproduce the held-out SVG comparison: node scripts/gps/validate-floor-alignment.mjs
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { GEOREFERENCE, projectFloorDrawing } from '../../src/geolocation-model.js';
import checkpoints from '../../tests/fixtures/gps-upper-floor-checkpoints.json' with { type: 'json' };

function originalProjection(source, target, [x, y]) {
  const [[x1, y1], [x2, y2], [x3, y3]] = source;
  const det = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
  const w1 = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / det;
  const w2 = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / det;
  return [0, 1].map(axis => w1 * target[0][axis] + w2 * target[1][axis] + (1 - w1 - w2) * target[2][axis]);
}
function distanceMetres([dx, dy], [a, b, c, d]) {
  const m = [a * GEOREFERENCE.x[0] + c * GEOREFERENCE.y[0], b * GEOREFERENCE.x[0] + d * GEOREFERENCE.y[0],
    a * GEOREFERENCE.x[1] + c * GEOREFERENCE.y[1], b * GEOREFERENCE.x[1] + d * GEOREFERENCE.y[1]];
  const det = m[0] * m[3] - m[1] * m[2];
  return Math.hypot((m[3] * dx - m[2] * dy) / det, (-m[1] * dx + m[0] * dy) / det);
}
export async function validateFloorAlignment() {
  for (const [file, sha] of Object.entries(checkpoints.sourceSha256)) {
    const content = await readFile(new URL(`../../src/assets/floors/ja/${file}`, import.meta.url));
    if (createHash('sha256').update(content).digest('hex') !== sha) throw new Error(`Remeasure checkpoints after SVG change: ${file}`);
  }
  if (createHash('sha256').update(await readFile(new URL('../../src/assets/facility-ring-offsets.json', import.meta.url))).digest('hex') !== checkpoints.ringSha256) throw new Error('Remeasure facility checkpoints');
  return Object.entries(checkpoints.sheets).flatMap(([sheet, panels]) => panels.map((panel, index) => {
    const measure = (point, role) => {
      const old = originalProjection(panel.originalSource, panel.originalTarget, point.source);
      const current = projectFloorDrawing(...point.source, sheet, index);
      const delta = [current.x - point.target[0], current.y - point.target[1]];
      return { id: point.id, label: point.label, role, source: point.source, target: point.target,
        beforeSvg: Math.hypot(old[0] - point.target[0], old[1] - point.target[1]), afterSvg: Math.hypot(...delta),
        afterMetresEquivalent: distanceMetres(delta, current.matrix) };
    };
    const holdout = panel.holdout.map(p => measure(p, 'holdout'));
    const calibration = panel.addedCalibration.map(p => measure(p, 'added-calibration'));
    return { sheet, floor: panel.floor, holdoutCount: holdout.length,
      beforeMean: holdout.reduce((sum, p) => sum + p.beforeSvg, 0) / holdout.length,
      afterMean: holdout.reduce((sum, p) => sum + p.afterSvg, 0) / holdout.length,
      beforeMax: Math.max(...holdout.map(p => p.beforeSvg)), afterMax: Math.max(...holdout.map(p => p.afterSvg)),
      afterMaxMetresEquivalent: Math.max(...holdout.map(p => p.afterMetresEquivalent)), holdout, calibration };
  }));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await validateFloorAlignment(), null, 2));
