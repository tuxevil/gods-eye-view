import { readResponseJsonCapped } from './common/http.js';
import {
  ECUADOR_VOLCANO_CATALOG,
  IGEPN_BASE_ORIGIN,
  IGEPN_FEEDS,
  buildVolcanoSummaries,
  normalizeIgepnTectonicQuakes,
  normalizeIgepnVolcanicQuakes,
  polygonCentroid,
} from '../../src/layers/igepnGeophysics/model.js';

const TECTONIC_FIELDS = [
  'sis3_id',
  'sis3_evento',
  'sis3_tiempo',
  'sis3_tiempoMS',
  'sis3_ultima_modificacion',
  'sis3_latitud',
  'sis3_longitud',
  'sis3_profundidad',
  'sis3_magnitud_M',
  'sis3_tipo_magnitud_P',
  'sis3_azimuthalGap',
  'sis3_estacionesUsadas',
  'sis3_fasesUsadas',
].join(',');

const VOLCANIC_FIELDS = [
  'svo3_id',
  'svo3_nombre_volcan',
  'svo3_evento',
  'svo3_tiempo',
  'svo3_latitud',
  'svo3_longitud',
  'svo3_profundidad',
  'svo3_zprofundidad',
  'svo3_magnitud_M',
  'svo3_tipo_magnitud_P',
  'svo3_TipoEventoVolcanico',
  'svo3_estacionesUsadas',
  'svo3_fasesUsadas',
].join(',');

const VOLCANO_CATALOG_FIELDS = [
  'vd_id',
  'vd_name',
  'vd_name2',
  'Altura',
  'clas_eruptiva',
  'clas_morfologica',
].join(',');

const VOLCANIC_WINDOW_DAYS = 90;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export function buildIgepnQueryUrl({
  baseOrigin = IGEPN_BASE_ORIGIN,
  servicePath,
  outFields = '*',
  limit = 500,
  where = '1=1',
  orderByFields,
  geometry = false,
  generalize = false,
}) {
  const url = new URL(`${servicePath}/query`, baseOrigin);
  url.searchParams.set('where', where);
  url.searchParams.set('outFields', outFields);
  if (orderByFields) url.searchParams.set('orderByFields', orderByFields);
  url.searchParams.set('resultRecordCount', String(limit));
  url.searchParams.set('outSR', '4326');
  url.searchParams.set('f', 'json');
  if (geometry) {
    url.searchParams.set('returnGeometry', 'true');
    if (generalize) {
      url.searchParams.set('maxAllowableOffset', '0.02');
      url.searchParams.set('geometryPrecision', '4');
    }
  } else {
    url.searchParams.set('returnGeometry', 'false');
  }
  return url.toString();
}

