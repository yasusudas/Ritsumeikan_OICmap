/**
 * Export each floor's Japanese SVG with every search outline overlaid,
 * so the burgundy regions can be reviewed by eye.
 *
 * Usage:
 *   node scripts/outlines/export-outline-review-svgs.mjs
 *   node scripts/outlines/export-outline-review-svgs.mjs --out tmp/outline-review
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const indexPath = path.join(root, 'public/manual-search-index.json');
const floorsDir = path.join(root, 'src/assets/floors/ja');

const FLOORS = [
  { floorId: '1F', file: '1F.svg', outName: '1F-outlines.svg' },
  { floorId: '2F', file: '2F.svg', outName: '2F-outlines.svg' },
  { floorId: '3F', file: '3F.svg', outName: '3F-outlines.svg' },
  { floorId: '4F', file: '4F.svg', outName: '4F-outlines.svg' },
  { floorId: '5F', file: '5F.svg', outName: '5F-outlines.svg' },
  { floorId: 'A-6-9F', file: '6F7F8F9F_BldgA.svg', outName: 'A-6-9F-outlines.svg' },
  { floorId: 'H-6-9F', file: '6F7F8F9F_BldgH.svg', outName: 'H-6-9F-outlines.svg' }
];

const OUTLINE_STYLE = 'fill:rgba(155,27,48,0.18);stroke:#9b1b30;stroke-width:0.8;stroke-linejoin:round';

function parseArgs(argv) {
  const outFlag = argv.indexOf('--out');
  const outDir =
    outFlag >= 0 && argv[outFlag + 1]
      ? path.resolve(root, argv[outFlag + 1])
      : path.join(root, 'tmp/outline-review');
  return { outDir };
}

function parseViewBox(svgText) {
  const match = svgText.match(/viewBox="([^"]+)"/);
  if (!match) {
    throw new Error('viewBox not found');
  }
  const [vbX, vbY, vbW, vbH] = match[1].split(/[\s,]+/).map(Number);
  if (![vbX, vbY, vbW, vbH].every(Number.isFinite)) {
    throw new Error(`invalid viewBox: ${match[1]}`);
  }
  return { vbX, vbY, vbW, vbH };
}

function polygonPoints(polygon, viewBox) {
  return polygon
    .map((point) => {
      const x = viewBox.vbX + point.xRatio * viewBox.vbW;
      const y = viewBox.vbY + point.yRatio * viewBox.vbH;
      return `${x.toFixed(3)},${y.toFixed(3)}`;
    })
    .join(' ');
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function buildOverlay(entries, viewBox) {
  const parts = [
    '<g id="search-outline-review" pointer-events="none">',
    `<title>Search outlines review (${entries.length} entries)</title>`
  ];

  for (const entry of entries) {
    const outlines = entry.outlines ?? [];
    if (outlines.length === 0) continue;
    parts.push(`<g data-entry-id="${escapeXml(entry.id)}" data-label="${escapeXml(entry.label)}">`);
    for (const polygon of outlines) {
      parts.push(`<polygon points="${polygonPoints(polygon, viewBox)}" style="${OUTLINE_STYLE}"/>`);
    }
    parts.push('</g>');
  }

  parts.push('</g>');
  return parts.join('\n');
}

function injectOverlay(svgText, overlayMarkup) {
  const closeIndex = svgText.lastIndexOf('</svg>');
  if (closeIndex < 0) {
    throw new Error('</svg> not found');
  }
  return `${svgText.slice(0, closeIndex)}\n${overlayMarkup}\n${svgText.slice(closeIndex)}`;
}

function main() {
  const { outDir } = parseArgs(process.argv.slice(2));
  const payload = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });

  const summary = [];

  for (const floor of FLOORS) {
    const floorEntries = payload.entries.filter((entry) => entry.floorId === floor.floorId);
    const withOutlines = floorEntries.filter((entry) => entry.outlines?.length > 0);
    const polygonCount = withOutlines.reduce((sum, entry) => sum + entry.outlines.length, 0);

    const svgPath = path.join(floorsDir, floor.file);
    const svgText = fs.readFileSync(svgPath, 'utf8');
    const viewBox = parseViewBox(svgText);
    const overlay = buildOverlay(withOutlines, viewBox);
    const outSvg = injectOverlay(svgText, overlay);
    const outPath = path.join(outDir, floor.outName);
    fs.writeFileSync(outPath, outSvg, 'utf8');

    summary.push({
      floorId: floor.floorId,
      file: outPath,
      entries: withOutlines.length,
      polygons: polygonCount,
      withoutOutlines: floorEntries.length - withOutlines.length
    });
  }

  const summaryPath = path.join(outDir, 'README.md');
  const lines = [
    '# 検索外周レビュー用 SVG',
    '',
    '各階の日本語地図に、現在の `outlines` をえんじ（`#9b1b30`、半透明塗り）で重ねたもの。',
    'ブラウザや画像ビューアで開いて、囲っている領域が適切か目視する。',
    '',
    '| 階 | ファイル | 外周あり | 多角形数 | 外周なし |',
    '| --- | --- | ---: | ---: | ---: |'
  ];
  for (const row of summary) {
    lines.push(
      `| ${row.floorId} | \`${path.basename(row.file)}\` | ${row.entries} | ${row.polygons} | ${row.withoutOutlines} |`
    );
  }
  lines.push('');
  fs.writeFileSync(summaryPath, `${lines.join('\n')}\n`, 'utf8');

  console.log(`Wrote ${summary.length} SVGs to ${outDir}`);
  for (const row of summary) {
    console.log(
      `  ${row.floorId}: ${path.basename(row.file)} (${row.entries} entries, ${row.polygons} polygons, ${row.withoutOutlines} without outlines)`
    );
  }
}

main();
