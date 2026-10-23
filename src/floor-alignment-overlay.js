import { getFloorAlignment, FLOOR_VIEWBOX } from './floor-alignment.js';

const NS = 'http://www.w3.org/2000/svg';
let sequence = 0;

// Clip the ORIGINAL stroked geometry before transforming, exactly as the map
// image does. Use real nodes: <use> with non-scaling strokes can disappear in
// an inline SVG. Each clipped instance includes the original stroke, including
// halos crossing a region edge; there are no new strokes along the cut.
export function alignFloorOverlay(svg, floorId, language) {
  const patches = getFloorAlignment(floorId, language);
  if (!patches.length) return svg;
  const [, , width, height] = FLOOR_VIEWBOX;
  const [vx, vy, vw, vh] = svg.getAttribute('viewBox').split(/[ ,]+/).map(Number);
  const prefix = `oic-overlay-${++sequence}-`;
  const element = (tag, attributes = {}) => {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  };
  const rectangle = ([left, top, right, bottom]) => `M${vx + left / width * vw} ${vy + top / height * vh}H${vx + right / width * vw}V${vy + bottom / height * vh}H${vx + left / width * vw}Z`;
  const definitions = element('defs');
  const clip = (id, d) => {
    const node = element('clipPath', { id: prefix + id, clipPathUnits: 'userSpaceOnUse' });
    node.append(element('path', { d, 'clip-rule': 'evenodd' }));
    definitions.append(node);
  };
  clip('outside', rectangle([0, 0, width, height]) + patches.map(p => rectangle(p.bounds)).join(''));
  const outside = element('g', { 'data-alignment-outside': 'true', 'clip-path': `url(#${prefix}outside)` });
  const groups = patches.map(patch => {
    clip(patch.id, rectangle(patch.bounds));
    const [a, b, c, d, e, f] = patch.matrix;
    const sx = vw / width, sy = vh / height;
    const matrix = [a, b * sy / sx, c * sx / sy, d, vx + e * sx - a * vx - c * sx / sy * vy, vy + f * sy - b * sy / sx * vx - d * vy];
    const transform = element('g', { 'data-alignment-region': patch.id, transform: `matrix(${matrix.join(' ')})` });
    const content = element('g', { 'clip-path': `url(#${prefix}${patch.id})` });
    transform.append(content);
    return { ...patch, transform, content };
  });
  const originals = [...svg.children];
  svg.replaceChildren(definitions, outside, ...groups.map(g => g.transform));
  originals.forEach((node, index) => {
    node.setAttribute('data-registration-geometry', index);
    outside.append(node);
    for (const group of groups) {
      const copy = node.cloneNode(true);
      for (const part of [copy, ...copy.querySelectorAll('*')]) part.setAttribute('data-registration-copy', 'true');
      group.content.append(copy);
    }
  });
  return svg;
}
