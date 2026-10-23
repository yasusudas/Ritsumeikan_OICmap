import { optimize } from 'svgo';
import { createHash } from 'node:crypto';
import data from '../src/assets/floor-text-registration.json' with { type: 'json' };
import { getFloorAlignment } from '../src/floor-alignment.js';

// Keep original glyph geometry and inherited styling. Only the run's outer
// transform changes; registration rectangles never clip individual letters.
export function separateFloorLettering(source, floorId, language) {
  const record = data[`${language}/${floorId}.svg`];
  if (!record) return { base: source, lettering: '' };
  if (createHash('sha256').update(source).digest('hex') !== record.optimizedSha256) throw new Error('Regenerate floor text registration for ' + language + '/' + floorId);
  const indices = new Map(record.runs.flatMap((r, run) => r.indices.map(i => [i, run])));
  const primitives = new Map(record.runs.flatMap((r,run)=>(r.primitives??[]).map(i=>[i,run])));
  const parts = record.runs.map(() => []);
  const leaders = new Map((record.leaders??[]).map(l=>[l.primitive,l])), leaderNodes=[];
  const copy = node => JSON.parse(JSON.stringify(node));
  let index = 0, primitiveIndex = 0;
  const { data: base } = optimize(source, { plugins: [{ name: 'separate-lettering', fn(root) {
    function visit(parent, ancestors = []) {
      for (const node of [...(parent.children ?? [])]) {
        if (node.type !== 'element' || node.name === 'defs') continue;
        const graphic = ['path','use','rect','circle','ellipse','line','polyline','polygon'].includes(node.name);
        const primitive = graphic ? primitiveIndex++ : undefined;
        const current = node.name === 'use' ? index++ : undefined;
        const run = current!==undefined && indices.has(current) ? indices.get(current) : primitives.get(primitive);
        if (run !== undefined || leaders.has(primitive)) {
          let content = copy(node);
          if(leaders.has(primitive)) {content.attributes.d=leaders.get(primitive).d;content.attributes['data-label-leader']=String(primitive);}
          else content.attributes[current!==undefined ? 'data-label-glyph' : 'data-label-primitive'] = String(current??primitive);
          for (const ancestor of [...ancestors].reverse()) content = { type: 'element', name: 'g', attributes: { ...ancestor.attributes }, children: [content] };
          if(leaders.has(primitive))leaderNodes.push(content);else parts[run].push(content);
          parent.children.splice(parent.children.indexOf(node), 1);
        }
        visit(node, node.name === 'svg' ? [] : [...ancestors, node]);
      }
    }
    visit(root);
  } }] });
  const patches = getFloorAlignment(floorId, language);
  const wrapper = { type: 'element', name: 'svg', attributes: { xmlns: 'http://www.w3.org/2000/svg' }, children: record.runs.map((run, i) => {
    const matrix = patches.find(p => p.id === run.region)?.matrix ?? [1, 0, 0, 1, 0, 0];
    return { type: 'element', name: 'g', attributes: { 'data-floor-label-run': String(i), 'data-label-region': run.region ?? 'outside', transform: `matrix(${matrix.join(' ')})` }, children: parts[i] };
  }) };
  wrapper.children.push({type:'element',name:'g',attributes:{'data-floor-leaders':'true'},children:leaderNodes});
  const { data: serialized } = optimize('<svg/>', { plugins: [{ name: 'serialize-lettering', fn(root) { root.children = [wrapper]; } }] });
  return { base, lettering: serialized.slice(serialized.indexOf('>') + 1, serialized.lastIndexOf('</svg>')) };
}
