import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMetars, stationStale } from './model.js';
import { createWeatherStationsLayer, stationDescription } from './index.js';
const now = Date.parse('2026-10-30T16:30:00Z');
const row = {
  icaoId: 'SEQM',
  lat: -0.124,
  lon: -78.354,
  obsTime: now / 1000 - 1800,
  temp: 20,
  dewp: 10,
  wspd: 10,
  wdir: 'VRB',
  altim: 1013,
};
test('METAR normalization uses exact UTC, SI, nullable independent fields and newest station identity', () => {
  const [r] = normalizeMetars(
    [row, { ...row, obsTime: row.obsTime - 3600, temp: 0 }],
    now,
  );
  assert.equal(r.tempC, 20);
  assert.equal(r.windMs, 5.14444);
  assert.equal(r.windDeg, null);
  assert.equal(r.pressureHpa, 1013);
  assert.equal(r.humidity, 53);
  assert.equal(r.observedAt, '2026-10-30T16:00:00.000Z');
  assert.equal(r.rainRateMmHr, null);
  assert.equal(r.solarWm2, null);
  const [missing] = normalizeMetars(
    [{ ...row, temp: null, wspd: 0, altim: null }],
    now,
  );
  assert.equal(missing.tempC, null);
  assert.equal(missing.humidity, null);
  assert.equal(missing.windMs, 0);
  assert.equal(missing.pressureHpa, null);
  assert.equal(stationStale(r, now), false);
  assert.equal(stationStale(r, now + 7200000), true);
  assert.equal(
    normalizeMetars(
      [
        { ...row, obsTime: now / 1000 + 301 },
        { ...row, lat: null },
      ],
      now,
    ).length,
    0,
  );
  assert.throws(() => normalizeMetars({}), /Malformed/);
});
function viewer() {
  return { dataSources: { add() {}, remove() {} }, camera: {} };
}
test('disabled layers do no work; repeat refresh replaces entities, disable aborts late results', async () => {
  let calls = 0,
    resolve;
  const reading = normalizeMetars([row], now)[0];
  const layer = createWeatherStationsLayer({
    source: {
      async getSnapshot() {
        calls++;
        return { readings: [reading], fetchedAt: now, stale: false };
      },
    },
  });
  layer.init(viewer());
  assert.equal(layer.getLoadedPointSnapshot().state, 'off');
  assert.deepEqual(layer.getLoadedPointSnapshot().records, []);
  assert.equal(await layer.update(), false);
  assert.equal(calls, 0);
  layer.enable();
  await layer.update();
  await layer.update();
  assert.equal(layer.getStats().count, 1);
  assert.equal(layer.getLoadedPointSnapshot().state, 'loaded');
  assert.equal(layer.getLoadedPointSnapshot().records.length, 1);
  assert.equal(layer.getAnalystRecords().length, 1);
  layer.disable();
  assert.equal(layer.getLoadedPointSnapshot().state, 'off');
  assert.deepEqual(layer.getLoadedPointSnapshot().records, []);
  assert.deepEqual(layer.getAnalystRecords(), []);
  await layer.update();
  assert.equal(calls, 2);
  layer.destroy();
  const late = createWeatherStationsLayer({
    source: {
      getSnapshot() {
        return new Promise((r) => (resolve = r));
      },
    },
  });
  late.init(viewer());
  late.enable();
  const work = late.update();
  late.disable();
  late.enable();
  resolve({ readings: [reading], fetchedAt: now });
  assert.equal(await work, false);
  assert.equal(late.getStats().count, 0);
  late.destroy();
});
test('provider failure retains readings and marks stale, pick cards escape provider strings', async () => {
  let fail = false;
  const r = normalizeMetars([row], now)[0];
  const layer = createWeatherStationsLayer({
    source: {
      async getSnapshot() {
        if (fail) throw Error('offline');
        return { readings: [r], fetchedAt: now, stale: false };
      },
    },
  });
  layer.init(viewer());
  layer.enable();
  await layer.update();
  fail = true;
  await layer.update();
  assert.equal(layer.getStats().stale, true);
  assert.equal(layer.getStats().count, 1);
  assert.match(
    stationDescription({ ...r, name: '<script>' }, true),
    /&lt;script&gt;/,
  );
  layer.destroy();
});

test('selected overlay cards work with disabled Cesium infoBox and lifecycle removes handlers and entities', async () => {
  const r = normalizeMetars([row], now)[0];
  let datasource,
    click,
    destroyed = 0;
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
        return { id: { id: `weather-stations:${r.id}` } };
      },
    },
  };
  const layer = createWeatherStationsLayer({
    source: {
      async getSnapshot() {
        return { readings: [r], fetchedAt: now };
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
          click = fn;
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
  click({ position: { x: 1, y: 2 } });
  assert.equal(entries.get('weather-station-selection').length, 1);
  assert.ok(
    entries
      .get('weather-station-selection')[0]
      .details.includes(`${r.provider} · ${r.observedAt}`),
  );
  layer.disable();
  assert.equal(destroyed, 1);
  assert.equal(owners.size, 0);
  assert.equal(entries.has('weather-station-selection'), false);
  layer.enable();
  await layer.update();
  assert.equal(datasource.entities.values.length, 1);
  layer.destroy();
  assert.equal(destroyed, 2);
});
