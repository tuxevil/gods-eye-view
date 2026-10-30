import test from 'node:test';
import assert from 'node:assert/strict';
import { createStationService } from './weatherStations.js';
import { fetchAmbientStations } from './ambientStations.js';
const now = Date.parse('2026-10-30T16:30:00Z');
const row = { icaoId: 'SEQM', lat: 0, lon: -78, obsTime: now / 1000 - 1800 };
test('fixed bounded upstream, single flight, cache, stale cutoff and failure', async () => {
  let clock = now,
    calls = 0,
    fail = false;
  const get = createStationService({
    now: () => clock,
    env: {},
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(new URL(url).origin, 'https://aviationweather.gov');
      assert.equal(options.redirect, 'error');
      if (fail) throw Error('offline');
      return Response.json([row]);
    },
  });
  const [a, b] = await Promise.all([get(), get()]);
  assert.deepEqual(a, b);
  assert.equal(calls, 1);
  await get();
  assert.equal(calls, 1);
  clock += 300001;
  fail = true;
  assert.equal((await get()).stale, true);
  assert.equal(calls, 2);
  await get();
  assert.equal(calls, 2);
  clock += 6 * 3600000;
  await assert.rejects(get(), /unavailable/);
  await assert.rejects(get('https://evil'), /Invalid/);
  await assert.rejects(get('0,181'), /Invalid/);
});
test('204 empty is valid; malformed provider body is failure', async () => {
  assert.deepEqual(
    (
      await createStationService({
        fetchImpl: async () => new Response(null, { status: 204 }),
        env: {},
      })()
    ).readings,
    [],
  );
  await assert.rejects(
    createStationService({
      fetchImpl: async () => Response.json({}),
      env: {},
    })(),
    /unavailable/,
  );
});
test('Ambient is opt-in, account-only, strips identifiers and preserves nullable sensors', async () => {
  assert.deepEqual(
    await fetchAmbientStations({ env: {}, fetchImpl: () => assert.fail() }),
    [],
  );
  const env = {
    AMBIENT_API_KEY: 'test-secret',
    AMBIENT_APPLICATION_KEY: 'test-app',
    AMBIENT_PUBLIC_STATIONS: JSON.stringify([
      { id: 'test-station', device: 'private-device', lat: -2, lon: -79 },
    ]),
  };
  const result = await fetchAmbientStations({
    env,
    now: () => now,
    fetchImpl: async (url) => {
      assert.equal(url.origin, 'https://rt.ambientweather.net');
      return Response.json([
        {
          macAddress: 'private-device',
          info: { name: 'private name' },
          lastData: {
            dateutc: now,
            tempf: 68,
            windspeedmph: 0,
            humidity: null,
            hourlyrainin: 1,
          },
        },
      ]);
    },
  });
  assert.equal(result[0].tempC, 20);
  assert.equal(result[0].windMs, 0);
  assert.equal(result[0].humidity, null);
  assert.equal(result[0].rainLastHourMm, 25.4);
  assert.equal(result[0].rainRateMmHr, null);
  assert.doesNotMatch(JSON.stringify(result), /private|test-secret|test-app/);
});
