/**
 * Portable IGEPN (Instituto Geofísico de la Escuela Politécnica Nacional)
 * seismic and volcanic monitoring domain model for Ecuador.
 *
 * Pure module (zero Node builtins, safe in browser and server):
 * - Normalizes tectonic earthquakes from `Sismicidad_tectónica_365_días_MIL1/MapServer/0`
 * - Normalizes volcanic seismic events (`VT`, `LP`, `EXP`, `TREMI`) from
 *   `Sismicidad_volcanica_MIL1/MapServer/0`
 * - Enriches the 15 volcano edifices in the IGEPN catalog with seismic activity
 *   counts, signal breakdown, and latest observed event timestamps while
 *   keeping tectonic earthquakes, volcanic seismic signals, and edifice catalog
 *   metadata explicitly distinct.
 */

export const IGEPN_BASE_ORIGIN = 'https://srvsigaweb.igepn.edu.ec';

export const IGEPN_FEEDS = Object.freeze({
  tectonic: Object.freeze({
    id: 'Sismicidad_tectonica_365',
    servicePath:
      '/server/rest/services/Sismicidad_tect%C3%B3nica_365_d%C3%ADas_MIL1/MapServer/0',
    sourceUrl:
      'https://srvsigaweb.igepn.edu.ec/server/rest/services/Sismicidad_tect%C3%B3nica_365_d%C3%ADas_MIL1/MapServer/0',
  }),
  volcanic: Object.freeze({
    id: 'Sismicidad_volcanica',
    servicePath: '/server/rest/services/Sismicidad_volcanica_MIL1/MapServer/0',
    sourceUrl:
      'https://srvsigaweb.igepn.edu.ec/server/rest/services/Sismicidad_volcanica_MIL1/MapServer/0',
  }),
});

export const ECUADOR_SEISMIC_BOUNDS = Object.freeze({
  south: -6.5,
  north: 3.0,
  west: -93.0,
  east: -74.5,
});

const FUTURE_TOLERANCE_MS = 24 * 3600_000;
const DAY_MS = 86_400_000;

export const VOLCANIC_SIGNAL_LABELS = Object.freeze({
  VT: 'Volcano-Tectonic (rock fracture)',
  LP: 'Long-Period (fluid movement)',
  EXP: 'Volcanic explosion',
  TREMI: 'Internal tremor / emission',
  ND: 'Unclassified volcanic signal',
});

export const ECUADOR_VOLCANO_CATALOG = Object.freeze(
  [
    ['SAN', 'Sangay', ['sangay'], 'Morona Santiago'],
    [
      'REV',
      'El Reventador',
      ['el reventador', 'reventador'],
      'Napo / Sucumbíos',
    ],
    ['COT', 'Cotopaxi', ['cotopaxi'], 'Cotopaxi / Pichincha'],
    ['TUN', 'Tungurahua', ['tungurahua'], 'Tungurahua'],
    ['PCH', 'Pichincha', ['guagua pichincha', 'pichincha'], 'Pichincha'],
    ['CAY', 'Cayambe', ['cayambe'], 'Pichincha'],
    ['SUM', 'Sumaco', ['sumaco'], 'Napo / Orellana'],
    [
      'CCN',
      'Chiles - Cerro Negro de Mayasquer',
      ['chiles', 'cerro negro', 'chiles - cerro negro de mayasquer'],
      'Carchi / Nariño',
    ],
    [
      'CTC',
      'Cotacachi - Cuicocha',
      ['cotacachi', 'cuicocha', 'cotacachi - cuicocha'],
      'Imbabura',
    ],
    ['ANT', 'Antisana', ['antisana'], 'Napo'],
    ['CHB', 'Chimborazo', ['chimborazo'], 'Chimborazo'],
    ['QLT', 'Quilotoa', ['quilotoa'], 'Cotopaxi'],
    ['IMB', 'Imbabura', ['imbabura'], 'Imbabura'],
    [
      'ATA',
      'Atacazo - Ninahuilca',
      ['atacazo', 'ninahuilca', 'atacazo - ninahuilca'],
      'Pichincha',
    ],
    ['PUL', 'Pululahua', ['pululahua'], 'Pichincha'],
  ].map(([code, name, aliases, province]) =>
    Object.freeze({
      id: `volcano-${code.toLowerCase()}`,
      code,
      name,
      aliases: Object.freeze(aliases),
      province,
      catalogVintage: 2021,
      lat: null,
      lon: null,
      elevationM: null,
      eruptiveClass: null,
      source:
        'IGEPN volcanic edifice/hazard catalog (2021); not a live activity report',
    }),
  ),
);

