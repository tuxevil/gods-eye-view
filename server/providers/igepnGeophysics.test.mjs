import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ECUADOR_VOLCANO_CATALOG,
  buildVolcanoSummaries,
  formatEctTimestamp,
  igepnRecordColor,
  normalizeIgepnTectonicQuakes,
  normalizeIgepnVolcanicQuakes,
  polygonCentroid,
} from '../../src/layers/igepnGeophysics/model.js';
import {
  buildIgepnQueryUrl,
  createIgepnGeophysicsService,
  igepnGeophysicsProxy,
} from './igepnGeophysics.js';

const NOW = Date.parse('2026-10-30T18:00:00-05:00');
const polygon = {
  rings: [
    [
      [-78.4, -0.6],
      [-78.2, -0.6],
      [-78.2, -0.4],
      [-78.4, -0.4],
      [-78.4, -0.6],
    ],
  ],
};

function tectonicFeature(overrides = {}) {
  return {
    attributes: {
      sis3_id: 5312119,
      sis3_evento: 'igepn2026vhbp',
      sis3_tiempo: Date.parse('2026-10-30T17:02:15Z'),
      sis3_tiempoMS: 348462,
      sis3_ultima_modificacion: Date.parse('2026-10-30T17:10:00Z'),
      sis3_latitud: -3.839777,
      sis3_longitud: -77.76847,
      sis3_profundidad: 30,
      sis3_magnitud_M: 3.4,
      sis3_tipo_magnitud_P: 'MLv',
      sis3_azimuthalGap: 120,
      sis3_estacionesUsadas: 12,
      sis3_fasesUsadas: 33,
      ...overrides,
    },
  };
}

function volcanicFeature(overrides = {}) {
  return {
    attributes: {
      svo3_id: 100,
      svo3_nombre_volcan: 'Cotopaxi',
      svo3_evento: 'igepn2026vabc',
      svo3_tiempo: Date.parse('2026-10-29T12:00:00Z'),
      svo3_latitud: -0.679333,
      svo3_longitud: -78.4375,
      svo3_profundidad: null,
      svo3_zprofundidad: 1.25,
      svo3_magnitud_M: 1.2,
      svo3_tipo_magnitud_P: 'MLv',
      svo3_TipoEventoVolcanico: 'VT',
      svo3_estacionesUsadas: 8,
      svo3_fasesUsadas: 10,
      ...overrides,
    },
  };
}

test('IGEPN catalog has 15 official monitored edifices; local timestamps are explicit ECT', () => {
  assert.equal(ECUADOR_VOLCANO_CATALOG.length, 15);
  assert.ok(
    ECUADOR_VOLCANO_CATALOG.some(
      (v) => v.name === 'Chiles - Cerro Negro de Mayasquer',
    ),
  );
  assert.equal(
    formatEctTimestamp(Date.parse('2026-10-30T17:02:15Z')),
    '2026-10-30 12:02 ECT',
  );
  const center = polygonCentroid(polygon);
  assert.ok(Math.abs(center.lat + 0.5) < 1e-9);
  assert.ok(Math.abs(center.lon + 78.3) < 1e-9);
  assert.equal(polygonCentroid({ rings: [] }), null);
});

test('tectonic and volcanic observations normalize as separate event types with units and source provenance', () => {
  const tectonic = normalizeIgepnTectonicQuakes([tectonicFeature()], {
    now: NOW,
  });
  const volcanic = normalizeIgepnVolcanicQuakes([volcanicFeature()], {
    now: NOW,
  });
  assert.equal(tectonic.length, 1);
  assert.equal(tectonic[0].recordType, 'tectonic_quake');
  assert.equal(tectonic[0].id, 'tectonic-igepn2026vhbp');
  assert.equal(tectonic[0].magnitude, 3.4);
  assert.equal(tectonic[0].depthKm, 30);
  assert.equal(tectonic[0].observedECT, '2026-10-30 12:02 ECT');
  assert.match(tectonic[0].sourceUrl, /Sismicidad_tect%C3%B3nica/);
  assert.equal(volcanic.length, 1);
  assert.equal(volcanic[0].recordType, 'volcanic_quake');
  assert.equal(volcanic[0].signalType, 'VT');
  assert.equal(volcanic[0].depthKm, 1.25);
  assert.match(volcanic[0].sourceUrl, /Sismicidad_volcanica/);

  assert.equal(
    normalizeIgepnTectonicQuakes(
      [
        tectonicFeature({ sis3_latitud: 40 }),
        tectonicFeature({ sis3_tiempo: NOW + 3 * 86_400_000 }),
        tectonicFeature({ sis3_magnitud_M: null }),
      ],
      { now: NOW },
    ).length,
    0,
  );
});

