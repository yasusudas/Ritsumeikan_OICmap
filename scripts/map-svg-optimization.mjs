import { optimize } from 'svgo';
import { firstFloorWithoutMaskFilter } from './first-floor-without-mask-filter.mjs';

// Keep editable SVGs intact; optimize only the images served to the browser.
const cache = new Map();
export function optimizeMapSvg(source, { filename, firstFloor = false }) {
  const previous = cache.get(filename);
  if (previous?.source === source && previous.firstFloor === firstFloor) return previous.svg;
  const input = firstFloor ? firstFloorWithoutMaskFilter(source).svg : source;
  const { data } = optimize(input, {
    path: filename,
    multipass: true,
    floatPrecision: 5,
    plugins: ['preset-default'],
  });
  cache.set(filename, { source, firstFloor, svg: data });
  return data;
}
