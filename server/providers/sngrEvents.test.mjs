import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSngrTimestamp,
  classifySngrHazard,
  normalizeSngrFeatures,
  mergeSngrEvents,
} from '../../src/layers/sngrEvents/model.js';
import { createSngrEventsService, sngrEventsProxy } from './sngrEvents.js';

const NOW = Date.parse('2026-10-30T23:00:00Z');

test('parseSngrTimestamp parses DD/MM/YYYY, YYYY-MM-DD, and epoch ms in America/Guayaquil (-05:00)', () => {
  const dmy = parseSngrTimestamp('15/09/2026', '04:00');
  assert.deepEqual(dmy, {
    iso: '2026-09-15T09:00:00.000Z',
    ms: Date.parse('2026-09-15T04:00:00-05:00'),
    dateECT: '2026-09-15',
    timeECT: '04:00',
  });

  const ymd = parseSngrTimestamp('2026-09-01', '10:27:34');
  assert.equal(ymd.iso, '2026-09-01T15:27:34.000Z');
  assert.equal(ymd.dateECT, '2026-09-01');
  assert.equal(ymd.timeECT, '10:27');

  const epoch = parseSngrTimestamp(1788220800000, '05:03');
  assert.equal(epoch.iso, '2026-09-01T10:03:00.000Z');

  assert.equal(parseSngrTimestamp('invalid', '12:00'), null);
});

test('classifySngrHazard categorizes flood, landslide, rain_wind, wildfire, and other', () => {
  assert.equal(classifySngrHazard('Inundación', 'Lluvias intensas'), 'flood');
  assert.equal(classifySngrHazard('Aluvión (Flujos)', 'Lluvias'), 'flood');
  assert.equal(
    classifySngrHazard('Deslizamiento', 'Lluvias intensas'),
    'landslide',
  );
  assert.equal(classifySngrHazard('Erosión Hídrica', 'Creciente'), 'landslide');
  assert.equal(
    classifySngrHazard('Incendio Forestal', 'Desconocida'),
    'wildfire',
  );
  assert.equal(classifySngrHazard('Lluvias Intensas', 'Natural'), 'rain_wind');
  assert.equal(classifySngrHazard('Vendaval', 'Vientos'), 'rain_wind');
  assert.equal(classifySngrHazard('Contaminación', 'Antrópico'), 'other');
});

