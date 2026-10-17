#!/usr/bin/env node
// Apply search outlines to public/manual-search-index.json from a spec file.
//
//   node scripts/outlines/apply-outlines.mjs spec.json          # dry run: report only
//   node scripts/outlines/apply-outlines.mjs spec.json --write  # write the data file
//
// Spec (points are [x, y] in SVG units of the floor's viewBox unless "units": "ratio"):
// {
//   "floorId": "1F",
//   "viewBox": [0, 0, 1190.55, 841.89],          // copy from the floor SVG (H-6-9F: [8.5, 0, ...])
//   "units": "svg",
//   "operations": [
//     { "op": "set", "id": "<entry id>", "outlines": [[[x, y], ...], ...] },
//     { "op": "clear", "id": "<entry id>" },
//     { "op": "add", "after": "<entry id, optional>", "entry": { "id", "label", "labelEn"?, "aliases"?,
//       "locationHint"?, "locationHintEn"? }, "pin": [x, y]?, "outlines": [...] },
//     { "op": "replace", "id": "<entry id>", "with": [ { "entry": {...}, "pin"?: [x, y], "outlines": [...] }, ... ] }
//   ]
// }
// "pin" defaults to the centre of the outlines' bounding box. See docs/search-outlines-runbook.md.
import { readFile, writeFile } from 'node:fs/promises';
import { DEFAULT_SEARCH_DATA_URL } from '../search-data-runtime.mjs';
import { validateSearchData } from '../search-data-validation.mjs';

const [specPath, ...flags] = process.argv.slice(2);
const write = flags.includes('--write');
if (!specPath) {
  console.error('usage: node scripts/outlines/apply-outlines.mjs <spec.json> [--write]');
  process.exit(2);
}

const spec = JSON.parse(await readFile(specPath, 'utf8'));
const source = await readFile(DEFAULT_SEARCH_DATA_URL, 'utf8');
const data = JSON.parse(source);
const before = JSON.parse(source);

const [vbX, vbY, vbW, vbH] = spec.viewBox ?? [0, 0, 1, 1];
if (spec.units !== 'ratio' && !spec.viewBox) throw new Error('spec.viewBox is required for SVG units.');
const round = (v) => Number(v.toFixed(6));
const toRatio = ([x, y]) => (spec.units === 'ratio' ? [x, y] : [(x - vbX) / vbW, (y - vbY) / vbH]);

// Ratios rounded to 6 places, without repeated points, points on a straight edge or
// zero-width spikes (a spike draws as a stray line under the outline's stroke).
function cleanPolygon(points) {
  let pts = points.map((p) => toRatio(p).map(round));
  pts = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
  if (pts.length > 1 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1]) pts.pop();
  for (let changed = true; changed && pts.length > 3; ) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
      const same = Math.abs(a[0] - b[0]) < 2e-6 && Math.abs(a[1] - b[1]) < 2e-6;
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (same || Math.abs(cross) < 1e-9) { pts.splice(i, 1); changed = true; break; }
    }
  }
  if (new Set(pts.map((p) => p.join(','))).size < 3) throw new Error(`outline has fewer than 3 distinct points: ${JSON.stringify(points)}`);
  return pts.map(([xRatio, yRatio]) => ({ xRatio, yRatio }));
}

const outlinesOf = (list) => {
  if (!Array.isArray(list) || list.length === 0) throw new Error('outlines must be a non-empty array of polygons');
  return list.map(cleanPolygon);
};

function pinRect(item, outlines) {
  let [cx, cy] = item.pin ? toRatio(item.pin) : [];
  if (cx === undefined) {
    const pts = outlines.flat();
    const xs = pts.map((p) => p.xRatio), ys = pts.map((p) => p.yRatio);
    cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  }
  // Pins are stored as a 0.001-wide rect centred on the point.
  return [{ xRatio: round(cx - 0.0005), yRatio: round(cy - 0.0005), widthRatio: 0.001, heightRatio: 0.001 }];
}

// Same key order as the editor's serializeEntries().
function buildEntry(item) {
  const e = item.entry;
  if (!e?.id || !e?.label) throw new Error(`new entries need id and label: ${JSON.stringify(e)}`);
  const outlines = outlinesOf(item.outlines);
  return {
    id: e.id,
    floorId: spec.floorId,
    label: e.label,
    ...(e.labelEn ? { labelEn: e.labelEn } : {}),
    ...(e.locationHint ? { locationHint: e.locationHint } : {}),
    ...(e.locationHintEn ? { locationHintEn: e.locationHintEn } : {}),
    aliases: e.aliases ?? [],
    rects: pinRect(item, outlines),
    outlines
  };
}

const indexOf = (id) => {
  const i = data.entries.findIndex((e) => e.id === id);
  if (i < 0) throw new Error(`no entry with id ${id}`);
  if (data.entries[i].floorId !== spec.floorId) throw new Error(`${id} is on ${data.entries[i].floorId}, not ${spec.floorId}`);
  return i;
};

const log = [];
for (const op of spec.operations ?? []) {
  if (op.op === 'set') {
    const e = data.entries[indexOf(op.id)];
    e.outlines = outlinesOf(op.outlines);
    log.push(`set     ${e.label}: ${e.outlines.length} polygon(s), ${e.outlines.map((p) => p.length).join('+')} points`);
  } else if (op.op === 'clear') {
    const e = data.entries[indexOf(op.id)];
    delete e.outlines;
    log.push(`clear   ${e.label}`);
  } else if (op.op === 'add') {
    const entry = buildEntry(op);
    const at = op.after ? indexOf(op.after) + 1 : data.entries.findLastIndex((e) => e.floorId === spec.floorId) + 1;
    data.entries.splice(at, 0, entry);
    log.push(`add     ${entry.label} (${entry.id}) at index ${at}`);
  } else if (op.op === 'replace') {
    const i = indexOf(op.id);
    const old = data.entries[i];
    const added = op.with.map(buildEntry);
    data.entries.splice(i, 1, ...added);
    log.push(`replace ${old.label} -> ${added.map((e) => e.label).join(', ')}`);
  } else {
    throw new Error(`unknown op ${JSON.stringify(op.op)}`);
  }
}

const ids = new Set();
for (const e of data.entries) {
  if (ids.has(e.id)) throw new Error(`duplicate id ${e.id}`);
  ids.add(e.id);
}

const report = validateSearchData(data);
const count = (d) => ({
  entries: d.entries.length,
  floorEntries: d.entries.filter((e) => e.floorId === spec.floorId).length,
  floorOutlined: d.entries.filter((e) => e.floorId === spec.floorId && e.outlines?.length).length
});
const strip = (d) => JSON.stringify(d.entries.filter((e) => e.floorId !== spec.floorId));
console.log(log.join('\n'));
console.log('before', count(before), '\nafter ', count(data));
console.log('other floors unchanged:', strip(before) === strip(data));
console.log('validation errors:', report.errors.length, report.errors.slice(0, 5));
console.log('validation warnings:', report.warnings.length, report.warnings.slice(0, 5));

if (report.errors.length) process.exit(1);
if (write) {
  // Same formatting as the editor export: two-space indent, no trailing newline.
  await writeFile(DEFAULT_SEARCH_DATA_URL, JSON.stringify(data, null, 2));
  console.log('written', DEFAULT_SEARCH_DATA_URL.pathname);
} else {
  console.log('dry run (pass --write to save)');
}