/** Polygon centroid for an ArcGIS simple-ring polygon in WGS84 coordinates. */
export function polygonCentroid(geometry) {
  const ring = geometry?.rings?.[0];
  if (!Array.isArray(ring) || ring.length < 3) return null;
  let twiceArea = 0;
  let xTotal = 0;
  let yTotal = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const ax = numberOrNull(a?.[0], -180, 180);
    const ay = numberOrNull(a?.[1], -90, 90);
    const bx = numberOrNull(b?.[0], -180, 180);
    const by = numberOrNull(b?.[1], -90, 90);
    if ([ax, ay, bx, by].some((value) => value === null)) continue;
    const cross = ax * by - bx * ay;
    twiceArea += cross;
    xTotal += (ax + bx) * cross;
    yTotal += (ay + by) * cross;
  }
  if (!Number.isFinite(twiceArea) || Math.abs(twiceArea) < 1e-12) return null;
  const lon = xTotal / (3 * twiceArea);
  const lat = yTotal / (3 * twiceArea);
  if (
    numberOrNull(
      lat,
      ECUADOR_SEISMIC_BOUNDS.south,
      ECUADOR_SEISMIC_BOUNDS.north,
    ) === null ||
    numberOrNull(
      lon,
      ECUADOR_SEISMIC_BOUNDS.west,
      ECUADOR_SEISMIC_BOUNDS.east,
    ) === null
  ) {
    return null;
  }
  return { lat, lon };
}

export function numberOrNull(v, min = -Infinity, max = Infinity) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max
    ? n
    : null;
}

const ectFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Guayaquil',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  hourCycle: 'h23',
});

