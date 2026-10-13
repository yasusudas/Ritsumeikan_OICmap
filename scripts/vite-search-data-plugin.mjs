import { fileURLToPath } from 'node:url';
import {
  createSearchRuntimePayloads,
  DEFAULT_SEARCH_DATA_URL,
  readCanonicalSearchData
} from './search-data-runtime.mjs';

const VIRTUAL_MODULE_ID = 'virtual:rits-oic-search-data';
const RESOLVED_VIRTUAL_MODULE_ID = `\0${VIRTUAL_MODULE_ID}`;
const DEV_SEARCH_ENTRIES_PATH = '/@rits-oic-search-data/search-entries.json';
const DEV_FACILITY_RINGS_PATH = '/@rits-oic-search-data/facility-rings.json';

export function searchDataAssetsPlugin({ sourceUrl = DEFAULT_SEARCH_DATA_URL } = {}) {
  const sourceFile = fileURLToPath(sourceUrl);
  let resolvedConfig;
  let entriesReferenceId;
  let facilityRingsReferenceId;

  async function loadRuntimePayloads() {
    return createSearchRuntimePayloads(await readCanonicalSearchData(sourceUrl));
  }

  return {
    name: 'rits-oic-search-data-assets',
    enforce: 'pre',

    configResolved(config) {
      resolvedConfig = config;
    },

    async buildStart() {
      if (resolvedConfig.command !== 'build') {
        return;
      }

      const payloads = await loadRuntimePayloads();
      entriesReferenceId = this.emitFile({
        type: 'asset',
        name: 'search-entries.json',
        source: JSON.stringify(payloads.entries)
      });
      facilityRingsReferenceId = this.emitFile({
        type: 'asset',
        name: 'facility-rings.json',
        source: JSON.stringify(payloads.facilityRings)
      });
    },

    resolveId(id) {
      return id === VIRTUAL_MODULE_ID ? RESOLVED_VIRTUAL_MODULE_ID : null;
    },

    load(id) {
      if (id !== RESOLVED_VIRTUAL_MODULE_ID) {
        return null;
      }

      if (resolvedConfig.command === 'build') {
        if (!entriesReferenceId || !facilityRingsReferenceId) {
          throw new Error('Search data assets were not emitted before loading the virtual module.');
        }

        return [
          `export const searchEntriesUrl = import.meta.ROLLUP_FILE_URL_${entriesReferenceId};`,
          `export const facilityRingsUrl = import.meta.ROLLUP_FILE_URL_${facilityRingsReferenceId};`
        ].join('\n');
      }

      return [
        `export const searchEntriesUrl = ${JSON.stringify(DEV_SEARCH_ENTRIES_PATH)};`,
        `export const facilityRingsUrl = ${JSON.stringify(DEV_FACILITY_RINGS_PATH)};`
      ].join('\n');
    },

    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;

        if (pathname !== DEV_SEARCH_ENTRIES_PATH && pathname !== DEV_FACILITY_RINGS_PATH) {
          next();
          return;
        }

        if (request.method !== 'GET' && request.method !== 'HEAD') {
          response.statusCode = 405;
          response.setHeader('Allow', 'GET, HEAD');
          response.end();
          return;
        }

        try {
          const payloads = await loadRuntimePayloads();
          const payload =
            pathname === DEV_SEARCH_ENTRIES_PATH ? payloads.entries : payloads.facilityRings;
          const body = JSON.stringify(payload);

          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.setHeader('Cache-Control', 'no-store');
          response.setHeader('Content-Length', String(Buffer.byteLength(body)));
          response.end(request.method === 'HEAD' ? undefined : body);
        } catch (error) {
          next(error);
        }
      });
    },

    handleHotUpdate({ file, server }) {
      if (file === sourceFile) {
        server.ws.send({ type: 'full-reload' });
      }
    }
  };
}
