import { readFile } from 'node:fs/promises';

export const DEFAULT_SEARCH_DATA_URL = new URL('../public/manual-search-index.json', import.meta.url);

export async function readCanonicalSearchData(sourceUrl = DEFAULT_SEARCH_DATA_URL) {
  const source = await readFile(sourceUrl, 'utf8');
  const payload = JSON.parse(source);

  if (!Number.isInteger(payload?.version)) {
    throw new TypeError('Search data version must be an integer.');
  }

  if (!Array.isArray(payload.entries)) {
    throw new TypeError('Search data entries must be an array.');
  }

  if (!Array.isArray(payload.facilityRings)) {
    throw new TypeError('Search data facilityRings must be an array.');
  }

  return payload;
}

export function createSearchRuntimePayloads(payload) {
  return {
    entries: {
      version: payload.version,
      entries: payload.entries
    },
    facilityRings: {
      version: payload.version,
      facilityRings: payload.facilityRings
    }
  };
}
