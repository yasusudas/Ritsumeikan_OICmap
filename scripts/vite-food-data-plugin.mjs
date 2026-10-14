import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateFoodPlaces } from '../src/food-guide-model.js';
import { removeFoodPictograms } from './food-map-svg.mjs';

const virtual = 'virtual:rits-oic-food-data';
const source = new URL('../public/food-places.json', import.meta.url);
export function foodDataAssetsPlugin() {
  let config, references;
  async function assets() {
    const [payload, search, ja, en] = await Promise.all([
      readFile(source, 'utf8').then(JSON.parse),
      readFile(
        new URL('../public/manual-search-index.json', import.meta.url),
        'utf8',
      ).then(JSON.parse),
      readFile(
        new URL('../src/assets/floors/ja/1F.svg', import.meta.url),
        'utf8',
      ),
      readFile(
        new URL('../src/assets/floors/en/1F.svg', import.meta.url),
        'utf8',
      ),
    ]);
    validateFoodPlaces(payload, search.entries);
    await Promise.all(
      payload.places.map(async (place) => {
        for (const key of ['src', 'fallbackSrc']) {
          const bytes = await readFile(
            new URL('../public' + place.mark[key], import.meta.url),
          );
          if (place.mark[key].endsWith('.png')) {
            if (bytes.subarray(1, 4).toString() !== 'PNG')
              throw Error('Invalid PNG: ' + place.mark[key]);
          } else if (
            !/<svg\b[^>]*viewBox=/.test(bytes.toString()) ||
            /<(?:text|script|image|use)\b|href=/i.test(bytes.toString())
          ) {
            throw Error('Invalid food icon SVG: ' + place.mark[key]);
          }
        }
      }),
    );
    return {
      places: JSON.stringify(payload),
      ja: removeFoodPictograms(ja, payload.places, 'ja'),
      en: removeFoodPictograms(en, payload.places, 'en'),
    };
  }
  return {
    name: 'rits-oic-food-assets',
    enforce: 'pre',
    configResolved(value) {
      config = value;
    },
    async buildStart() {
      if (config.command !== 'build') return;
      const data = await assets();
      references = {};
      for (const [key, value] of Object.entries(data))
        references[key] = this.emitFile({
          type: 'asset',
          name: key === 'places' ? 'food-places.json' : `food-map-${key}.svg`,
          source: value,
        });
    },
    resolveId(id) {
      return id === virtual ? `\0${virtual}` : null;
    },
    load(id) {
      if (id !== `\0${virtual}`) return null;
      const url = (key) =>
        config.command === 'build'
          ? `import.meta.ROLLUP_FILE_URL_${references[key]}`
          : JSON.stringify(`/@rits-oic-food/${key}`);
      return `export const foodDataUrl=${url('places')}; export const foodFloorUrls={ja:${url('ja')},en:${url('en')}};`;
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const key = new URL(
          req.url || '/',
          'http://localhost',
        ).pathname.replace('/@rits-oic-food/', '');
        if (!['places', 'ja', 'en'].includes(key)) {
          next();
          return;
        }
        try {
          const data = await assets();
          res.setHeader(
            'Content-Type',
            key === 'places'
              ? 'application/json; charset=utf-8'
              : 'image/svg+xml',
          );
          res.setHeader('Cache-Control', 'no-store');
          res.end(data[key]);
        } catch (e) {
          next(e);
        }
      });
    },
    handleHotUpdate({ file, server }) {
      if (file === fileURLToPath(source))
        server.ws.send({ type: 'full-reload' });
    },
  };
}
