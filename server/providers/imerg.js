/** Public NASA GIBS browse imagery and POWER daily IMERG: different products,
 * never infer an accumulation from a colored rate PNG. */
export const IMERG_PRODUCT = 'precipitation-imerg';
export const IMERG_LAYER = 'IMERG_Precipitation_Rate_30min';
export const IMERG_METADATA = `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/1.0.0/${IMERG_LAYER}/default/2km/all/all.xml`;
export const IMERG_BOUNDS = Object.freeze({
  west: -100,
  south: -16,
  east: -60,
  north: 4,
});
export const IMERG_DELAY_MS = 8 * 3600_000;
const HALF_HOUR = 1800_000;
const DAY = 86400_000;
const invalid = () => {
  throw new Error('invalid_imerg_metadata');
};
function instant(value) {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value ?? '')) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) &&
    new Date(ms).toISOString() === value.replace('Z', '.000Z')
    ? ms
    : null;
}
/** Expand only the tail of provider-advertised exact PT30M domains, respecting
 * gaps. Work remains bounded even for the multi-decade source archive. */
export function parseImergMetadata(xml, nowMs = Date.now()) {
  if (
    typeof xml !== 'string' ||
    xml.length > 65536 ||
    /<!DOCTYPE|<!ENTITY/i.test(xml)
  )
    invalid();
  if (!/<ows:Identifier>time<\/ows:Identifier>/.test(xml)) invalid();
  const domains = [...xml.matchAll(/<Domain>([^<]+)<\/Domain>/g)];
  if (domains.length !== 1) invalid();
  const entries = domains[0][1].trim().split(',');
  if (!entries.length || entries.length > 128) invalid();
  const times = new Set();
  for (const entry of entries) {
    const [start, end, step, extra] = entry.trim().split('/');
    const first = instant(start),
      last = instant(end);
    if (
      first === null ||
      last === null ||
      step !== 'PT30M' ||
      extra !== undefined ||
      first > last ||
      (last - first) % HALF_HOUR ||
      first % HALF_HOUR ||
      last > nowMs + 300000
    )
      invalid();
    for (
      let at = last, n = 0;
      at >= first && n < 26 && nowMs - at <= DAY;
      at -= HALF_HOUR, n++
    )
      times.add(new Date(at).toISOString());
  }
  const allowedTimes = [...times].sort().slice(-26);
  if (!allowedTimes.length) invalid();
  return {
    bounds: { ...IMERG_BOUNDS },
    times: allowedTimes.slice(-13),
    allowedTimes,
  };
}
export function imergPeriod(time) {
  return {
    start: time,
    end: new Date(Date.parse(time) + HALF_HOUR).toISOString(),
    units: 'mm/h',
    statistic: '30-minute mean precipitation rate',
    accumulationMm: null,
  };
}
export function imergMapUrl({ time, bbox, width, height }) {
  const url = new URL(
    'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi',
  );
  url.search = new URLSearchParams({
    service: 'WMS',
    version: '1.1.1',
    request: 'GetMap',
    layers: IMERG_LAYER,
    styles: '',
    srs: 'EPSG:4326',
    bbox: bbox.join(','),
    width: String(width),
    height: String(height),
    format: 'image/png',
    transparent: 'true',
    time: time.replace('.000Z', 'Z'),
  }).toString();
  return url.href;
}
export function imergPoint(lat, lon) {
  if (
    ![lat, lon].every(
      (v) => typeof v === 'string' && /^-?\d{1,3}(?:\.\d{1,6})?$/.test(v),
    )
  )
    throw Object.assign(new Error('invalid_precipitation_point'), {
      status: 400,
      code: 'invalid_precipitation_point',
    });
  const latitude = Math.round(Number(lat) * 10) / 10,
    longitude = Math.round(Number(lon) * 10) / 10;
  if (latitude < -6 || latitude > 2 || longitude < -93 || longitude > -74)
    throw Object.assign(new Error('invalid_precipitation_point'), {
      status: 400,
      code: 'invalid_precipitation_point',
    });
  return { lat: latitude, lon: longitude };
}
export function imergDailyUrl(point, nowMs) {
  const end = new Date(Math.floor(nowMs / DAY) * DAY - DAY)
    .toISOString()
    .slice(0, 10)
    .replaceAll('-', '');
  const start = new Date(Math.floor(nowMs / DAY) * DAY - 90 * DAY)
    .toISOString()
    .slice(0, 10)
    .replaceAll('-', '');
  const url = new URL('https://power.larc.nasa.gov/api/temporal/daily/point');
  url.search = new URLSearchParams({
    parameters: 'IMERG_PRECTOT',
    community: 'AG',
    longitude: String(point.lon),
    latitude: String(point.lat),
    start,
    end,
    format: 'JSON',
    'time-standard': 'UTC',
  }).toString();
  return url.href;
}
export function parseImergDaily(text, point, nowMs) {
  const value = JSON.parse(text);
  if (
    value?.header?.time_standard !== 'UTC' ||
    !value?.header?.sources?.includes('IMERG') ||
    value?.parameters?.IMERG_PRECTOT?.units !== 'mm/day' ||
    value?.geometry?.type !== 'Point' ||
    !Array.isArray(value.geometry.coordinates) ||
    !value.geometry.coordinates.slice(0, 2).every(Number.isFinite) ||
    value.geometry.coordinates.length < 2 ||
    Math.abs(value.geometry.coordinates?.[0] - point.lon) > 0.001 ||
    Math.abs(value.geometry.coordinates?.[1] - point.lat) > 0.001
  )
    invalid();
  const data = value?.properties?.parameter?.IMERG_PRECTOT;
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    Object.keys(data).length > 90 ||
    !Object.keys(data).length
  )
    invalid();
  const days = Object.entries(data)
    .map(([date, amount]) => {
      if (!/^\d{8}$/.test(date)) invalid();
      const start = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}T00:00:00.000Z`;
      const ms = Date.parse(start);
      if (
        !Number.isFinite(ms) ||
        new Date(ms).toISOString() !== start ||
        ms >= Math.floor(nowMs / DAY) * DAY ||
        nowMs - ms > 91 * DAY
      )
        invalid();
      return {
        start,
        end: new Date(ms + DAY).toISOString(),
        accumulationMm:
          typeof amount === 'number' &&
          Number.isFinite(amount) &&
          amount >= 0 &&
          amount !== value.header.fill_value
            ? amount
            : null,
      };
    })
    .sort((a, b) => a.start.localeCompare(b.start));
  return {
    schemaVersion: 1,
    product: IMERG_PRODUCT,
    source: 'NASA POWER · GPM IMERG',
    sourceUrl:
      'https://power.larc.nasa.gov/docs/methodology/data/sources_meteorology/',
    point,
    units: 'mm',
    period: 'UTC calendar day',
    processing: 'POWER IMERG Late/Final archive; per-day run not supplied',
    days,
    fetchedAt: nowMs,
    stale: false,
    latestAvailable:
      days.findLast((d) => d.accumulationMm !== null)?.start ?? null,
    unavailable: days.every((d) => d.accumulationMm === null),
  };
}
