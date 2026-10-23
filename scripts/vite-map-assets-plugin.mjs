import { readFile, readdir } from 'node:fs/promises';
import { optimizeMapSvg } from './map-svg-optimization.mjs';
import { alignFloorSvg } from './aligned-floor-svg.mjs';

const virtual = 'virtual:rits-oic-map-assets';
const directory = new URL('../src/assets/floors/', import.meta.url);
const prefix = '/@rits-oic-map/';

export function mapAssetsPlugin() {
  let config;
  const references = new Map();
  async function image(key) {
    const aligned = key.startsWith('aligned/');
    const file = aligned ? key.slice('aligned/'.length) : key;
    const source = await readFile(new URL(file, directory), 'utf8');
    const svg = optimizeMapSvg(source, { filename: file, firstFloor: file.endsWith('/1F.svg') });
    return aligned ? alignFloorSvg(svg, file.split('/')[1].replace('.svg', ''), file.split('/')[0]) : svg;
  }
  return {
    name: 'rits-oic-map-assets',
    enforce: 'pre',
    configResolved(value) { config = value; },
    async buildStart() {
      references.clear();
      for (const language of ['ja', 'en']) {
        const files = (await readdir(new URL(`${language}/`, directory))).filter(file => file.endsWith('.svg')).sort();
        for (const file of files) {
          for (const key of [`${language}/${file}`, ...(/^[2-5]F\.svg$/.test(file) ? [`aligned/${language}/${file}`] : [])]) {
            references.set(key, config.command === 'build' ? this.emitFile({
              type: 'asset', name: file, source: await image(key),
            }) : null);
          }
        }
      }
    },
    resolveId(id) { return id === virtual ? `\0${virtual}` : null; },
    load(id) {
      if (id !== `\0${virtual}`) return null;
      const entries = [...references].filter(([key]) => !key.startsWith('aligned/')).map(([key, reference]) => `${JSON.stringify(key)}: ${
        config.command === 'build' ? `import.meta.ROLLUP_FILE_URL_${reference}` : JSON.stringify(prefix + key)
      }`);
      const aligned = [...references].filter(([key]) => key.startsWith('aligned/')).map(([key, reference]) => `${JSON.stringify(key.slice('aligned/'.length))}: ${
        config.command === 'build' ? `import.meta.ROLLUP_FILE_URL_${reference}` : JSON.stringify(prefix + key)
      }`);
      return `export const floorSvgUrls = {${entries.join(',')}}; export const alignedFloorSvgUrls = {${aligned.join(',')}};`;
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = new URL(req.url || '/', 'http://localhost').pathname;
        if (!path.startsWith(prefix)) return next();
        const key = path.slice(prefix.length);
        if (!references.has(key)) return next();
        try {
          res.setHeader('Content-Type', 'image/svg+xml');
          res.setHeader('Cache-Control', 'no-store');
          res.end(await image(key));
        } catch (error) { next(error); }
      });
    },
    handleHotUpdate({ file, server }) {
      if (/\/src\/assets\/floors\/(?:ja|en)\/[^/]+\.svg$/.test(file)) server.ws.send({ type: 'full-reload' });
    },
  };
}
