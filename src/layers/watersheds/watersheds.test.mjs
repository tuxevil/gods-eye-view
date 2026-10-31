import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { containsPoint, groupContainedPoints } from './geometry.js';
import { validateWatershedCollection } from './model.js';
import { createWatershedSource } from './source.js';
import { createWatershedLayer } from './index.js';
import {
  encodeLayerStateParams,
  decodeLayerStateParams,
  normalizeLayerState,
} from '../../data/layerState.js';

const square = (a, b, c, d) => [
  [a, b],
  [c, b],
  [c, d],
  [a, d],
  [a, b],
];
const geometry = {
  type: 'Polygon',
  coordinates: [square(0, 0, 10, 10), square(3, 3, 7, 7)],
};
const fixture = () => ({
  type: 'FeatureCollection',
  provenance: {
    product: 'BasinATLAS',
    license: 'CC BY 4.0',
    sourceUrl: 'https://www.hydrosheds.org/hydroatlas',
    dataDate: '2019',
    version: '1.0',
    resolution: '15 arc-second',
    attribution: 'Linke et al. (2019)',
  },
  features: [
    {
      type: 'Feature',
      properties: {
        id: 'unit-1',
        name: 'BasinATLAS unit-1',
        areaKm2: 84,
        level: 8,
        labelLat: 1,
        labelLon: 1,
      },
      geometry,
    },
  ],
});

test('WGS84 containment handles holes, multipart, boundaries, dateline and missing/unverified points', () => {
  assert.equal(containsPoint(geometry, 1, 1), true);
  assert.equal(containsPoint(geometry, 11, 1), false);
  assert.equal(containsPoint(geometry, 5, 5), false);
  assert.equal(containsPoint(geometry, 0, 0), true);
  assert.equal(containsPoint(geometry, 3, 5), true);
  assert.equal(containsPoint(geometry, null, 1), null);
  assert.equal(containsPoint(geometry, 181, 1), null);
  const multi = {
    type: 'MultiPolygon',
    coordinates: [geometry.coordinates, [square(20, 20, 25, 25)]],
  };
  assert.equal(containsPoint(multi, 22, 22), true);
  assert.equal(containsPoint(multi, 15, 15), false);
  const dateline = { type: 'Polygon', coordinates: [square(179, -1, -179, 1)] };
  assert.equal(containsPoint(dateline, 179.5, 0), true);
  assert.equal(containsPoint(dateline, -179.5, 0), true);
  assert.equal(containsPoint(dateline, 0, 0), false);
  const [group] = groupContainedPoints(geometry, [
    {
      id: 'stations',
      state: 'loaded',
      records: [
        { id: 'in', lat: 1, lon: 1 },
        { id: 'out', lat: 11, lon: 1 },
        { id: 'missing' },
        { id: 'unverified', lat: 1, lon: 1, coordinatesVerified: false },
      ],
    },
  ]);
  assert.deepEqual(
    group.contained.map((r) => r.id),
    ['in'],
  );
  assert.deepEqual(
    group.unknown.map((r) => r.id),
    ['missing', 'unverified'],
  );
});

test('source is lazy, cached, capped, validates provenance and retries after failure', async () => {
  let calls = 0;
  const source = createWatershedSource({
    fetchImpl: async (url, options) => {
      calls++;
      assert.match(url, /paute-units.geojson/);
      assert.equal(options.cache, 'force-cache');
      return new Response(JSON.stringify(fixture()));
    },
  });
  assert.equal(calls, 0);
  assert.equal((await source.getSnapshot()).features.length, 1);
  await source.getSnapshot();
  assert.equal(calls, 1);
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(source.getSnapshot({ signal: aborted.signal }), {
    name: 'AbortError',
  });
  const missing = fixture();
  delete missing.provenance;
  assert.throws(() => validateWatershedCollection(missing), /provenance/);
  const many = fixture();
  many.features = Array(65).fill(many.features[0]);
  assert.throws(() => validateWatershedCollection(many), /collection/);
  const openRing = fixture();
  openRing.features[0].geometry = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
    ],
  };
  assert.throws(() => validateWatershedCollection(openRing), /Unclosed/);
  const huge = createWatershedSource({
    fetchImpl: async () =>
      new Response('{}', { headers: { 'content-length': '2000001' } }),
  });
  await assert.rejects(huge.getSnapshot());
  let attempts = 0;
  const retry = createWatershedSource({
    fetchImpl: async () =>
      ++attempts === 1
        ? new Response('', { status: 503 })
        : new Response(JSON.stringify(fixture())),
  });
  await assert.rejects(retry.getSnapshot(), /503/);
  await retry.getSnapshot();
  assert.equal(attempts, 2);
});

