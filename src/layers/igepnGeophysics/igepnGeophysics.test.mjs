import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createIgepnGeophysicsLayer,
  eventDescription,
  volcanoDescription,
} from './index.js';

const quake = {
  id: 'tectonic-igepn2026qabc',
  recordType: 'tectonic_quake',
  eventCode: 'igepn2026qabc',
  lat: -0.8,
  lon: -78.6,
  magnitude: 3.4,
  magnitudeType: 'MLv',
  depthKm: 20,
  stationsUsed: 5,
  phasesUsed: 12,
  observedAt: '2026-10-30T17:00:00.000Z',
  observedMs: Date.parse('2026-10-30T17:00:00Z'),
  observedECT: '2026-10-30 12:00 ECT',
  sourceUrl: 'https://example.invalid/tectonic',
};

const volcano = {
  id: 'volcano-cot',
  recordType: 'volcano',
  name: 'Cotopaxi',
  province: 'Cotopaxi / Pichincha',
  lat: -0.68,
  lon: -78.44,
  elevationM: 5898,
  eruptiveClass: 2,
  catalogListed: true,
  catalogName: 'Cotopaxi',
  catalogVintage: 2021,
  events90d: 2,
  events30d: 1,
  events7d: 0,
  signals: { VT: 1, LP: 1, EXP: 0, TREMI: 0, ND: 0 },
  maxMagnitude: 1.4,
  latestEventAt: '2026-10-29T12:00:00.000Z',
  latestEventMs: Date.parse('2026-10-29T12:00:00Z'),
  latestEventECT: '2026-10-29 07:00 ECT',
  latestSignalLabel: 'Volcano-Tectonic (rock fracture)',
  source: 'IGEPN catalogue',
  sourceUrl: 'https://example.invalid/volcanic',
};

function makeSnapshot() {
  return {
    schemaVersion: 1,
    fetchedAt: '2026-10-30T18:00:00Z',
    stale: false,
    summary: { tectonicCount: 1, volcanicCount: 0, volcanoesCatalogued: 15 },
    sources: {},
    errors: {},
    tectonicError: false,
    volcanicError: false,
    catalogError: false,
    volcanoes: [volcano],
    tectonicQuakes: [quake],
    volcanicQuakes: [],
  };
}

function makeViewer() {
  const dataSources = [];
  return {
    dataSources: {
      add(data) {
        dataSources.push(data);
      },
      remove(data) {
        const index = dataSources.indexOf(data);
        if (index >= 0) dataSources.splice(index, 1);
      },
      get values() {
        return dataSources;
      },
    },
    scene: { requestRender() {} },
  };
}

test('description keeps earthquake, signal, catalog provenance separate and escapes HTML', () => {
  const malicious = { ...quake, eventCode: '<script>x</script>' };
  const description = eventDescription(malicious, false);
  assert.match(description, /&lt;script&gt;x&lt;\/script&gt;/);
  assert.match(description, /Tectonic earthquake/);
  assert.match(description, /Observed \(Ecuador time\)/);
  assert.match(description, /MLv/);
  assert.match(description, /not an eruption forecast/);
  assert.match(description, /not an eruption forecast, volcano alert level/);

  const volcanoHtml = volcanoDescription(volcano, false, false);
  assert.match(volcanoHtml, /edifice catalog/i);
  assert.match(volcanoHtml, /not current alert state/);
  assert.match(volcanoHtml, /are separate observations/);
  const unavailable = volcanoDescription(volcano, false, true, true);
  assert.match(
    unavailable,
    /Volcanic seismic events in 30 d<\/th><td>Unavailable/,
  );
  assert.match(unavailable, /Catalog vintage<\/th><td>2021/);
});

test('disabled layer does not acquire; update renders typed entities and reports partial unavailability', async () => {
  let calls = 0;
  const viewer = makeViewer();
  const entries = new Map();
  const layer = createIgepnGeophysicsLayer({
    source: {
      async getSnapshot() {
        calls += 1;
        return {
          ...makeSnapshot(),
          volcanicError: true,
          summary: {
            tectonicCount: 1,
            volcanicCount: 0,
            volcanoesCatalogued: 15,
          },
        };
      },
    },
    overlayHost: {
      setEntries(id, records) {
        entries.set(id, records);
      },
      setVisible() {},
      clearSource(id) {
        entries.delete(id);
      },
    },
  });
  layer.init(viewer);
  assert.equal(await layer.update(), false);
  assert.equal(calls, 0);
  layer.enable();
  assert.equal(await layer.update(), true);
  assert.equal(calls, 1);
  assert.equal(layer.getStats().count, 2);
  assert.equal(layer.getAnalystRecords(1).length, 1);
  assert.match(
    layer.getRowControls().summary.status,
    /volcanic seismicity feed unavailable/i,
  );
  assert.ok(
    layer
      .getAnalystRecords()
      .some((record) => record.recordType === 'tectonic_quake'),
  );
  layer.disable();
  assert.deepEqual(layer.getAnalystRecords(), []);
  assert.equal(entries.has('igepn-geophysics-selection'), false);
  layer.destroy();
  assert.equal(viewer.dataSources.values.length, 0);
});

test('request abort on disable rejects late snapshots and keeps existing records lifecycle-safe', async () => {
  let resolveSnapshot;
  const viewer = makeViewer();
  const layer = createIgepnGeophysicsLayer({
    source: {
      getSnapshot() {
        return new Promise((resolve) => {
          resolveSnapshot = resolve;
        });
      },
    },
  });
  layer.init(viewer);
  layer.enable();
  const pending = layer.update();
  layer.disable();
  resolveSnapshot(makeSnapshot());
  assert.equal(await pending, false);
  assert.equal(layer.getStats().count, 0);
  layer.destroy();
});
