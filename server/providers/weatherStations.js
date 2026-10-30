import { fetchAmbientStations } from './ambientStations.js';
import { readResponseJsonCapped } from './common/http.js';
import { normalizeMetars } from '../../src/layers/weatherStations/model.js';

/** Fixed origin, bounded geographic cells, single flight, TTL and finite stale fallback. */
export function createStationService({
  fetchImpl = globalThis.fetch,
  now = Date.now,
  env = process.env,
} = {}) {
  const cache = new Map();
  const pending = new Map();
  const failures = new Map();
  let lastStartedAt = -Infinity;
  return async function snapshot(cell = 'ecuador') {
    let bbox;
    if (cell === 'ecuador') bbox = '-6,-92,2,-74';
    else {
      const parts = /^(-?\d+),(-?\d+)$/.exec(cell);
      if (!parts) throw new Error('Invalid weather cell');
      const [lat, lon] = parts.slice(1).map(Number);
      if (
        lat < -90 ||
        lat > 80 ||
        lon < -180 ||
        lon > 170 ||
        lat % 10 ||
        lon % 10
      )
        throw new Error('Invalid weather cell');
      bbox = `${lat},${lon},${lat + 10},${lon + 10}`;
    }
    if ((failures.get(cell) || 0) > now())
      throw new Error('Weather provider unavailable');
    const old = cache.get(cell),
      age = old ? now() - old.fetchedAt : Infinity;
    if (age < 300_000) return { ...old, stale: false };
    if (old?.retryAfter > now()) return { ...old, stale: true };
    if (pending.has(cell)) return pending.get(cell);
    // A bounded cache also bounds arbitrary worldwide exploration.
    if (pending.size >= 4 || now() - lastStartedAt < 1000)
      throw new Error('Weather provider busy');
    lastStartedAt = now();
    const task = (async () => {
      try {
        const signal = AbortSignal.timeout(12_000);
        const response = await fetchImpl(
          `https://aviationweather.gov/api/data/metar?bbox=${bbox}&format=json&hours=3`,
          {
            signal,
            redirect: 'error',
            headers: {
              Accept: 'application/json',
              'User-Agent': 'GodsEyeView-weather/0.1',
            },
          },
        );
        if (!response.ok) throw new Error('Weather provider unavailable');
        const rows =
          response.status === 204
            ? []
            : await readResponseJsonCapped(response, 2 * 1024 * 1024, signal);
        const readings = normalizeMetars(rows, now());
        let ambientError = false;
        if (cell === 'ecuador') {
          try {
            readings.push(
              ...(await fetchAmbientStations({ env, fetchImpl, now })).slice(
                0,
                400 - readings.length,
              ),
            );
          } catch {
            ambientError = true;
          }
        }
        const entry = {
          schemaVersion: 1,
          fetchedAt: now(),
          readings,
          ambientError,
        };
        cache.delete(cell);
        cache.set(cell, entry);
        if (cache.size > 64) cache.delete(cache.keys().next().value);
        return { ...entry, stale: false };
      } catch {
        if (old && age < 6 * 3600_000) {
          old.retryAfter = now() + 60_000;
          return { ...old, stale: true };
        }
        failures.set(cell, now() + 60_000);
        if (failures.size > 64) failures.delete(failures.keys().next().value);
        throw new Error('Weather provider unavailable');
      } finally {
        pending.delete(cell);
      }
    })();
    pending.set(cell, task);
    return task;
  };
}
export function weatherStationsProxy(options) {
  const snapshot = createStationService(options);
  const install = (server) => {
    server.middlewares.use('/api/weather-stations', async (req, res) => {
      const send = (status, payload) => {
        res.writeHead(status, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify(payload));
      };
      const url = new URL(req.url, 'http://localhost');
      if (req.method !== 'GET') return send(405, { error: 'GET required' });
      if (
        url.pathname !== '/' ||
        [...url.searchParams.keys()].some((k) => k !== 'cell') ||
        url.searchParams.getAll('cell').length > 1
      )
        return send(400, { error: 'Invalid request' });
      try {
        send(200, await snapshot(url.searchParams.get('cell') || 'ecuador'));
      } catch (e) {
        send(e.message === 'Invalid weather cell' ? 400 : 503, {
          error: e.message,
        });
      }
    });
  };
  return {
    name: 'weather-stations-proxy',
    configureServer: install,
    configurePreviewServer: install,
  };
}
