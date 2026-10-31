import assert from 'node:assert/strict';
import test from 'node:test';
import { createSngrEventsLayer, sngrEventDescription } from './index.js';
import { classifySngrHazard, sngrHazardColor } from './model.js';

const sampleEvent = {
  id: 'sngr-66118',
  sequenceId: 66118,
  feedId: 'EVENT_ADV_GEOJSON_FL',
  sourceUrl:
    'https://sgrportal.gestionderiesgos.gob.ec/server/rest/services/Hosted/EVENT_ADV_GEOJSON_FL/FeatureServer/0',
  lat: -0.0012,
  lon: -79.4004,
  evento: 'Deslizamiento',
  causa: 'Lluvias intensas',
  categoria: 'Natural',
  hazardCategory: 'landslide',
  nivel: 'Nivel 1',
  estado: 'Seguimiento',
  provincia: 'Santo Domingo De Los Tsáchilas',
  canton: 'La Concordia',
  parroquia: 'La Concordia',
  sector: 'Sector Las Vegas <script>alert(1)</script>',
  eventAt: '2026-09-15T09:00:00.000Z',
  eventMs: Date.parse('2026-09-15T09:00:00.000Z'),
  eventDateECT: '2026-09-15',
  eventTimeECT: '04:00',
  updatedAt: '2026-09-15T17:56:45.000Z',
  updatedMs: Date.parse('2026-09-15T17:56:45.000Z'),
  lagDays: 45.4,
  impacts: {
    personasAfectadas: 4,
    personasDamnificadas: 0,
    personasEvacuadas: 0,
    personasHeridas: 0,
    personasFallecidas: 0,
    familiasAfectadas: 1,
    viviendasAfectadas: 1,
    viviendasDestruidas: 0,
    puentesAfectados: 0,
    viasAfectadasMetros: 15,
    haQuemadas: 0,
  },
  descripcion: 'UGR GAD La Concordia en sitio.',
  fuenteInformacion: 'ECU 911',
  scopeNote:
    'SNGR field incident report (REDM/EVIN); historical/monitored record with publication lag, not a real-time warning or susceptibility map.',
};

function sampleSnapshot() {
  return {
    schemaVersion: 1,
    fetchedAt: '2026-10-30T23:00:00.000Z',
    stale: false,
    rainySeasonError: false,
    nationalAdverseError: false,
    latestEventAt: sampleEvent.eventAt,
    latestLagDays: 45.4,
    events: [sampleEvent],
  };
}

function makeViewer() {
  return { dataSources: { add() {}, remove() {} }, camera: {} };
}

test('sngrHazardColor distinguishes hazard categories and stale state', () => {
  assert.equal(sngrHazardColor(classifySngrHazard('Inundación')), '#38bdf8');
  assert.equal(sngrHazardColor(classifySngrHazard('Deslizamiento')), '#f59e0b');
  assert.equal(
    sngrHazardColor(classifySngrHazard('Lluvias Intensas')),
    '#818cf8',
  );
  assert.equal(
    sngrHazardColor(classifySngrHazard('Incendio Forestal')),
    '#ef4444',
  );
  assert.equal(sngrHazardColor('flood', true), '#9ca3af');
});

test('disabled layer does no work; repeated updates replace entities; disable aborts in-flight work', async () => {
  let calls = 0;
  let resolvePending;
  const snap = sampleSnapshot();
  const layer = createSngrEventsLayer({
    source: {
      async getSnapshot() {
        calls++;
        return snap;
      },
    },
  });
  layer.init(makeViewer());
  assert.equal(await layer.update(), false);
  assert.equal(calls, 0);

  layer.enable();
  await layer.update();
  await layer.update();
  assert.equal(layer.getStats().count, 1);
  assert.equal(layer.getAnalystRecords().length, 1);

  layer.disable();
  assert.deepEqual(layer.getAnalystRecords(), []);
  await layer.update();
  assert.equal(calls, 2);
  layer.destroy();

  const late = createSngrEventsLayer({
    source: {
      getSnapshot() {
        return new Promise((r) => {
          resolvePending = r;
        });
      },
    },
  });
  late.init(makeViewer());
  late.enable();
  const inflight = late.update();
  late.disable();
  late.enable();
  resolvePending(snap);
  assert.equal(await inflight, false);
  assert.equal(late.getStats().count, 0);
  late.destroy();
});

test('provider failure retains events, marks stale, and escapes HTML in descriptions', async () => {
  let fail = false;
  const snap = sampleSnapshot();
  const layer = createSngrEventsLayer({
    source: {
      async getSnapshot() {
        if (fail) throw new Error('network error');
        return snap;
      },
    },
  });
  layer.init(makeViewer());
  layer.enable();
  await layer.update();
  fail = true;
  await layer.update();
  assert.equal(layer.getStats().stale, true);
  assert.equal(layer.getStats().count, 1);

  const html = sngrEventDescription(sampleEvent, true);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /#66118/);
  assert.match(html, /Publication lag/);
  layer.destroy();
});

test('selection overlay cards display SNGR sequence and clean up on disable/destroy', async () => {
  const snap = sampleSnapshot();
  let datasource;
  let clickAction;
  let destroyed = 0;
  const entries = new Map();
  const owners = new Map();
  const v = {
    dataSources: {
      add(d) {
        datasource = d;
      },
      remove(d) {
        assert.equal(d, datasource);
      },
    },
    camera: {},
    scene: {
      pick() {
        return { id: { id: 'sngr-events:sngr-66118' } };
      },
    },
  };
  const layer = createSngrEventsLayer({
    source: {
      async getSnapshot() {
        return snap;
      },
    },
    overlayHost: {
      setEntries(id, rows) {
        entries.set(id, rows);
      },
      setVisible() {},
      clearSource(id) {
        entries.delete(id);
      },
    },
    picking: {
      registerPickOwner(id, fn) {
        owners.set(id, fn);
      },
      unregisterPickOwner(id) {
        owners.delete(id);
      },
      resolvePickId(p) {
        return p.id.id;
      },
    },
    handlerFactory() {
      return {
        setInputAction(fn) {
          clickAction = fn;
        },
        destroy() {
          destroyed++;
        },
      };
    },
  });
  layer.init(v);
  layer.enable();
  await layer.update();
  await layer.update();
  assert.equal(datasource.entities.values.length, 1);

  clickAction({ position: { x: 10, y: 20 } });
  const selectedCards = entries.get('sngr-events-selection');
  assert.equal(selectedCards.length, 1);
  assert.ok(
    selectedCards[0].details.some((line) => line.includes('SNGR #66118')),
  );

  layer.disable();
  assert.equal(destroyed, 1);
  assert.equal(owners.size, 0);
  assert.equal(entries.has('sngr-events-selection'), false);
  layer.destroy();
});
