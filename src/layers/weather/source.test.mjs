import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWeatherSource,
  validateWeatherSnapshot,
  weatherImageUrl,
  weatherTileUrl,
  WEATHER_DETAIL_SIZE,
  WEATHER_IMAGE_SIZES,
} from './source.js';
const time = '2026-09-16T02:00:00.000Z';
const snapshot = () => ({
  schemaVersion: 1,
  product: 'radar',
  bounds: { west: -130, south: 20, east: -60, north: 55 },
  times: [time],
  latest: time,
  tileSize: 256,
  maxLevel: 6,
  tilingScheme: 'geographic',
});
test('observed source accepts bounded exact times and refuses malformed or unsorted frames', () => {
  assert.equal(validateWeatherSnapshot(snapshot(), 'radar').latest, time);
  for (const bad of [
    { times: [time, time] },
    { product: 'other' },
    { times: Array(14).fill(time) },
    { latest: 'tomorrow' },
    { maxLevel: 20 },
    { bounds: { west: -999, south: 0, east: 1, north: 1 } },
  ])
    assert.throws(
      () => validateWeatherSnapshot({ ...snapshot(), ...bad }, 'radar'),
      /Malformed/,
    );
});
test('weather tile URLs are same origin and ignore upstream templates', async () => {
  const calls = [];
  const source = createWeatherSource({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return Response.json({
        ...snapshot(),
        tileTemplate: 'https://example.invalid/{z}',
      });
    },
  });
  const result = await source.getSnapshot({ product: 'radar' });
  assert.match(
    weatherTileUrl(result.product, result.latest),
    /^\/api\/weather\/tile\?product=radar&time=2026/,
  );
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].url, '/api/weather/manifest?product=radar');
});
test('source aborts before acquisition and caps streamed manifest bytes', async () => {
  let calls = 0;
  const source = createWeatherSource({
    fetchImpl: async () => {
      calls++;
      return new Response(' '.repeat(17000));
    },
  });
  await assert.rejects(source.getSnapshot({ signal: AbortSignal.abort() }), {
    name: 'AbortError',
  });
  assert.equal(calls, 0);
  await assert.rejects(source.getSnapshot(), /too large/);
});

test('weather tile URLs carry only supported optional pixel sizes', () => {
  assert.equal(
    new URL(
      weatherTileUrl('radar', time),
      'https://example.test',
    ).searchParams.has('size'),
    false,
  );
  for (const size of [256, 512, 1024]) {
    const url = new URL(
      weatherTileUrl('lightning', time, { size }),
      'https://example.test',
    );
    assert.equal(url.searchParams.get('size'), String(size));
    assert.equal(url.searchParams.get('time'), time);
  }
  for (const size of [0, 257, 2048, '1024', null])
    assert.throws(() => weatherTileUrl('radar', time, { size }), /tile size/);
});

test('whole-extent image URLs are same origin and omit the default largest size', () => {
  for (const [product, width] of [
    ['radar', 4096],
    ['clouds-regional', 4096],
    ['clouds', 2048],
    ['lightning', 4096],
  ]) {
    assert.deepEqual(WEATHER_IMAGE_SIZES[product], {
      width,
      height: width / 2,
    });
    assert.equal(
      weatherImageUrl(product, time),
      `/api/weather/image?product=${product}&time=${encodeURIComponent(time)}`,
    );
    assert.equal(
      weatherImageUrl(product, time, { width, height: width / 2 }),
      weatherImageUrl(product, time),
    );
    assert.equal(
      new URL(
        weatherImageUrl(product, time, { width: 1024, height: 512 }),
        'https://example.test',
      ).searchParams.get('size'),
      '1024x512',
    );
  }
  for (const size of [
    { width: 8192, height: 4096 },
    { width: 2048, height: 2048 },
    { width: 512, height: 256 },
    { width: '1024', height: 512 },
  ])
    assert.throws(() => weatherImageUrl('lightning', time, size), /size/);
  assert.throws(
    () => weatherImageUrl('clouds', time, { width: 4096, height: 2048 }),
    /size/,
  );
  assert.throws(() => weatherImageUrl('other', time), /frame/);
  assert.throws(() => weatherImageUrl('radar', 'latest'), /frame/);
});

test('detail-window image URLs carry the bbox and omit the default detail size', () => {
  const box = { west: -102, south: 34, east: -96, north: 37 };
  assert.deepEqual(WEATHER_DETAIL_SIZE, { width: 4096, height: 2048 });
  for (const product of ['radar', 'clouds-regional', 'lightning', 'clouds']) {
    const url = `/api/weather/image?product=${product}&time=${encodeURIComponent(time)}&bbox=-102,34,-96,37`;
    assert.equal(weatherImageUrl(product, time, {}, box), url);
    assert.equal(
      weatherImageUrl(product, time, { width: 4096, height: 2048 }, box),
      url,
      'every product has a 4096×2048 detail default',
    );
    assert.equal(
      weatherImageUrl(product, time, { width: 2048, height: 1024 }, box),
      `${url}&size=2048x1024`,
    );
  }
  assert.equal(
    weatherImageUrl('radar', time, {}, { ...box, west: -97.5, east: -91.5 }),
    `/api/weather/image?product=radar&time=${encodeURIComponent(time)}&bbox=-97.5,34,-91.5,37`,
  );
  for (const bad of [
    { ...box, west: -96 },
    { ...box, north: 34 },
    { ...box, east: Number.NaN },
    { west: -102, south: 34, east: -96 },
  ])
    assert.throws(() => weatherImageUrl('radar', time, {}, bad), /window/);
  assert.throws(
    () => weatherImageUrl('radar', time, { width: 8192, height: 4096 }, box),
    /size/,
  );
});