export function formatEctTimestamp(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return null;
  const parts = Object.fromEntries(
    ectFormatter.formatToParts(new Date(ms)).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} ECT`;
}

function resolveCoords(latField, lonField, geometry) {
  let lat = numberOrNull(
    latField,
    ECUADOR_SEISMIC_BOUNDS.south,
    ECUADOR_SEISMIC_BOUNDS.north,
  );
  let lon = numberOrNull(
    lonField,
    ECUADOR_SEISMIC_BOUNDS.west,
    ECUADOR_SEISMIC_BOUNDS.east,
  );
  if (lat !== null && lon !== null) return { lat, lon };
  lat = numberOrNull(
    geometry?.y,
    ECUADOR_SEISMIC_BOUNDS.south,
    ECUADOR_SEISMIC_BOUNDS.north,
  );
  lon = numberOrNull(
    geometry?.x,
    ECUADOR_SEISMIC_BOUNDS.west,
    ECUADOR_SEISMIC_BOUNDS.east,
  );
  if (lat !== null && lon !== null) return { lat, lon };
  return null;
}

/**
 * Normalizes tectonic earthquake records from IGEPN `Sismicidad_tectónica_365_días_MIL1`.
 */
export function normalizeIgepnTectonicQuakes(
  features,
  { now = Date.now() } = {},
) {
  if (!Array.isArray(features)) return [];
  const out = [];
  for (const f of features) {
    const a = f?.attributes;
    if (!a || typeof a !== 'object') continue;
    const coords = resolveCoords(a.sis3_latitud, a.sis3_longitud, f?.geometry);
    if (!coords) continue;
    const observedMs = numberOrNull(
      a.sis3_tiempo,
      946684800000,
      now + FUTURE_TOLERANCE_MS,
    );
    if (observedMs === null) continue;
    const magnitude = numberOrNull(a.sis3_magnitud_M, -2, 10);
    if (magnitude === null) continue;
    const depthKm = numberOrNull(a.sis3_profundidad, -10, 800);
    const eventCode =
      typeof a.sis3_evento === 'string' && a.sis3_evento.trim()
        ? a.sis3_evento.trim()
        : `sis3-${a.sis3_id ?? observedMs}`;
    const updatedMs = numberOrNull(
      a.sis3_ultima_modificacion,
      946684800000,
      now + FUTURE_TOLERANCE_MS,
    );

    out.push({
      recordType: 'tectonic_quake',
      id: `tectonic-${eventCode}`,
      eventCode,
      lat: coords.lat,
      lon: coords.lon,
      magnitude: Math.round(magnitude * 100) / 100,
      magnitudeType:
        typeof a.sis3_tipo_magnitud_P === 'string' &&
        a.sis3_tipo_magnitud_P.trim()
          ? a.sis3_tipo_magnitud_P.trim()
          : 'M',
      depthKm: depthKm !== null ? Math.round(depthKm * 100) / 100 : null,
      stationsUsed: numberOrNull(a.sis3_estacionesUsadas, 0, 1000),
      phasesUsed: numberOrNull(a.sis3_fasesUsadas, 0, 5000),
      azimuthalGapDeg: numberOrNull(a.sis3_azimuthalGap, 0, 360),
      observedAt: new Date(observedMs).toISOString(),
      observedMs,
      observedECT: formatEctTimestamp(observedMs),
      reportedTimeMs: numberOrNull(a.sis3_tiempoMS, 0, 86_400_000),
      updatedAt: updatedMs !== null ? new Date(updatedMs).toISOString() : null,
      sourceUrl: IGEPN_FEEDS.tectonic.sourceUrl,
    });
  }
  return out.sort((x, y) => y.observedMs - x.observedMs);
}

/**
 * Normalizes volcanic seismic events from IGEPN `Sismicidad_volcanica_MIL1`.
 */
export function normalizeIgepnVolcanicQuakes(
  features,
  { now = Date.now() } = {},
) {
  if (!Array.isArray(features)) return [];
  const out = [];
  for (const f of features) {
    const a = f?.attributes;
    if (!a || typeof a !== 'object') continue;
    const coords = resolveCoords(a.svo3_latitud, a.svo3_longitud, f?.geometry);
    if (!coords) continue;
    const observedMs = numberOrNull(
      a.svo3_tiempo,
      946684800000,
      now + FUTURE_TOLERANCE_MS,
    );
    if (observedMs === null) continue;
    const magnitude = numberOrNull(a.svo3_magnitud_M, -2, 10);
    const primaryDepthKm = numberOrNull(a.svo3_profundidad, 0, 800);
    const depthSign = numberOrNull(a.svo3_zprofundidad, -800, 800);
    const depthKm =
      primaryDepthKm ?? (depthSign === null ? null : Math.abs(depthSign));
    const eventCode =
      typeof a.svo3_evento === 'string' && a.svo3_evento.trim()
        ? a.svo3_evento.trim()
        : `svo3-${a.svo3_id ?? observedMs}`;
    const volcanoName =
      typeof a.svo3_nombre_volcan === 'string' && a.svo3_nombre_volcan.trim()
        ? a.svo3_nombre_volcan.trim()
        : 'Ecuador Volcano';
    const rawSignal =
      typeof a.svo3_TipoEventoVolcanico === 'string' &&
      a.svo3_TipoEventoVolcanico.trim()
        ? a.svo3_TipoEventoVolcanico.trim().toUpperCase()
        : 'ND';

    out.push({
      id: `volcanic-${eventCode}`,
      recordType: 'volcanic_quake',
      eventCode,
      volcanoName,
      signalType: rawSignal,
      signalLabel:
        VOLCANIC_SIGNAL_LABELS[rawSignal] || VOLCANIC_SIGNAL_LABELS.ND,
      lat: coords.lat,
      lon: coords.lon,
      magnitude: magnitude !== null ? Math.round(magnitude * 100) / 100 : null,
      magnitudeType:
        typeof a.svo3_tipo_magnitud_P === 'string' &&
        a.svo3_tipo_magnitud_P.trim()
          ? a.svo3_tipo_magnitud_P.trim()
          : 'MLv',
      depthKm: depthKm !== null ? Math.round(depthKm * 100) / 100 : null,
      stationsUsed: numberOrNull(a.svo3_estacionesUsadas, 0, 1000),
      phasesUsed: numberOrNull(a.svo3_fasesUsadas, 0, 5000),
      observedAt: new Date(observedMs).toISOString(),
      observedMs,
      observedECT: formatEctTimestamp(observedMs),
      sourceUrl: IGEPN_FEEDS.volcanic.sourceUrl,
    });
  }
  return out.sort((x, y) => y.observedMs - x.observedMs);
}

/**
 * Enriches the 15 volcano edifices in the IGEPN catalog with volcanic seismic
 * telemetry from `volcanicQuakes`.
 */
export function buildVolcanoSummaries(
  volcanicQuakes = [],
  { now = Date.now() } = {},
) {
  return ECUADOR_VOLCANO_CATALOG.map((edifice) => {
    const matching = volcanicQuakes.filter((q) => {
      const norm = String(q.volcanoName || '')
        .trim()
        .toLowerCase();
      return edifice.aliases.includes(norm);
    });
    const recent = matching.filter(
      (q) => q.observedMs <= now && now - q.observedMs <= 90 * DAY_MS,
    );
    const events7d = recent.filter(
      (q) => now - q.observedMs <= 7 * DAY_MS,
    ).length;
    const events30d = recent.filter(
      (q) => now - q.observedMs <= 30 * DAY_MS,
    ).length;
    const bySignal = { VT: 0, LP: 0, EXP: 0, TREMI: 0, ND: 0 };
    let maxMag = null;
    for (const q of recent) {
      const k = Object.hasOwn(bySignal, q.signalType) ? q.signalType : 'ND';
      bySignal[k] += 1;
      if (q.magnitude !== null && (maxMag === null || q.magnitude > maxMag)) {
        maxMag = q.magnitude;
      }
    }
    const latest = recent[0] || null;
    return {
      ...edifice,
      recordType: 'volcano',
      events90d: recent.length,
      events7d,
      events30d,
      signals: bySignal,
      maxMagnitude: maxMag,
      latestEventAt: latest?.observedAt || null,
      latestEventMs: latest?.observedMs || null,
      latestEventECT: latest?.observedECT || null,
      latestSignalType: latest?.signalType || null,
      latestSignalLabel: latest?.signalLabel || null,
      latestSignalMagnitude: latest?.magnitude ?? null,
      sourceUrl: IGEPN_FEEDS.volcanic.sourceUrl,
    };
  });
}

export function igepnRecordColor(record, stale = false) {
  if (stale) return '#9ca3af';
  if (record?.recordType === 'volcano') {
    if ((record.events30d ?? 0) > 0) {
      return '#f97316';
    }
    return '#eab308';
  }
  if (record?.recordType === 'volcanic_quake') {
    return '#c084fc';
  }
  const mag = record?.magnitude ?? 0;
  if (mag >= 4.0) return '#f43f5e';
  return '#38bdf8';
}
