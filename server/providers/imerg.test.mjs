import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  IMERG_METADATA,
  IMERG_BOUNDS,
  parseImergMetadata,
  imergMapUrl,
  imergPeriod,
  imergPoint,
  imergDailyUrl,
  parseImergDaily,
} from './imerg.js';
import { weatherProxy } from './weather.js';
const NOW = Date.parse('2026-10-31T03:00:00Z');
const TIME = '2026-10-30T21:30:00.000Z';
const domain = (range = '2026-10-30T00:00:00Z/2026-10-30T21:30:00Z/PT30M') =>
  `<Domains><DimensionDomain><ows:Identifier>time</ows:Identifier><Domain>${range}</Domain></DimensionDomain></Domains>`;
const point = { lat: -2, lon: -79 };
function daily(values = { 20261029: 12.34, 20261030: -999 }) {
  return JSON.stringify({
    header: { time_standard: 'UTC', sources: ['IMERG'], fill_value: -999 },
    geometry: { type: 'Point', coordinates: [-79, -2, 2000] },
    properties: { parameter: { IMERG_PRECTOT: values } },
    parameters: { IMERG_PRECTOT: { units: 'mm/day' } },
  });
}
function png(w, h) {
  const b = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(b);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12);
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}
function install(options) {
  let handler;
  weatherProxy({ now: () => NOW, ...options }).configureServer({
    middlewares: {
      use(path, h) {
        assert.equal(path, '/api/weather');
        handler = h;
      },
    },
  });
  return async (url) => {
    const res = new EventEmitter();
    res.writeHead = (status, headers) => {
      res.status = status;
      res.headers = headers;
    };
    res.end = (body) => {
      res.body = body;
    };
    await handler({ url, method: 'GET' }, res);
    return res;
  };
}
const json = (res) => JSON.parse(res.body);
test('NASA advertised half-hour domains bound history and preserve gaps without iterating decades', () => {
  const a = parseImergMetadata(
    domain(
      '1998-01-01T00:00:00Z/2026-10-30T19:30:00Z/PT30M,2026-10-30T20:30:00Z/2026-10-30T21:30:00Z/PT30M',
    ),
    NOW,
  );
  assert.equal(a.times.length, 13);
  assert.equal(a.times.at(-1), TIME);
  assert.equal(a.allowedTimes.length, 26);
  assert.ok(!a.times.includes('2026-10-30T20:00:00.000Z'));
  assert.deepEqual(a.bounds, IMERG_BOUNDS);
  for (const [lat, lon] of [
    [-2, -79],
    [-0.7, -90.5],
  ])
    assert.ok(
      lon >= a.bounds.west &&
        lon <= a.bounds.east &&
        lat >= a.bounds.south &&
        lat <= a.bounds.north,
    );
});
test('invalid calendar, future, wrong cadence, unaligned, entity and expired domains fail closed', () => {
  for (const range of [
    '2026-02-30T00:00:00Z/2026-10-30T21:30:00Z/PT30M',
    '2026-10-30T21:30:00Z/2026-11-01T00:00:00Z/PT30M',
    '2026-10-30T20:00:00Z/2026-10-30T21:30:00Z/PT1H',
    '2026-10-30T21:01:00Z/2026-10-30T21:31:00Z/PT30M',
    '2026-10-29T00:00:00Z/2026-10-29T01:00:00Z/PT30M',
  ])
    assert.throws(() => parseImergMetadata(domain(range), NOW));
  assert.throws(() => parseImergMetadata('<!DOCTYPE x>' + domain(), NOW));
  assert.throws(() =>
    parseImergMetadata(domain().replace('time', 'other'), NOW),
  );
});
test('rate period is mm/h with explicit half-hour bounds, never invented mm accumulation', () => {
  assert.deepEqual(imergPeriod(TIME), {
    start: TIME,
    end: '2026-10-30T22:00:00.000Z',
    units: 'mm/h',
    statistic: '30-minute mean precipitation rate',
    accumulationMm: null,
  });
  const u = new URL(
    imergMapUrl({
      time: TIME,
      bbox: [-100, -16, -60, 4],
      width: 1024,
      height: 512,
    }),
  );
  assert.equal(u.origin, 'https://gibs.earthdata.nasa.gov');
  assert.equal(u.searchParams.get('version'), '1.1.1');
  assert.equal(u.searchParams.get('srs'), 'EPSG:4326');
  assert.equal(u.searchParams.get('bbox'), '-100,-16,-60,4');
  assert.equal(u.searchParams.get('time'), '2026-10-30T21:30:00Z');
  assert.equal(u.searchParams.get('layers'), 'IMERG_Precipitation_Rate_30min');
});
test('daily request pins IMERG parameter and UTC calendar days; no credentials or caller destinations', () => {
  assert.deepEqual(imergPoint('-2.04', '-79.04'), point);
  for (const args of [
    [null, '-79'],
    ['0', '0'],
    ['-7', '-79'],
    ['-2', 'https://evil.test'],
  ])
    assert.throws(() => imergPoint(...args));
  const u = new URL(imergDailyUrl(point, NOW));
  assert.equal(u.origin, 'https://power.larc.nasa.gov');
  assert.equal(u.searchParams.get('parameters'), 'IMERG_PRECTOT');
  assert.equal(u.searchParams.get('time-standard'), 'UTC');
  assert.equal(u.searchParams.get('start'), '20260802');
  assert.equal(u.searchParams.get('end'), '20261030');
});
test('daily totals preserve actual zero, convert fill/null/malformed to unknown, preserve exact dates', () => {
  const a = parseImergDaily(
    daily({ 20261027: 0, 20261028: null, 20261029: 12.34, 20261030: -999 }),
    point,
    NOW,
  );
  assert.equal(a.units, 'mm');
  assert.deepEqual(
    a.days.map((d) => d.accumulationMm),
    [0, null, 12.34, null],
  );
  assert.equal(a.days[2].start, '2026-10-29T00:00:00.000Z');
  assert.equal(a.days[2].end, '2026-10-30T00:00:00.000Z');
  assert.equal(a.latestAvailable, a.days[2].start);
  assert.equal(a.stale, false);
  assert.equal(
    parseImergDaily(daily({ 20261030: -999 }), point, NOW).unavailable,
    true,
  );
  for (const mutate of [
    (x) => (x.header.time_standard = 'LST'),
    (x) => (x.header.sources = ['MERRA2']),
    (x) => (x.parameters.IMERG_PRECTOT.units = 'mm/h'),
    (x) => (x.geometry.coordinates = [0, 0]),
    (x) => delete x.geometry.coordinates,
  ]) {
    const x = JSON.parse(daily());
    mutate(x);
    assert.throws(() => parseImergDaily(JSON.stringify(x), point, NOW));
  }
  for (const values of [{ 20260230: 1 }, { 20261031: 1 }, { 20260101: 1 }])
    assert.throws(() => parseImergDaily(daily(values), point, NOW));
});
test('deterministic middleware contract: exact-time map, unknown time rejection, credits, transparent semantics and delayed metadata', async () => {
  const calls = [];
  const request = install({
    fetchImpl: async (url, opts) => {
      calls.push(url);
      assert.equal(opts.redirect, 'error');
      if (url === IMERG_METADATA) return new Response(domain());
      const u = new URL(url);
      return new Response(
        png(
          Number(u.searchParams.get('width')),
          Number(u.searchParams.get('height')),
        ),
        { headers: { 'Content-Type': 'image/png' } },
      );
    },
  });
  const m = json(await request('/manifest?product=precipitation-imerg'));
  assert.equal(m.unavailable, false);
  assert.equal(m.units, 'mm/h');
  assert.equal(m.measurement, 'satellite_estimate');
  assert.match(m.description, /missing.*never establish dry/);
  assert.match(m.attribution, /NASA/);
  assert.equal(m.periods.at(-1).start, TIME);
  assert.equal(m.accumulationMm, null);
  const image = await request(
    `/image?product=precipitation-imerg&time=${TIME}&size=1024x512`,
  );
  assert.equal(image.status, 200);
  assert.equal(
    new URL(calls.at(-1)).searchParams.get('bbox'),
    '-100,-16,-60,4',
  );
  const count = calls.length;
  assert.equal(
    (
      await request(
        `/image?product=precipitation-imerg&time=2026-10-30T21:31:00.000Z`,
      )
    ).status,
    400,
  );
  assert.equal(calls.length, count);
  assert.equal(
    (
      await request(
        `/image?product=precipitation-imerg&time=${TIME}&bbox=-101,-16,-61,4`,
      )
    ).status,
    400,
  );
});
test('daily bounded cache/coalescing and explicit stale fallback preserve fetch/source dates and nulls', async () => {
  let clock = NOW,
    fail = false,
    calls = 0;
  const request = install({
    now: () => clock,
    fetchImpl: async () => {
      calls++;
      if (fail) throw new Error('offline');
      return new Response(daily());
    },
  });
  const [a, b] = await Promise.all([
    request('/accumulation?lat=-2&lon=-79'),
    request('/accumulation?lat=-2.01&lon=-79.01'),
  ]);
  assert.deepEqual(json(a), json(b));
  assert.equal(calls, 1);
  assert.equal(json(a).days.at(-1).accumulationMm, null);
  clock += 3600_001;
  fail = true;
  const old = json(await request('/accumulation?lat=-2&lon=-79'));
  assert.equal(old.stale, true);
  assert.equal(old.fetchedAt, NOW);
  assert.deepEqual(old.days, json(a).days);
  clock += 86400000;
  assert.equal((await request('/accumulation?lat=-2&lon=-79')).status, 503);
  assert.equal((await request('/accumulation?lat=0&lon=0')).status, 400);
  assert.equal(
    (await request('/accumulation?lat=-2&lon=-79&url=https://evil.test'))
      .status,
    400,
  );
});
test('metadata failure retains stale exact frame timestamps, uncached map fails, no-data daily remains unavailable', async () => {
  let clock = NOW,
    fail = false;
  const request = install({
    now: () => clock,
    fetchImpl: async (url) => {
      if (fail) throw new Error('offline');
      return new Response(
        url === IMERG_METADATA ? domain() : daily({ 20261030: -999 }),
      );
    },
  });
  assert.equal(
    json(await request('/manifest?product=precipitation-imerg')).latest,
    TIME,
  );
  assert.equal(
    json(await request('/accumulation?lat=-2&lon=-79')).unavailable,
    true,
  );
  clock += 120001;
  fail = true;
  const m = json(await request('/manifest?product=precipitation-imerg'));
  assert.equal(m.stale, true);
  assert.equal(m.latest, TIME);
  assert.equal(m.fetchedAt, NOW);
  assert.equal(
    (await request(`/image?product=precipitation-imerg&time=${TIME}`)).status,
    503,
  );
  clock += 3600000;
  assert.equal(
    json(await request('/manifest?product=precipitation-imerg')).unavailable,
    true,
  );
});