test('volcano summaries count only actual 7/30/90-day signals and never infer alerts from catalog classes', () => {
  const events = normalizeIgepnVolcanicQuakes(
    [
      volcanicFeature(),
      volcanicFeature({
        svo3_id: 101,
        svo3_evento: 'igepn2026vdef',
        svo3_tiempo: NOW - 10 * 86_400_000,
        svo3_TipoEventoVolcanico: 'LP',
        svo3_magnitud_M: 1.1,
      }),
      volcanicFeature({
        svo3_id: 102,
        svo3_evento: 'igepn2026vghi',
        svo3_tiempo: NOW - 40 * 86_400_000,
        svo3_TipoEventoVolcanico: 'EXP',
        svo3_magnitud_M: 1.5,
      }),
      volcanicFeature({
        svo3_id: 103,
        svo3_evento: 'igepn2026vold',
        svo3_tiempo: NOW - 100 * 86_400_000,
        svo3_TipoEventoVolcanico: 'EXP',
      }),
    ],
    { now: NOW },
  );
  const cotopaxi = buildVolcanoSummaries(events, { now: NOW }).find(
    (v) => v.name === 'Cotopaxi',
  );
  assert.equal(cotopaxi.events7d, 1);
  assert.equal(cotopaxi.events30d, 2);
  assert.equal(cotopaxi.events90d, 3);
  assert.equal(cotopaxi.signals.VT, 1);
  assert.equal(cotopaxi.signals.LP, 1);
  assert.equal(cotopaxi.signals.EXP, 1);
  assert.equal(cotopaxi.eruptiveClass, null);
  assert.equal(igepnRecordColor(cotopaxi), '#f97316');
  assert.equal(igepnRecordColor(cotopaxi, true), '#9ca3af');
});

test('fixed-origin ArcGIS query construction encodes safe filters and bounds payload shape', () => {
  const url = new URL(
    buildIgepnQueryUrl({
      servicePath: '/server/rest/services/test/MapServer/0',
      outFields: 'a,b',
      where: "event_date >= DATE '2026-09-30 00:00:00'",
      orderByFields: 'event_date DESC',
      limit: 50,
    }),
  );
  assert.equal(url.origin, 'https://srvsigaweb.igepn.edu.ec');
  assert.equal(url.searchParams.get('resultRecordCount'), '50');
  assert.equal(url.searchParams.get('outFields'), 'a,b');
  assert.match(url.searchParams.get('where'), /DATE '2026-09-30/);
});

test('service tolerates partial feed outages, caches, single-flights, and marks cached fallback stale', async () => {
  let clock = NOW;
  let requests = 0;
  let failCatalog = false;
  let failAll = false;
  const fetchImpl = async (rawUrl) => {
    requests += 1;
    const url = new URL(rawUrl);
    if (failAll) return new Response('upstream failure', { status: 503 });
    if (url.pathname.includes('Sismicidad_tect')) {
      return Response.json({ features: [tectonicFeature()] });
    }
    if (url.pathname.includes('Sismicidad_volcanica')) {
      return Response.json({ features: [volcanicFeature()] });
    }
    if (failCatalog) return new Response('upstream failure', { status: 503 });
    return Response.json({
      features: [
        {
          attributes: {
            vd_id: 28,
            vd_name: 'Cotopaxi',
            Altura: 5898,
            clas_eruptiva: 2,
            clas_morfologica: 'E',
          },
          geometry: polygon,
        },
      ],
    });
  };
  const service = createIgepnGeophysicsService({
    now: () => clock,
    ttlMs: 10_000,
    maxStaleMs: 120_000,
    fetchImpl,
  });
  const [a, b] = await Promise.all([
    service.getSnapshot(),
    service.getSnapshot(),
  ]);
  assert.equal(requests, 3);
  assert.equal(a, b);
  assert.equal(a.stale, false);
  assert.equal(a.tectonicQuakes.length, 1);
  assert.equal(a.volcanicQuakes.length, 1);
  const cotopaxi = a.volcanoes.find((v) => v.name === 'Cotopaxi');
  assert.equal(cotopaxi.catalogListed, true);
  assert.equal(cotopaxi.catalogVintage, 2021);
  assert.equal(cotopaxi.elevationM, 5898);
  assert.ok(Math.abs(cotopaxi.lat + 0.5) < 1e-9);
  assert.equal(a.catalogError, false);
  assert.equal(a.volcanoes.length, 15);
  assert.equal(cotopaxi.events90d, 1);

  clock += 11_000;
  failCatalog = true;
  const partial = await service.getSnapshot();
  assert.equal(partial.stale, false);
  assert.equal(partial.catalogError, true);
  assert.equal(partial.tectonicError, false);
  assert.equal(partial.volcanicError, false);

  clock += 11_000;
  failAll = true;
  const stale = await service.getSnapshot();
  assert.equal(stale.stale, true);
  assert.equal(stale.fetchedAt, partial.fetchedAt);
  assert.equal(stale.volcanicCount, partial.volcanicCount);
});

test('proxy enforces GET-only query contract and returns upstream failure safely', async () => {
  let middleware;
  igepnGeophysicsProxy({
    fetchImpl: async () => new Response('unavailable', { status: 503 }),
  }).configureServer({
    middlewares: {
      use(_path, handler) {
        middleware = handler;
      },
    },
  });
  const call = async (method, url) => {
    let status;
    let body;
    await middleware(
      { method, url },
      {
        writeHead(value) {
          status = value;
        },
        end(text) {
          body = JSON.parse(text);
        },
      },
    );
    return { status, body };
  };
  assert.equal((await call('POST', '/')).status, 405);
  assert.equal((await call('GET', '/?anything=1')).status, 400);
  assert.deepEqual(await call('GET', '/'), {
    status: 502,
    body: { error: 'IGEPN seismic data unavailable' },
  });
});
