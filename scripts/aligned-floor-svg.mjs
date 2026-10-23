import { getFloorAlignment, FLOOR_VIEWBOX } from '../src/floor-alignment.js';
import { separateFloorLettering } from './floor-text-registration.mjs';

const rectanglePath = ([x0, y0, x1, y1]) => `M${x0} ${y0}H${x1}V${y1}H${x0}Z`;

// Reuse the already optimized drawing; never rewrite the editable source SVG.
// The same source rectangles and matrices are used by floor-alignment.js for
// polygons and rings. Keeping the image as <img> preserves the zoom raster path.
export function alignFloorSvg(source, floorId, language) {
  const patches = getFloorAlignment(floorId, language);
  if (!patches.length) return source;
  const separated = separateFloorLettering(source, floorId, language);
  source = separated.base;
  const root = source.match(/<svg\b[^>]*>/);
  const end = source.lastIndexOf('</svg>');
  if (!root || end < 0) throw new Error(`Invalid SVG for floor alignment: ${floorId}/${language}`);
  const [x, y, width, height] = FLOOR_VIEWBOX;
  const bodyStart = root.index + root[0].length;
  const body = source.slice(bodyStart, end);
  const prefix = 'oic-floor-alignment-';
  const outside = rectanglePath([x, y, x + width, y + height]) + patches.map(p => rectanglePath(p.bounds)).join('');
  const clips = patches.map(p => `<clipPath id="${prefix}${p.id}" clipPathUnits="userSpaceOnUse"><path d="${rectanglePath(p.bounds)}"/></clipPath>`).join('');
  const layers = patches.map(p => `<g data-alignment-region="${p.id}" transform="matrix(${p.matrix.join(' ')})"><g clip-path="url(#${prefix}${p.id})"><use href="#${prefix}drawing"/></g></g>`).join('');
  return `${source.slice(0, bodyStart)}<defs><g id="${prefix}drawing">${body}</g><clipPath id="${prefix}outside" clipPathUnits="userSpaceOnUse"><path d="${outside}" clip-rule="evenodd"/></clipPath>${clips}</defs><g clip-path="url(#${prefix}outside)"><use href="#${prefix}drawing"/></g>${layers}<g data-floor-lettering="true">${separated.lettering}</g>${source.slice(end)}`;
}
