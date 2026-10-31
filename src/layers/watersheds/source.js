import { readResponseJsonCapped } from '../../sources/httpBody.js';
import { validateWatershedCollection } from './model.js';

/** Bounded bundled subset; construction and disabled layers perform no IO. */
export function createWatershedSource({ fetchImpl = globalThis.fetch } = {}) {
  let cached;
  return {
    async getSnapshot({ signal } = {}) {
      signal?.throwIfAborted();
      if (cached) return cached;
      const response = await fetchImpl(
        new URL('./data/paute-units.geojson', import.meta.url).href,
        { signal, cache: 'force-cache' },
      );
      if (!response.ok) throw new Error(`watersheds:${response.status}`);
      const collection = validateWatershedCollection(
        await readResponseJsonCapped(response, 2_000_000),
      );
      signal?.throwIfAborted();
      cached = collection;
      return collection;
    },
  };
}
