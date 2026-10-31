import { readResponseJsonCapped } from './common/http.js';
import {
  SNGR_BASE_ORIGIN,
  SNGR_FEEDS,
  normalizeSngrFeatures,
  mergeSngrEvents,
} from '../../src/layers/sngrEvents/model.js';

const RAINY_FIELDS = [
  'objectid',
  'secuencianacional',
  'fechadelevento',
  'horadelevento',
  'fechaultimaactualizacion',
  'horaultimaactualizacion',
  'evento',
  'causa',
  'categoriadelevento',
  'niveldelevento',
  'estadodelevento',
  'provincia',
  'canton',
  'parroquia',
  'sector',
  'latitud',
  'longitud',
  'personasafectadasdirectamente',
  'personasdamnificadas',
  'personasevacuadas',
  'personasheridas',
  'personasfallecidas',
  'familiasafectadas',
  'viviendasafectadas',
  'viviendasdestruidas',
  'puentesafectados',
  'metroslinealesdeviasafectadas',
  'hadecoberturavegetalquemada',
  'situacionactual',
  'fuentesdeinformacion',
].join(',');

const HOST_FIELDS = [
  'objectid',
  'secuencianacional',
  'fechadelevento',
  'horadelevento',
  'fechaultimaactualizacion',
  'horaultimaactualizacion',
  'evento',
  'causa',
  'categoriadelevento',
  'niveldelevento',
  'estadodelevento',
  'provincia',
  'canton',
  'parroquia',
  'sector',
  'latitud',
  'longitud',
  'personasafectadasdirectamente',
  'personasdamnificadas',
  'personasevacuadas',
  'personasheridas',
  'personasfallecidas',
  'familiasafectadas',
  'viviendasafectadas',
  'viviendasdestruidas',
  'puentesafectados',
  'metroslinealesdeviasafectadas',
  'hadecoberturavegetalquemada',
  'descripciongeneraldeevento',
  'fuentesdeinformacion',
].join(',');

export function buildSngrQueryUrl({
  baseOrigin = SNGR_BASE_ORIGIN,
  servicePath,
  outFields,
  limit = 100,
}) {
  const url = new URL(`${servicePath}/query`, baseOrigin);
  url.searchParams.set('where', '1=1');
  url.searchParams.set('outFields', outFields);
  url.searchParams.set('orderByFields', 'secuencianacional DESC');
  url.searchParams.set('resultRecordCount', String(limit));
  url.searchParams.set('outSR', '4326');
  url.searchParams.set('f', 'json');
  return url.toString();
}

/**
 * Bounded server service for Ecuador SNGR adverse events:
 * - Fixed origin (`https://sgrportal.gestionderiesgos.gob.ec`)
 * - Queries `EVENT_ADV_GEOJSON_FL` and `EVENT_ADV_HOST` in parallel
 * - Single-flight deduplication, 10-minute TTL, 6-hour finite stale fallback
 */
export function createSngrEventsService({
  fetchImpl = globalThis.fetch,
  now = Date.now,
  ttlMs = 600_000,
  maxStaleMs = 6 * 3600_000,
  baseOrigin = SNGR_BASE_ORIGIN,
} = {}) {
  let cache = null;
  let inflight = null;

  async function queryFeed({ feed, outFields, limit, currentNow }) {
    const url = buildSngrQueryUrl({
      baseOrigin,
      servicePath: feed.servicePath,
      outFields,
      limit,
    });
    const response = await fetchImpl(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'gods-eye-view/1.0',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`sngr:${feed.id}:${response.status}`);
    }
    const payload = await readResponseJsonCapped(response, 512_000);
    if (payload?.error) {
      throw new Error(
        `sngr:${feed.id}:${payload.error.code || 'arcgis_error'}`,
      );
    }
    return normalizeSngrFeatures(payload?.features, {
      feedId: feed.id,
      sourceUrl: feed.sourceUrl,
      now: currentNow,
    });
  }

  return {
    async getSnapshot() {
      const currentNow = now();
      if (cache && currentNow - cache.time < ttlMs) {
        return cache.value;
      }
      if (!inflight) {
        inflight = (async () => {
          try {
            const [rainyRes, hostRes] = await Promise.allSettled([
              queryFeed({
                feed: SNGR_FEEDS.rainySeason,
                outFields: RAINY_FIELDS,
                limit: 120,
                currentNow,
              }),
              queryFeed({
                feed: SNGR_FEEDS.nationalAdverse,
                outFields: HOST_FIELDS,
                limit: 80,
                currentNow,
              }),
            ]);

            if (
              rainyRes.status === 'rejected' &&
              hostRes.status === 'rejected'
            ) {
              throw rainyRes.reason || hostRes.reason;
            }

            const rainyEvents =
              rainyRes.status === 'fulfilled' ? rainyRes.value : [];
            const hostEvents =
              hostRes.status === 'fulfilled' ? hostRes.value : [];
            const events = mergeSngrEvents([rainyEvents, hostEvents], {
              limit: 150,
            });

            const newestMs = events[0]?.eventMs ?? null;
            const latestLagDays =
              newestMs !== null
                ? Math.max(
                    0,
                    Math.round(((currentNow - newestMs) / 86_400_000) * 10) /
                      10,
                  )
                : null;

            const value = {
              schemaVersion: 1,
              fetchedAt: new Date(currentNow).toISOString(),
              stale: false,
              rainySeasonError: rainyRes.status === 'rejected',
              nationalAdverseError: hostRes.status === 'rejected',
              latestEventAt: events[0]?.eventAt ?? null,
              latestLagDays,
              events,
            };
            cache = { time: currentNow, value };
            return value;
          } catch (error) {
            if (cache && currentNow - cache.time < maxStaleMs) {
              return { ...cache.value, stale: true };
            }
            throw error;
          } finally {
            inflight = null;
          }
        })();
      }
      return inflight;
    },
  };
}

export function sngrEventsProxy(options = {}) {
  const service = createSngrEventsService(options);
  return {
    name: 'sngr-events-proxy',
    configureServer(server) {
      server.middlewares.use('/api/sngr-events', async (req, res) => {
        const write = (status, body) => {
          res.writeHead(status, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          });
          res.end(JSON.stringify(body));
        };
        if (req.method !== 'GET') {
          write(405, { error: 'Method not allowed' });
          return;
        }
        const url = new URL(req.url || '/', 'http://localhost');
        for (const key of url.searchParams.keys()) {
          if (key !== '') {
            write(400, { error: 'Unknown query parameter' });
            return;
          }
        }
        try {
          write(200, await service.getSnapshot());
        } catch {
          write(502, { error: 'SNGR adverse events unavailable' });
        }
      });
    },
  };
}
