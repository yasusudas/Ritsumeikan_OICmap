import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { optimizeMapSvg } from './map-svg-optimization.mjs';

const virtual = 'virtual:rits-oic-map-assets';
const directory = new URL('../src/assets/floors/', import.meta.url);
const prefix = '/@rits-oic-map/';

export function mapAssetsPlugin() {
  let config;
  const references = new Map();
  async function image(key) {
    const source = await readFile(new URL(key, directory), 'utf8');
    return optimizeMapSvg(source, { filename: key, firstFloor: key.endsWith('/1F.svg') });
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
          const key = `${language}/${file}`;
          this.addWatchFile(fileURLToPath(new URL(key, directory)));
          references.set(key, config.command === 'build' ? this.emitFile({
            type: 'asset', name: file, originalFileName: `src/assets/floors/${key}`, source: await image(key),
          }) : null);
        }
      }
    },
    resolveId(id) { return id === virtual ? `\0${virtual}` : null; },
    load(id) {
      if (id !== `\0${virtual}`) return null;
      const entries = [...references].map(([key, reference]) => `${JSON.stringify(key)}: ${
        config.command === 'build' ? `import.meta.ROLLUP_FILE_URL_${reference}` : JSON.stringify(prefix + key)
      }`);
      return `export const floorSvgUrls = {${entries.join(',')}};`;
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