function harness(source, getPointGroups = () => []) {
  let datasource,
    click,
    destroyed = 0,
    removed = 0;
  const cards = new Map();
  const viewer = {
    dataSources: {
      add(value) {
        datasource = value;
      },
      remove() {
        removed++;
      },
    },
    scene: {
      pick: () => ({ id: 'watersheds:unit-1:0:fill' }),
      requestRender() {},
    },
  };
  const layer = createWatershedLayer({
    source,
    getPointGroups,
    overlayHost: {
      setEntries(id, entries) {
        cards.set(id, entries);
      },
      setVisible() {},
      clearSource(id) {
        cards.delete(id);
      },
    },
    picking: {
      registerPickOwner() {},
      unregisterPickOwner() {},
      resolvePickId: (pick) => pick?.id,
    },
    handlerFactory: () => ({
      setInputAction(fn) {
        click = fn;
      },
      destroy() {
        destroyed++;
      },
    }),
  });
  layer.init(viewer);
  return {
    layer,
    viewer,
    cards,
    data: () => datasource,
    click: () => click,
    removed: () => removed,
    destroyed: () => destroyed,
  };
}

test('independent selection survives point picks, updates, optional source toggles; disable cleans resources and does no IO', async () => {
  let calls = 0,
    state = 'off';
  const h = harness(
    {
      getSnapshot: async () => {
        calls++;
        return fixture();
      },
    },
    () => [
      {
        id: 'weather-stations',
        state,
        records:
          state === 'loaded'
            ? [{ id: 'station', name: 'Observed station', lon: 1, lat: 1 }]
            : [],
      },
    ],
  );
  assert.equal(await h.layer.update(), false);
  assert.equal(calls, 0);
  h.layer.enable();
  await h.layer.update();
  const count = h.data().entities.values.length;
  assert.equal(count, 3); // shell + hole outlines, one polygon
  h.click()({ position: {} });
  assert.equal(h.layer.getSelection().id, 'unit-1');
  assert.equal(h.layer.getSelection().groups[0].state, 'off');
  const selectedEntity = h.data().entities.getById('watersheds:unit-1:0:fill');
  assert.ok(selectedEntity.polygon.material);
  h.viewer.scene.pick = () => ({ id: 'weather-stations:station' });
  h.click()({ position: {} });
  assert.equal(h.layer.getSelection().id, 'unit-1');
  state = 'loaded';
  await h.layer.update();
  assert.equal(h.layer.getSelection().groups[0].contained.length, 1);
  assert.ok(
    h.cards
      .get('watershed-selection')[0]
      .details.some((line) => line.includes('Observed station')),
  );
  assert.ok(
    h.cards
      .get('watershed-selection')[0]
      .details.join(' ')
      .includes('not reservoir locations'),
  );
  assert.equal(
    h.layer.getAnalystRecords()[0].relationship,
    'geographic-containment-only',
  );
  assert.equal(h.layer.getAnalystRecords()[0].provenance.license, 'CC BY 4.0');
  state = 'off';
  await h.layer.update();
  assert.equal(h.layer.getSelection().id, 'unit-1');
  assert.equal(h.layer.getSelection().groups[0].contained.length, 0);
  assert.equal(calls, 1);
  assert.equal(h.data().entities.values.length, count);
  assert.equal(h.layer.selectBasin('unknown'), false);
  h.layer.disable();
  assert.equal(h.layer.getSelection(), null);
  assert.deepEqual(h.layer.getAnalystRecords(), []);
  assert.equal(h.data().show, false);
  assert.equal(h.destroyed(), 1);
  await h.layer.update();
  assert.equal(calls, 1);
  h.layer.enable();
  await h.layer.update();
  assert.equal(calls, 1);
  assert.equal(h.layer.getSelection(), null);
  h.layer.selectBasin('unit-1');
  h.layer.selectBasin(null);
  assert.equal(h.layer.getSelection(), null);
  h.layer.destroy();
  assert.equal(h.removed(), 1);
});

