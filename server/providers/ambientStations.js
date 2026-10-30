import { readResponseJsonCapped } from './common/http.js';
import { numberOrNull as num } from '../../src/layers/weatherStations/model.js';
/** Account-authorized devices only. Never return MAC, account metadata or keys. */
export async function fetchAmbientStations({
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = Date.now,
} = {}) {
  if (!env.AMBIENT_API_KEY || !env.AMBIENT_APPLICATION_KEY) return [];
  // Operator supplies public aliases/coordinates; never publish private account locations.
  let catalog;
  try {
    catalog = JSON.parse(env.AMBIENT_PUBLIC_STATIONS || '[]');
  } catch {
    throw new Error('Invalid Ambient station configuration');
  }
  if (!Array.isArray(catalog) || catalog.length > 20)
    throw new Error('Invalid Ambient station configuration');
  if (!catalog.length) return [];
  const url = new URL('https://rt.ambientweather.net/v1/devices');
  url.searchParams.set('apiKey', env.AMBIENT_API_KEY);
  url.searchParams.set('applicationKey', env.AMBIENT_APPLICATION_KEY);
  const signal = AbortSignal.timeout(12_000);
  // Do not log errors from fetch: they may include the credential-bearing URL.
  let devices;
  try {
    const response = await fetchImpl(url, { signal, redirect: 'error' });
    if (!response.ok) throw new Error();
    devices = await readResponseJsonCapped(response, 1024 * 1024, signal);
  } catch {
    throw new Error('Ambient provider unavailable');
  }
  if (!Array.isArray(devices) || devices.length > 100)
    throw new Error('Malformed Ambient response');
  return catalog.flatMap((c) => {
    if (
      !/^[a-z0-9-]{1,40}$/.test(c.id) ||
      num(c.lat, -90, 90) === null ||
      num(c.lon, -180, 180) === null
    )
      return [];
    const d = devices.find((d) => d.macAddress === c.device)?.lastData;
    if (
      !d ||
      num(d.dateutc, 1) === null ||
      d.dateutc > now() + 300_000 ||
      now() - d.dateutc > 86400_000
    )
      return [];
    const convert = (v, f, min = 0, max = Infinity) =>
      num(v, min, max) === null ? null : f(v);
    return [
      {
        id: `ambient:${c.id}`,
        stationId: c.id,
        name: c.id,
        provider: 'Ambient Weather · authorized station',
        source: 'https://ambientweather.com',
        lat: c.lat,
        lon: c.lon,
        observedMs: d.dateutc,
        observedAt: new Date(d.dateutc).toISOString(),
        tempC: convert(d.tempf, (v) => ((v - 32) * 5) / 9, -148, 149),
        humidity: num(d.humidity, 0, 100),
        humidityMethod: 'sensor',
        windMs: convert(d.windspeedmph, (v) => v * 0.44704),
        gustMs: convert(d.windgustmph, (v) => v * 0.44704),
        windDeg: num(d.winddir, 0, 360),
        pressureHpa: convert(d.baromrelin, (v) => v * 33.863886),
        pressureType: 'relative pressure',
        solarWm2: num(d.solarradiation, 0),
        rainRateMmHr: null,
        rainLastHourMm: convert(d.hourlyrainin, (v) => v * 25.4),
        rainDailyMm: convert(d.dailyrainin, (v) => v * 25.4),
        cloud: null,
        condition: null,
      },
    ];
  });
}
