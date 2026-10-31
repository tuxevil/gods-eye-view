import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PAUTE_GEOGRAPHIC_SITES,
  geographicSiteRecords,
  normalizeSiteLocation,
} from './sites.js';
import { buildEcuadorEnergySnapshot } from './model.js';
import { containsPoint, groupContainedPoints } from '../watersheds/geometry.js';
import { createWatershedLayer } from '../watersheds/index.js';
const collection = JSON.parse(
  await readFile(
    new URL('../watersheds/data/paute-units.geojson', import.meta.url),
  ),
);
const catalogSite = (id) => PAUTE_GEOGRAPHIC_SITES.find((s) => s.id === id);

test('CELEC integer metre UTM17S coordinates match independent PROJ conversion and reject ambiguous locations', () => {
  // pyproj Transformer.from_crs(32717,4326,always_xy=True), live primary PDF p.4.
  const expected = [
    [
      'sopladora-access-portal',
      783726,
      9712929,
      -78.44847290631314,
      -2.5946148580682897,
    ],
    [
      'sopladora-discharge',
      785159,
      9711931,
      -78.43557648525248,
      -2.603608594731762,
    ],
  ];
  for (const [id, e, n, lon, lat] of expected) {
    const site = catalogSite(id),
      normalized = normalizeSiteLocation(site);
    assert.deepEqual(site.location.sourceCoordinates, [e, n]);
    assert.equal(normalized.coordinatesVerified, true);
    assert.ok(Math.abs(normalized.lon - lon) < 0.0000005);
    assert.ok(Math.abs(normalized.lat - lat) < 0.0000005);
    assert.match(normalized.locationPrecision, /accuracy unspecified/);
    for (const patch of [
      { crs: undefined },
      { axes: 'latitude,longitude' },
      { sourceCrs: 'EPSG:32617' },
      { sourceCoordinates: [n, e] },
      { lat: -lat },
      { lon: lat, lat: lon },
    ])
      assert.equal(
        normalizeSiteLocation({
          ...site,
          location: { ...site.location, ...patch },
        }).coordinatesVerified,
        false,
      );
    assert.equal(
      normalizeSiteLocation({ ...site, provenance: null }).coordinatesVerified,
      false,
    );
  }
  const mazar = normalizeSiteLocation(catalogSite('mazar-dam'));
  assert.equal(mazar.coordinatesVerified, false);
  assert.equal(mazar.lat, null); // official figure does not state datum
});

