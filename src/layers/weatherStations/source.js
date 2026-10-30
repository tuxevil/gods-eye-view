import { readResponseJsonCapped } from '../../sources/httpBody.js';
/** Provider seam: getSnapshot({signal,cell}) -> {readings,stale,fetchedAt}. No acquisition at construction. */
export function createWeatherStationSource({
  fetchImpl = globalThis.fetch,
} = {}) {
  return {
    async getSnapshot({ signal, cell = 'ecuador' } = {}) {
      const response = await fetchImpl(
        `/api/weather-stations?cell=${encodeURIComponent(cell)}`,
        { signal },
      );
      if (!response.ok) throw new Error('Weather stations unavailable');
      const data = await readResponseJsonCapped(
        response,
        2 * 1024 * 1024,
        signal,
      );
      if (
        data?.schemaVersion !== 1 ||
        !Array.isArray(data.readings) ||
        data.readings.length > 400
      )
        throw new Error('Malformed station snapshot');
      return data;
    },
  };
}