test('failure remains unavailable, retry recovers and disable discards a late snapshot', async () => {
  let fail = true;
  const h = harness({
    getSnapshot: async () => {
      if (fail) throw new Error('offline');
      return fixture();
    },
  });
  h.layer.enable();
  assert.equal(await h.layer.update(), false);
  assert.match(h.layer.getStats().error, /unavailable/);
  fail = false;
  assert.equal(await h.layer.update(), true);
  assert.equal(h.layer.getStats().error, null);
  h.layer.destroy();
  let resolve;
  const late = harness({
    getSnapshot: () =>
      new Promise((r) => {
        resolve = r;
      }),
  });
  late.layer.enable();
  const work = late.layer.update();
  late.layer.disable();
  resolve(fixture());
  assert.equal(await work, false);
  assert.equal(late.data().entities.values.length, 0);
  late.layer.destroy();
});

test('watershed enabled state round-trips immutable 00 token without enabling observations', () => {
  const params = new URLSearchParams('v=2');
  encodeLayerStateParams(
    params,
    normalizeLayerState({
      enabledLayerIds: ['watersheds', 'weather-satellite'],
    }),
  );
  assert.match(params.get('l'), /00/);
  assert.deepEqual(decodeLayerStateParams(params).enabledLayerIds, [
    'watersheds',
    'weather-satellite',
  ]);
});

test('bundled source geography and provenance are real bounded WGS84 units around Paute', async () => {
  const collection = validateWatershedCollection(
    JSON.parse(
      await readFile(
        new URL('./data/paute-units.geojson', import.meta.url),
        'utf8',
      ),
    ),
  );
  assert.equal(collection.provenance.license, 'CC BY 4.0');
  assert.equal(collection.provenance.product, 'BasinATLAS');
  assert.ok(collection.features.length > 1 && collection.features.length <= 64);
  assert.ok(
    collection.features.some((f) =>
      containsPoint(f.geometry, -78.6231, -2.5969),
    ),
  ); // Mazar catalog point: geometric evidence only
  assert.ok(
    collection.features.some((f) =>
      containsPoint(f.geometry, -78.5572, -2.5767),
    ),
  ); // Paute-Molino catalog point, not reservoir
  assert.ok(
    collection.features.some((f) =>
      containsPoint(f.geometry, -78.4739, -2.6006),
    ),
  ); // Sopladora catalog point
  assert.ok(
    collection.features.every(
      (f) => !containsPoint(f.geometry, -78.354, -0.124),
    ),
  ); // Quito airport excluded
  for (const f of collection.features) {
    assert.equal(f.properties.level, 8);
    assert.match(f.properties.name, /BasinATLAS/);
    assert.ok(
      containsPoint(f.geometry, f.properties.labelLon, f.properties.labelLat),
    );
  }
});

test('renderer preserves multipart shells and holes, with independent bounded entities', async () => {
  const collection = fixture();
  collection.features[0].geometry = {
    type: 'MultiPolygon',
    coordinates: [geometry.coordinates, [square(20, 20, 25, 25)]],
  };
  const h = harness({ getSnapshot: async () => collection });
  h.layer.enable();
  await h.layer.update();
  assert.equal(h.data().entities.values.length, 5);
  const shell = h.data().entities.getById('watersheds:unit-1:0:fill');
  assert.equal(shell.polygon.hierarchy.getValue().holes.length, 1);
  assert.equal(
    h
      .data()
      .entities.getById('watersheds:unit-1:1:fill')
      .polygon.hierarchy.getValue().holes.length,
    0,
  );
  h.layer.selectBasin('unit-1');
  assert.ok(
    h.cards
      .get('watershed-selection')[0]
      .details.every((line) => line.length <= 64),
  );
  h.layer.destroy();
});

test('catalog context remains separate from unknown geographic membership', async () => {
  const h = harness({ getSnapshot: async () => fixture() }, () => [
    {
      id: 'ecuador-energy',
      state: 'loaded',
      records: [
        {
          id: 'plant',
          name: 'Mazar',
          lat: 1,
          lon: 1,
          coordinatesVerified: false,
          documentedContext: 'Paute Integral (catalog relationship)',
        },
      ],
    },
  ]);
  h.layer.enable();
  await h.layer.update();
  h.layer.selectBasin('unit-1');
  assert.equal(h.layer.getSelection().groups[0].contained.length, 0);
  assert.equal(h.layer.getSelection().groups[0].unknown.length, 1);
  const text = h.cards.get('watershed-selection')[0].details.join(' ');
  assert.match(text, /Catalog relationships; coordinates unverified/);
  assert.match(text, /Paute Integral/);
  h.layer.destroy();
});
