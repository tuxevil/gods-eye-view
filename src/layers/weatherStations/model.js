/** Portable station contract: SI units, explicit UTC observation, nullable sensors. */
export const STALE_MS = 90 * 60_000;
export const numberOrNull = (v, min = -Infinity, max = Infinity) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
    ? v
    : null;
export const stationStale = (r, now = Date.now()) =>
  now - r.observedMs > STALE_MS;
export function temperatureColor(value) {
  return value === null
    ? '#94a3b8'
    : value < 10
      ? '#60a5fa'
      : value < 20
        ? '#2dd4bf'
        : value < 30
          ? '#fbbf24'
          : '#fb7185';
}
export function normalizeMetars(rows, now = Date.now()) {
  if (!Array.isArray(rows) || rows.length > 400)
    throw new Error('Malformed METAR response');
  const stations = new Map();
  for (const r of rows) {
    const lat = numberOrNull(r.lat, -90, 90),
      lon = numberOrNull(r.lon, -180, 180);
    const observedMs =
      numberOrNull(r.obsTime, 1) === null ? null : r.obsTime * 1000;
    if (
      !/^[A-Z0-9]{4}$/.test(r.icaoId) ||
      lat === null ||
      lon === null ||
      observedMs === null ||
      observedMs > now + 300_000 ||
      now - observedMs > 24 * 3600_000
    )
      continue;
    const tempC = numberOrNull(r.temp, -100, 65),
      dew = numberOrNull(r.dewp, -100, 65);
    const humidity =
      tempC !== null && dew !== null && dew <= tempC
        ? Math.round(
            100 *
              Math.exp(
                (17.625 * dew) / (243.04 + dew) -
                  (17.625 * tempC) / (243.04 + tempC),
              ),
          )
        : null;
    const speed = numberOrNull(r.wspd, 0, 300),
      gust = numberOrNull(r.wgst, 0, 300);
    const reading = {
      id: `awc:${r.icaoId}`,
      stationId: r.icaoId,
      provider: 'AWC METAR',
      source: 'https://aviationweather.gov/data/api/',
      name: typeof r.name === 'string' ? r.name.slice(0, 120) : r.icaoId,
      lat,
      lon,
      observedMs,
      observedAt: new Date(observedMs).toISOString(),
      tempC,
      humidity,
      humidityMethod:
        humidity === null ? null : 'derived from temperature/dew point',
      windMs: speed === null ? null : speed * 0.514444,
      gustMs: gust === null ? null : gust * 0.514444,
      windDeg: numberOrNull(r.wdir, 0, 360),
      pressureHpa: numberOrNull(r.altim, 800, 1100),
      pressureType: 'altimeter setting',
      solarWm2: null,
      rainRateMmHr: null,
      rainDailyMm: null,
      cloud: typeof r.cover === 'string' ? r.cover.slice(0, 32) : null,
      condition:
        typeof r.wxString === 'string' ? r.wxString.slice(0, 120) : null,
    };
    if (
      !stations.has(reading.id) ||
      stations.get(reading.id).observedMs < observedMs
    )
      stations.set(reading.id, reading);
  }
  return [...stations.values()].sort((a, b) => a.id.localeCompare(b.id));
}
