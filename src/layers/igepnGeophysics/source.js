import { readResponseJsonCapped } from '../../sources/httpBody.js';

/**
 * Provider seam: `getSnapshot({ signal }) -> { schemaVersion, volcanoes, tectonicQuakes, volcanicQuakes, stale, fetchedAt }`.
 * No acquisition occurs at construction.
 */
export function createIgepnGeophysicsSource({
  fetchImpl = globalThis.fetch,
} = {}) {
  return {
    async getSnapshot({ signal } = {}) {
      const response = await fetchImpl('/api/igepn-geophysics', {
        signal,
        headers: { accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`igepn-geophysics:${response.status}`);
      }
      return readResponseJsonCapped(response, 1_000_000);
    },
  };
}