export function createIgepnGeophysicsService({
  fetchImpl = globalThis.fetch,
  now = Date.now,
  ttlMs = 300_000,
  maxStaleMs = 3_600_000,
  baseOrigin = IGEPN_BASE_ORIGIN,
} = {}) {
  let cache = null;
  let inflight = null;

  async function query({
    servicePath,
    outFields,
    where,
    orderByFields,
    limit,
    geometry,
    generalize,
  }) {
    const url = buildIgepnQueryUrl({
      baseOrigin,
      servicePath,
      outFields,
      where,
      orderByFields,
      limit,
      geometry,
      generalize,
    });
    const response = await fetchImpl(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'gods-eye-view/1.0',
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`igepn:${response.status}`);
    const payload = await readResponseJsonCapped(response, MAX_RESPONSE_BYTES);
    if (payload?.error) {
      throw new Error(`igepn:${payload.error.code || 'arcgis_error'}`);
    }
    if (!Array.isArray(payload?.features)) {
      throw new Error('igepn:invalid_feature_response');
    }
    return payload.features;
  }

  async function collect(currentNow) {
    const threshold = new Date(currentNow - VOLCANIC_WINDOW_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const [tectonicResult, volcanicResult, catalogResult] =
      await Promise.allSettled([
        query({
          servicePath: IGEPN_FEEDS.tectonic.servicePath,
          outFields: TECTONIC_FIELDS,
          orderByFields: 'sis3_tiempo DESC',
          limit: 600,
        }),
        query({
          servicePath: IGEPN_FEEDS.volcanic.servicePath,
          outFields: VOLCANIC_FIELDS,
          where: `svo3_tiempo >= DATE '${threshold} 00:00:00'`,
          orderByFields: 'svo3_tiempo DESC',
          limit: 500,
        }),
        query({
          servicePath:
            '/server/rest/services/Peligro_volcánico_y_población_2021_MIL1/MapServer/0',
          outFields: VOLCANO_CATALOG_FIELDS,
          limit: 50,
          geometry: true,
          generalize: true,
        }),
      ]);

    const tectonicError = tectonicResult.status === 'rejected';
    const volcanicError = volcanicResult.status === 'rejected';
    const catalogError = catalogResult.status === 'rejected';
    if (tectonicError && volcanicError && catalogError) {
      throw (
        tectonicResult.reason || volcanicResult.reason || catalogResult.reason
      );
    }

    const tectonicQuakes =
      tectonicResult.status === 'fulfilled'
        ? normalizeIgepnTectonicQuakes(tectonicResult.value, {
            now: currentNow,
          })
        : [];
    const volcanicQuakes =
      volcanicResult.status === 'fulfilled'
        ? normalizeIgepnVolcanicQuakes(volcanicResult.value, {
            now: currentNow,
          })
        : [];
    const recentVolcanicQuakes = volcanicQuakes.filter(
      (quake) =>
        quake.observedMs <= currentNow &&
        currentNow - quake.observedMs <= VOLCANIC_WINDOW_DAYS * 86_400_000,
    );
    const catalogAttributes =
      catalogResult.status === 'fulfilled'
        ? catalogResult.value.map((feature) => feature?.attributes || {})
        : [];
    const catalogNames = new Set(
      catalogAttributes
        .map((attributes) =>
          String(`${attributes.vd_name || ''} ${attributes.vd_name2 || ''}`)
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    );
    const volcanoes = buildVolcanoSummaries(recentVolcanicQuakes, {
      now: currentNow,
    }).map((volcano) => {
      const catalogMatch = catalogAttributes.find((attributes) => {
        const name = String(
          `${attributes.vd_name || ''} ${attributes.vd_name2 || ''}`,
        )
          .trim()
          .toLowerCase();
        return volcano.aliases.some((alias) => {
          const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return new RegExp(`(?:^|[^a-z])${escaped}(?:$|[^a-z])`, 'i').test(
            name,
          );
        });
      });
      const catalogFeature = catalogMatch
        ? catalogResult.value.find(
            (feature) => feature?.attributes === catalogMatch,
          )
        : null;
      return {
        ...volcano,
        ...(volcanicError
          ? {
              events7d: null,
              events30d: null,
              events90d: null,
              signals: { VT: null, LP: null, EXP: null, TREMI: null, ND: null },
            }
          : {}),
        catalogListed: catalogError
          ? null
          : Boolean(catalogMatch) ||
            volcano.aliases.some((alias) => catalogNames.has(alias)),
        elevationM:
          catalogMatch && Number.isFinite(Number(catalogMatch.Altura))
            ? Number(catalogMatch.Altura)
            : null,
        ...(polygonCentroid(catalogFeature?.geometry) || {}),
        eruptiveClass:
          catalogMatch && Number.isFinite(Number(catalogMatch.clas_eruptiva))
            ? Number(catalogMatch.clas_eruptiva)
            : null,
        catalogName: catalogMatch?.vd_name || null,
      };
    });

    const errors = {
      tectonicError,
      volcanicError,
      catalogError,
    };
    return {
      schemaVersion: 1,
      fetchedAt: new Date(currentNow).toISOString(),
      stale: false,
      sourceAt: {
        tectonic: tectonicQuakes[0]?.observedAt || null,
        volcanic: recentVolcanicQuakes[0]?.observedAt || null,
        catalog: null,
      },
      latestTectonicAt: tectonicQuakes[0]?.observedAt || null,
      latestVolcanicAt: recentVolcanicQuakes[0]?.observedAt || null,
      volcanicWindowDays: VOLCANIC_WINDOW_DAYS,
      catalogVintage: 2021,
      tectonicError,
      volcanicError,
      catalogError,
      unavailable: {
        tectonic: tectonicError,
        volcanic: volcanicError,
        volcanoCatalog: catalogError,
      },
      summary: {
        volcanoesCatalogued: catalogError ? null : catalogNames.size,
        volcanoesWithSignals30d: volcanicError
          ? null
          : volcanoes.filter((v) => v.events30d > 0).length,
        tectonicCount: tectonicQuakes.length,
        volcanicCount: volcanicError ? null : recentVolcanicQuakes.length,
      },
      sources: {
        tectonic: IGEPN_FEEDS.tectonic.sourceUrl,
        volcanic: IGEPN_FEEDS.volcanic.sourceUrl,
        volcanoCatalog: `${baseOrigin}/server/rest/services/Peligro_volcánico_y_población_2021_MIL1/MapServer/0`,
      },
      volcanoes,
      tectonicQuakes,
      volcanicQuakes: recentVolcanicQuakes.slice(0, 300),
      errors,
      catalogExpectedCount: ECUADOR_VOLCANO_CATALOG.length,
    };
  }

  return {
    async getSnapshot() {
      const currentNow = now();
      if (cache && currentNow - cache.time < ttlMs) return cache.value;
      if (!inflight) {
        inflight = (async () => {
          try {
            const value = await collect(currentNow);
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

export function igepnGeophysicsProxy(options = {}) {
  const service = createIgepnGeophysicsService(options);
  const install = (server) => {
    server.middlewares.use('/api/igepn-geophysics', async (req, res) => {
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
      if ([...url.searchParams.keys()].some((key) => key !== '')) {
        write(400, { error: 'Unknown query parameter' });
        return;
      }
      try {
        write(200, await service.getSnapshot());
      } catch {
        write(502, { error: 'IGEPN seismic data unavailable' });
      }
    });
  };
  return {
    name: 'igepn-geophysics-proxy',
    configureServer: install,
    configurePreviewServer: install,
  };
}