test('physical identities/provenance remain distinct; no portal, dam, reservoir or chamber inherits generation', () => {
  const snap = buildEcuadorEnergySnapshot({
    nowMs: Date.parse('2026-10-31T12:00:00Z'),
  });
  assert.equal(snap.plants.length, 8);
  const sites = geographicSiteRecords(snap.plants);
  assert.equal(new Set(sites.map((s) => s.id)).size, 10);
  for (const s of sites) {
    assert.ok(snap.plants.some((p) => p.id === s.plantId));
    assert.match(s.provenance.url, /^https:\/\/www.celec.gob.ec\//);
    assert.ok(s.provenance.section);
    assert.equal('dailyCumulativeMWh' in s, false);
    assert.equal('cotaMsnm' in s, false);
    assert.equal('flowM3s' in s, false);
    if (s.role === 'reservoir') assert.equal(s.coordinatesVerified, false);
  }
  for (const [id, referent] of [
    ['mazar', 'mazar-reservoir'],
    ['paute-molino', 'amaluza-reservoir'],
    ['sopladora', 'sopladora-interconnection'],
  ]) {
    const p = snap.plants.find((p) => p.id === id);
    assert.equal(p.elevationSiteId, referent);
    assert.equal(p.lat, null);
    assert.equal(p.coordinatesVerified, false);
  }
  assert.match(
    snap.plants.find((p) => p.id === 'sopladora').elevationReferent,
    /chamber/,
  );
  const coca = snap.plants.find((p) => p.id === 'coca-codo-sinclair');
  assert.equal(coca.coordinatesVerified, false);
  assert.equal(coca.lat, -0.1986);
});

test('real bundled polygons contain verified sites only; unresolved physical locations remain unknown', async () => {
  const snap = buildEcuadorEnergySnapshot({});
  const sites = geographicSiteRecords(snap.plants);
  for (const s of sites.filter((s) => s.coordinatesVerified)) {
    const ids = collection.features
      .filter((f) => containsPoint(f.geometry, s.lon, s.lat))
      .map((f) => f.properties.id);
    assert.deepEqual(ids, ['6080269960']);
  }
  const feature = collection.features.find(
    (f) => f.properties.id === '6080269960',
  );
  const [group] = groupContainedPoints(feature.geometry, [
    {
      id: 'ecuador-energy',
      state: 'loaded',
      records: [...snap.plants, ...sites],
    },
  ]);
  assert.equal(group.contained.length, 2);
  assert.equal(group.unknown.length, 16);
  const [legacy] = groupContainedPoints(feature.geometry, [
    { id: 'ecuador-energy', records: [{ lon: -78.6, lat: -2.6 }] },
  ]);
  assert.equal(legacy.unknown.length, 1);
  const layer = createWatershedLayer({
    source: {
      async getSnapshot() {
        return collection;
      },
    },
  });
  layer.init({
    dataSources: { add() {}, remove() {} },
    scene: { requestRender() {} },
  });
  assert.equal(layer.getPointMembership(sites.at(-1)).state, 'off');
  layer.enable();
  await layer.update();
  layer.selectBasin(feature.properties.id);
  assert.equal(
    layer.getPointMembership(sites.at(-1)).units[0].id,
    feature.properties.id,
  );
  assert.equal(layer.getPointMembership(sites[0]).units.length, 0);
  assert.equal(layer.getSelection().id, feature.properties.id);
  layer.disable();
  assert.equal(layer.getPointMembership(sites.at(-1)).state, 'off');
  layer.destroy();
});

test('plant metrics keep their physical referents, identifiers, timestamps and MWh semantics', () => {
  const nowMs = Date.parse('2026-10-31T12:00:00Z');
  const rec = (value) => [
    { value, observedMs: nowMs, observedAt: new Date(nowMs).toISOString() },
  ];
  const snapshot = buildEcuadorEnergySnapshot({
    nowMs,
    celecByMrid: new Map([
      [30031, rec(2123)],
      [24019, rec(1974)],
      [90919, rec(1314)],
      [30538, rec(40)],
      [24811, rec(50)],
      [90537, rec(60)],
    ]),
    cenace: {
      sourceDate: '2026-10-31',
      observedAt: new Date(nowMs).toISOString(),
      observedMs: nowMs,
      hydroGenerators: [
        { central: 'Mazar', generationMWh: 10 },
        { central: 'Paute', generationMWh: 20 },
        { central: 'Sopladora', generationMWh: 30 },
      ],
      latestPowerMW: { demandMW: 4000 },
    },
  });
  for (const [id, level, energy] of [
    ['mazar', 2123, 10],
    ['paute-molino', 1974, 20],
    ['sopladora', 1314, 30],
  ]) {
    const plant = snapshot.plants.find((p) => p.id === id);
    assert.equal(plant.cotaMsnm, level);
    assert.equal(plant.dailyCumulativeMWh, energy);
    assert.equal(plant.cotaObservedMs, nowMs);
    assert.equal(plant.cenaceSourceDate, '2026-10-31');
    assert.equal(plant.estimatedIntervalAvgMW, null);
    assert.equal(plant.latestPowerMW, undefined);
  }
  assert.equal(snapshot.nationalSummary.latestPowerMW.demandMW, 4000);
  for (const site of geographicSiteRecords(snapshot.plants))
    assert.equal(site.dailyCumulativeMWh, undefined);
});