test('image frames are read through the bounded image route', async () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
  const requested = [];
  const source = createWeatherSource({
    fetchImpl: async (url, init) => {
      requested.push({ url, redirect: init.redirect });
      return new Response(png, { headers: { 'Content-Type': 'image/PNG' } });
    },
  });
  const frame = await source.getImage({
    product: 'radar',
    time,
    size: { width: 1024, height: 512 },
    bbox: { west: -100, south: 30, east: -96, north: 32 },
  });
  assert.equal(frame.contentType, 'image/png');
  assert.deepEqual([...frame.bytes], [...png]);
  assert.deepEqual(requested, [
    {
      url: weatherImageUrl(
        'radar',
        time,
        { width: 1024, height: 512 },
        { west: -100, south: 30, east: -96, north: 32 },
      ),
      redirect: 'error',
    },
  ]);
  const failing = createWeatherSource({
    fetchImpl: async () => new Response(null, { status: 409 }),
  });
  await assert.rejects(
    failing.getImage({ product: 'radar', time }),
    /Weather image HTTP 409/,
  );
});

test('GOES-19 uses the existing bounded source and local exact-time image/tile routes', async () => {
  const product = 'clouds-goes19';
  const source = createWeatherSource({
    fetchImpl: async (url) => {
      assert.equal(url, '/api/weather/manifest?product=clouds-goes19');
      return Response.json({
        ...snapshot(),
        product,
        source: 'NOAA GOES-19 via SSEC',
        bounds: { west: -100, south: -16, east: -60, north: 4 },
      });
    },
  });
  const value = await source.getSnapshot({ product });
  assert.equal(value.latest, time);
  assert.equal(
    weatherImageUrl(product, time),
    `/api/weather/image?product=${product}&time=${encodeURIComponent(time)}`,
  );
  assert.match(weatherTileUrl(product, time), /product=clouds-goes19/);
  assert.deepEqual(WEATHER_IMAGE_SIZES[product], { width: 2048, height: 1024 });
  assert.throws(
    () => weatherImageUrl(product, time, { width: 4096, height: 2048 }),
    /size/,
  );
});

test('IMERG source preserves rate periods and refuses accumulation/rate semantic confusion', async () => {
  const product = 'precipitation-imerg';
  const value = {
    ...snapshot(),
    product,
    measurement: 'satellite_estimate',
    units: 'mm/h',
    periods: [
      {
        start: time,
        end: '2026-09-16T02:30:00.000Z',
        units: 'mm/h',
        accumulationMm: null,
      },
    ],
  };
  assert.equal(validateWeatherSnapshot(value, product), value);
  for (const bad of [
    { units: 'mm' },
    { measurement: 'radar' },
    { periods: [{ ...value.periods[0], accumulationMm: 1 }] },
    { periods: [{ ...value.periods[0], end: '2026-09-16T03:00:00.000Z' }] },
  ])
    assert.throws(
      () => validateWeatherSnapshot({ ...value, ...bad }, product),
      /Malformed/,
    );
  assert.match(weatherImageUrl(product, time), /product=precipitation-imerg/);
  assert.match(weatherTileUrl(product, time), /product=precipitation-imerg/);
  const a = {
    schemaVersion: 1,
    product,
    point: { lat: -2, lon: -79 },
    units: 'mm',
    days: [
      {
        start: '2026-09-15T00:00:00.000Z',
        end: '2026-09-16T00:00:00.000Z',
        accumulationMm: null,
      },
    ],
  };
  let payload = a;
  const source = createWeatherSource({
    fetchImpl: async (url, options) => {
      assert.equal(url, '/api/weather/accumulation?lat=-2.0&lon=-79.0');
      assert.equal(options.redirect, 'error');
      return Response.json(payload);
    },
  });
  assert.equal(
    (await source.getAccumulation({ lat: -2, lon: -79 })).days[0]
      .accumulationMm,
    null,
  );
  payload = { ...a, units: 'mm/h' };
  await assert.rejects(
    source.getAccumulation({ lat: -2, lon: -79 }),
    /Malformed/,
  );
  payload = { ...a, point: { lat: NaN, lon: -79 } };
  await assert.rejects(
    source.getAccumulation({ lat: -2, lon: -79 }),
    /Malformed/,
  );
  payload = { ...a, days: [{ ...a.days[0], accumulationMm: -999 }] };
  await assert.rejects(
    source.getAccumulation({ lat: -2, lon: -79 }),
    /Malformed/,
  );
  await assert.rejects(
    source.getAccumulation({ lat: 0, lon: 0 }),
    /outside coverage/,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    source.getAccumulation({ lat: -2, lon: -79, signal: controller.signal }),
    /abort/i,
  );
});
