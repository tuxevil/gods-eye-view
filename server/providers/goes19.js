// UW–Madison SSEC's documented RealEarth WMS reprojects NOAA GOES-19 data.
// Pin both the product and origins; never follow metadata-provided URLs.
export const GOES19_PRODUCT = 'G19-ABI-FD-BAND13';
export const GOES19_METADATA = `https://realearth.ssec.wisc.edu/api/products?products=${GOES19_PRODUCT}&timespan=-3h`;
export const GOES19_BOUNDS = Object.freeze({
  west: -100,
  south: -16,
  east: -60,
  north: 4,
});
export const GOES19_DELAY_MS = 40 * 60_000;
const HISTORY_MS = 3 * 3600_000;

function invalid() {
  return new Error('invalid_goes19_metadata');
}

/** Only explicit catalog scan times; never generate a cadence or use latest. */
export function parseGoes19Metadata(text, nowMs) {
  const rows = JSON.parse(text);
  if (!Array.isArray(rows) || rows.length !== 1) throw invalid();
  const row = rows[0];
  if (
    row.id !== GOES19_PRODUCT ||
    row.type !== 'raster' ||
    row.projection?.toLowerCase() !== 'epsg:4326' ||
    !Array.isArray(row.times) ||
    !row.times.length ||
    row.times.length > 512
  )
    throw invalid();
  const times = row.times.map((value) => {
    const m =
      typeof value === 'string' &&
      value.match(/^(\d{4})(\d\d)(\d\d)\.(\d\d)(\d\d)(\d\d)$/);
    if (!m) throw invalid();
    const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z`;
    const ms = Date.parse(iso);
    if (
      !Number.isFinite(ms) ||
      new Date(ms).toISOString() !== iso ||
      ms > nowMs + 5 * 60_000
    )
      throw invalid();
    return iso;
  });
  const recent = [...new Set(times)]
    .filter((t) => nowMs - Date.parse(t) <= HISTORY_MS)
    .sort()
    .slice(-26);
  if (!recent.length) throw invalid();
  return {
    bounds: { ...GOES19_BOUNDS },
    times: recent.slice(-13),
    allowedTimes: recent,
  };
}

export function goes19MapUrl({ time, bbox, width, height }) {
  const stamp = time
    .replace(/[-:]/g, '')
    .replace('T', '_')
    .replace('.000Z', '');
  const url = new URL('https://realearth.ssec.wisc.edu/cgi-bin/mapserv');
  url.search = new URLSearchParams({
    map: `${GOES19_PRODUCT}.map`,
    service: 'WMS',
    version: '1.1.1',
    request: 'GetMap',
    layers: `${GOES19_PRODUCT}_${stamp}`,
    styles: '',
    srs: 'EPSG:4326',
    bbox: bbox.join(','),
    width: String(width),
    height: String(height),
    format: 'image/png',
    transparent: 'true',
  }).toString();
  return url.href;
}
