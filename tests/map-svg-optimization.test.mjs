import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { optimizeMapSvg } from '../scripts/map-svg-optimization.mjs';
import { removeFoodPictograms } from '../scripts/food-map-svg.mjs';

const folder = new URL('../src/assets/floors/', import.meta.url);
function dimensions(svg) {
  const tag = svg.match(/<svg\b[^>]*>/)[0];
  return ['width', 'height', 'viewBox'].map(key => {
    const value = tag.match(new RegExp(`\\b${key}="([^"]+)"`))?.[1];
    if (!value) return null;
    if (key === 'viewBox') return value.split(/[ ,]+/).map(Number);
    // SVGO may convert pt to equivalent CSS px; dimensionless H maps stay so.
    return Number((parseFloat(value) * (value.endsWith('pt') ? 4 / 3 : 1)).toFixed(5));
  });
}

for (const language of ['ja', 'en']) {
  test(`${language}: optimized floor maps retain dimensions, references and original files`, async () => {
    const files = (await readdir(new URL(`${language}/`, folder))).filter(file => file.endsWith('.svg'));
    assert.equal(files.length, 8);
    for (const file of files) {
      const url = new URL(`${language}/${file}`, folder);
      const source = await readFile(url, 'utf8');
      const svg = optimizeMapSvg(source, { filename: `${language}/${file}`, firstFloor: file === '1F.svg' });
      assert.deepEqual(dimensions(svg), dimensions(source), file);
      assert.ok(Buffer.byteLength(svg) < Buffer.byteLength(source), file);
      const ids = new Set([...svg.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
      for (const match of svg.matchAll(/(?:url\(#|href="#)([^)"\s]+)/g)) assert.ok(ids.has(match[1]), `${file}: ${match[1]}`);
      if (file === '1F.svg') {
        assert.doesNotMatch(svg, /<(?:mask|filter)\b|\b(?:mask|filter)="/);
        assert.match(source, /<mask\b/);
      }
      assert.equal(await readFile(url, 'utf8'), source);
    }
  });

  test(`${language}: food pictogram removal precedes optimization and preserves map dimensions`, async () => {
    const source = await readFile(new URL(`${language}/1F.svg`, folder), 'utf8');
    const data = JSON.parse(await readFile(new URL('../public/food-places.json', import.meta.url), 'utf8'));
    const derived = removeFoodPictograms(source, data.places, language);
    const svg = optimizeMapSvg(derived, { filename: `food-map-${language}.svg`, firstFloor: true });
    assert.deepEqual(dimensions(svg), dimensions(source));
    assert.doesNotMatch(svg, /<(?:mask|filter)\b|\b(?:mask|filter)="/);
    assert.throws(() => removeFoodPictograms(derived, data.places, language), /removed/);
  });
}
