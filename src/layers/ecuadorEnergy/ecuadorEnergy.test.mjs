import assert from 'node:assert/strict';
import test from 'node:test';
import { createEcuadorEnergyLayer, plantDescription } from './index.js';
import {
  buildEcuadorEnergySnapshot,
  normalizeCelecItems,
  plantMarkerColor,
  plantStale,
} from './model.js';

const nowMs = Date.parse('2026-10-30T22:30:00Z');

function sampleSnapshot() {
  const celecByMrid = new Map([
    [
      30031,
      normalizeCelecItems(
        [
          { loctimestamp: '2026-10-30T22:00:00Z', valueedit: 2123.4 },
          { loctimestamp: '2026-10-30T10:00:00Z', valueedit: 2123.8 },
        ],
        nowMs,
      ),
    ],
    [
      30538,
      normalizeCelecItems(
        [{ loctimestamp: '2026-10-30T22:00:00Z', valueedit: 40.3 }],
        nowMs,
      ),
    ],
  ]);
  const cenace = {
    sourceDate: '2026-10-30',
    observedAt: '2026-10-30T22:00:00.000Z',
    observedMs: Date.parse('2026-10-30T22:00:00Z'),
    stale: false,
    dailyCompositionMWh: {
      hydroMWh: 51191.52,
      thermalMWh: 21543.57,
      naturalGasMWh: 1422,
      renewableMWh: 592.39,
      importMWh: 30.39,
      exportMWh: 57.42,
    },
    hydroGenerators: [
      { central: 'Coca Codo', generationMWh: 18584 },
      { central: 'Mazar', generationMWh: 389 },
    ],
    latestPowerMW: {
      slotECT: '17:00',
      demandMW: 4457.5,
      totalProductionMW: 4457.5,
      hydroMW: 3286.1,
      thermalMW: 1164.5,
      renewableMW: 6.9,
      importMW: 0,
      exportMW: 0,
    },
  };
  return buildEcuadorEnergySnapshot({
    cenace,
    celecByMrid,
    nowMs,
  });
}

function makeViewer() {
  return { dataSources: { add() {}, remove() {} }, camera: {} };
}

test('plantMarkerColor and plantStale distinguish Mazar thresholds, reservoir telemetry, cumulative MWh, and staleness', () => {
  const snap = sampleSnapshot();
  const mazar = snap.plants.find((p) => p.id === 'mazar');
  const coca = snap.plants.find((p) => p.id === 'coca-codo-sinclair');
  const agoyan = snap.plants.find((p) => p.id === 'agoyan');

  assert.equal(plantStale(mazar, nowMs), false);
  assert.equal(plantMarkerColor(mazar, false), '#2dd4bf');
  assert.equal(plantMarkerColor(coca, false), '#60a5fa');
  assert.equal(plantMarkerColor(agoyan, false), '#94a3b8');

  assert.equal(
    plantMarkerColor(
      {
        ...mazar,
        mazarAssessment: { reserveStatus: 'critical-sediment-zone' },
      },
      false,
    ),
    '#fb7185',
  );
  assert.equal(
    plantMarkerColor(
      {
        ...mazar,
        mazarAssessment: { reserveStatus: 'pre-alert-low' },
      },
      false,
    ),
    '#fbbf24',
  );
});

test('disabled layer does no work; repeated updates replace entities; disable aborts in-flight work', async () => {
  let calls = 0;
  let resolvePending;
  const snap = sampleSnapshot();
  const layer = createEcuadorEnergyLayer({
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
  assert.equal(layer.getStats().count, 8);
  assert.equal(layer.getAnalystRecords().length, 8);

  layer.disable();
  assert.deepEqual(layer.getAnalystRecords(), []);
  await layer.update();
  assert.equal(calls, 2);
  layer.destroy();

  const late = createEcuadorEnergyLayer({
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

test('provider failure retains plants, marks stale, and escapes HTML in descriptions', async () => {
  let fail = false;
  const snap = sampleSnapshot();
  const layer = createEcuadorEnergyLayer({
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
  assert.equal(layer.getStats().count, 8);

  const mazar = snap.plants.find((p) => p.id === 'mazar');
  const html = plantDescription(
    { ...mazar, name: '<script>alert(1)</script>' },
    snap.nationalSummary,
    true,
  );
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /cumulative MWh, not instantaneous MW/);
  layer.destroy();
});

test('verified site selection preserves role/provenance without copying plant metrics and cleans up', async () => {
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
        return { id: { id: 'ecuador-energy:sopladora-access-portal' } };
      },
    },
  };
  const layer = createEcuadorEnergyLayer({
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
  assert.equal(datasource.entities.values.length, 7);

  clickAction({ position: { x: 10, y: 20 } });
  const selectedCards = entries.get('ecuador-energy-selection');
  assert.equal(selectedCards.length, 1);
  assert.ok(
    selectedCards[0].details.some((line) => line.includes('access-portal')),
  );

  assert.ok(
    selectedCards[0].details.some((line) =>
      line.includes('No observation assigned'),
    ),
  );
  assert.ok(!selectedCards[0].details.some((line) => line.includes('MWh')));
  assert.match(
    plantDescription(snap.plants.find((p) => p.id === 'mazar')),
    /Mazar thresholds/,
  );
  assert.equal(
    layer.getLoadedPointSnapshot().records.filter((r) => r.coordinatesVerified)
      .length,
    2,
  );
  assert.equal(datasource.entities.getById('ecuador-energy:mazar'), undefined);
  layer.disable();
  assert.equal(destroyed, 1);
  assert.equal(owners.size, 0);
  assert.equal(entries.has('ecuador-energy-selection'), false);
  layer.destroy();
});