test('normalizeSngrFeatures and mergeSngrEvents validate bounds, reject future dates, and deduplicate by sequenceId', () => {
  const rainyFeatures = [
    {
      attributes: {
        objectid: 3290,
        secuencianacional: 66118,
        fechadelevento: '15/09/2026',
        horadelevento: '04:00',
        fechaultimaactualizacion: '15/9/2026',
        horaultimaactualizacion: '12:56:45',
        evento: 'Deslizamiento',
        causa: 'Lluvias intensas',
        categoriadelevento: 'Natural',
        niveldelevento: 'Nivel 1',
        estadodelevento: 'Seguimiento',
        provincia: 'Santo Domingo De Los Tsáchilas',
        canton: 'La Concordia',
        parroquia: 'La Concordia',
        sector: 'Sector Las Vegas',
        latitud: -0.001203,
        longitud: -79.400429,
        personasafectadasdirectamente: 4,
        viviendasafectadas: 1,
        situacionactual: 'UGR GAD La Concordia en sitio.',
        fuentesdeinformacion: 'ECU 911 /n ',
      },
    },
    {
      // Out of Ecuador bounds
      attributes: {
        objectid: 9999,
        secuencianacional: 66119,
        fechadelevento: '15/09/2026',
        horadelevento: '04:00',
        evento: 'Inundación',
        latitud: 40.0,
        longitud: -3.0,
      },
    },
    {
      // Future event beyond 24h tolerance
      attributes: {
        objectid: 9998,
        secuencianacional: 66120,
        fechadelevento: '15/12/2026',
        horadelevento: '04:00',
        evento: 'Inundación',
        latitud: -1.0,
        longitud: -79.0,
      },
    },
  ];

  const hostFeatures = [
    {
      // Same sequenceId 66118 but older update time -> should keep rainyFeatures version
      attributes: {
        objectid: 100,
        secuencianacional: 66118,
        fechadelevento: 1789430400000,
        horadelevento: '04:00',
        fechaultimaactualizacion: '2026-09-15',
        horaultimaactualizacion: '08:00:00',
        evento: 'Deslizamiento',
        provincia: 'SANTO DOMINGO',
        latitud: -0.001203,
        longitud: -79.400429,
        descripciongeneraldeevento: 'Versión anterior',
      },
    },
    {
      attributes: {
        objectid: 1534330,
        secuencianacional: 65294,
        fechadelevento: 1788220800000,
        horadelevento: '05:03',
        fechaultimaactualizacion: '2026-09-01',
        horaultimaactualizacion: '10:27:34',
        evento: 'Incendio Forestal',
        causa: 'Desconocida',
        categoriadelevento: 'Antrópico',
        niveldelevento: 'Nivel 1',
        estadodelevento: 'Seguimiento',
        provincia: 'IMBABURA',
        canton: 'IBARRA',
        latitud: 0.316711,
        longitud: -78.115649,
        hadecoberturavegetalquemada: 2.5,
      },
    },
  ];

  const normalizedRainy = normalizeSngrFeatures(rainyFeatures, {
    feedId: 'EVENT_ADV_GEOJSON_FL',
    now: NOW,
  });
  const normalizedHost = normalizeSngrFeatures(hostFeatures, {
    feedId: 'EVENT_ADV_HOST',
    now: NOW,
  });

  assert.equal(normalizedRainy.length, 1);
  assert.equal(normalizedHost.length, 2);

  const merged = mergeSngrEvents([normalizedRainy, normalizedHost]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].sequenceId, 66118);
  assert.equal(merged[0].descripcion, 'UGR GAD La Concordia en sitio.');
  assert.equal(merged[0].impacts.personasAfectadas, 4);
  assert.equal(merged[1].sequenceId, 65294);
  assert.equal(merged[1].hazardCategory, 'wildfire');
  assert.equal(merged[1].impacts.haQuemadas, 2.5);
});

test('createSngrEventsService handles single-flight, partial degradation, stale fallback, and proxy validation', async () => {
  let clock = NOW;
  let shouldFailAll = false;
  let failHostOnly = false;

  const service = createSngrEventsService({
    now: () => clock,
    ttlMs: 60_000,
    maxStaleMs: 300_000,
    fetchImpl: async (url) => {
      if (shouldFailAll) {
        return new Response('err', { status: 503 });
      }
      if (String(url).includes('EVENT_ADV_HOST') && failHostOnly) {
        return new Response('err', { status: 502 });
      }
      return new Response(
        JSON.stringify({
          features: [
            {
              attributes: {
                objectid: 1,
                secuencianacional: 66118,
                fechadelevento: '15/09/2026',
                horadelevento: '04:00',
                evento: 'Inundación',
                provincia: 'Los Ríos',
                canton: 'Valencia',
                latitud: -0.95,
                longitud: -79.35,
              },
            },
          ],
        }),
        { status: 200 },
      );
    },
  });

  failHostOnly = true;
  const partial = await service.getSnapshot();
  assert.equal(partial.stale, false);
  assert.equal(partial.rainySeasonError, false);
  assert.equal(partial.nationalAdverseError, true);
  assert.equal(partial.events.length, 1);

  // Stale fallback when both feeds fail within maxStaleMs
  clock += 120_000;
  shouldFailAll = true;
  const staleSnap = await service.getSnapshot();
  assert.equal(staleSnap.stale, true);
  assert.equal(staleSnap.events.length, 1);

  // Proxy middleware checks
  let mw;
  sngrEventsProxy({
    fetchImpl: async () => new Response('err', { status: 503 }),
  }).configureServer({
    middlewares: {
      use(_path, fn) {
        mw = fn;
      },
    },
  });

  const call = async (method, url) => {
    let status;
    let body;
    await mw(
      { method, url },
      {
        writeHead(s) {
          status = s;
        },
        end(b) {
          body = JSON.parse(b);
        },
      },
    );
    return { status, body };
  };

  assert.equal((await call('POST', '/')).status, 405);
  assert.equal((await call('GET', '/?foo=1')).status, 400);
  assert.equal((await call('GET', '/')).status, 502);
});
