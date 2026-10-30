import { readResponseJsonCapped } from '../../sources/httpBody.js';

/**
 * Provider seam: getSnapshot({signal}) -> {schemaVersion:1, plants, nationalSummary, stale, fetchedAt}.
 * No network work at construction time.
 */
export function createEcuadorEnergySource({
  fetchImpl = globalThis.fetch,
} = {}) {
  return {
    async getSnapshot({ signal } = {}) {
      const response = await fetchImpl('/api/ecuador-energy', { signal });
      if (!response.ok) throw new Error('Ecuador energy provider unavailable');
      const data = await readResponseJsonCapped(
        response,
        2 * 1024 * 1024,
        signal,
      );
      if (
        data?.schemaVersion !== 1 ||
        !Array.isArray(data.plants) ||
        data.plants.length > 32
      ) {
        throw new Error('Malformed Ecuador energy snapshot');
      }
      return data;
    },
  };
}
