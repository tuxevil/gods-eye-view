import { readResponseJsonCapped } from '../../sources/httpBody.js';

/**
 * Provider seam: `getSnapshot({ signal }) -> { schemaVersion, events, stale, fetchedAt, rainySeasonError, nationalAdverseError }`.
 * No acquisition occurs at construction.
 */
export function createSngrEventsSource({ fetchImpl = globalThis.fetch } = {}) {
  return {
    async getSnapshot({ signal } = {}) {
      const response = await fetchImpl('/api/sngr-events', {
        signal,
        headers: { accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`sngr-events:${response.status}`);
      }
      return readResponseJsonCapped(response, 512_000);
    },
  };
}
