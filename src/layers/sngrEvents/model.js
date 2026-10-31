/**
 * Portable SNGR (Secretaría Nacional de Gestión de Riesgos) adverse-events
 * domain model for Ecuador.
 *
 * Pure module (zero Node builtins, safe in browser and server):
 * - Normalizes ArcGIS FeatureServer records from SNGR `EVENT_ADV_GEOJSON_FL`
 *   (rainy-season / hydro-meteorological events) and `EVENT_ADV_HOST`
 *   (`C_REDM_EVENT_MB_5` national adverse events).
 * - Deduplicates records by `secuencianacional` across feeds.
 * - Keeps reported field events distinct from static susceptibility maps and
 *   real-time emergency warnings, exposing publication lag explicitly.
 */

export const SNGR_BASE_ORIGIN = 'https://sgrportal.gestionderiesgos.gob.ec';

export const SNGR_FEEDS = Object.freeze({
  rainySeason: Object.freeze({
    id: 'EVENT_ADV_GEOJSON_FL',
    servicePath:
      '/server/rest/services/Hosted/EVENT_ADV_GEOJSON_FL/FeatureServer/0',
    sourceUrl:
      'https://sgrportal.gestionderiesgos.gob.ec/server/rest/services/Hosted/EVENT_ADV_GEOJSON_FL/FeatureServer/0',
  }),
  nationalAdverse: Object.freeze({
    id: 'EVENT_ADV_HOST',
    servicePath: '/server/rest/services/Hosted/EVENT_ADV_HOST/FeatureServer/0',
    sourceUrl:
      'https://sgrportal.gestionderiesgos.gob.ec/server/rest/services/Hosted/EVENT_ADV_HOST/FeatureServer/0',
  }),
});

/** Bounds covering continental Ecuador and Galápagos. */
export const ECUADOR_BOUNDS = Object.freeze({
  south: -5.5,
  north: 2.0,
  west: -92.5,
  east: -75.0,
});

const FUTURE_TOLERANCE_MS = 24 * 3600_000;

export function numberOrNull(v, min = -Infinity, max = Infinity) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max
    ? n
    : null;
}

function cleanText(v) {
  if (typeof v !== 'string') return null;
  const trimmed = v
    .replace(/\/n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
  if (!trimmed || trimmed === 'N/A' || trimmed === '-') return null;
  return trimmed;
}

function normalizeTimePart(timeVal) {
  if (typeof timeVal !== 'string') return '00:00:00';
  const match = timeVal.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return '00:00:00';
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  const ss = Number(match[3] || 0);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59 || ss < 0 || ss > 59) {
    return '00:00:00';
  }
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/**
 * Parses SNGR date values (`DD/MM/YYYY`, `YYYY-MM-DD`, or epoch ms) combined
 * with an optional Ecuador local time (`HH:mm` or `HH:mm:ss`, America/Guayaquil -05:00).
 */
export function parseSngrTimestamp(dateVal, timeVal) {
  let y = null;
  let m = null;
  let d = null;

  if (typeof dateVal === 'number' && Number.isFinite(dateVal) && dateVal > 0) {
    const dt = new Date(dateVal);
    if (!Number.isNaN(dt.getTime())) {
      y = dt.getUTCFullYear();
      m = dt.getUTCMonth() + 1;
      d = dt.getUTCDate();
    }
  } else if (typeof dateVal === 'string') {
    const trimmed = dateVal.trim();
    const dmy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) {
      d = Number(dmy[1]);
      m = Number(dmy[2]);
      y = Number(dmy[3]);
    } else {
      const ymd = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (ymd) {
        y = Number(ymd[1]);
        m = Number(ymd[2]);
        d = Number(ymd[3]);
      }
    }
  }

  if (
    !Number.isInteger(y) ||
    !Number.isInteger(m) ||
    !Number.isInteger(d) ||
    y < 2000 ||
    y > 2100 ||
    m < 1 ||
    m > 12 ||
    d < 1 ||
    d > 31
  ) {
    return null;
  }

  const dateECT = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const timeECT = normalizeTimePart(timeVal);
  const isoLocal = `${dateECT}T${timeECT}-05:00`;
  const ms = Date.parse(isoLocal);
  if (!Number.isFinite(ms)) return null;
  return {
    iso: new Date(ms).toISOString(),
    ms,
    dateECT,
    timeECT: timeECT.slice(0, 5),
  };
}

/**
 * Classifies an SNGR event into a normalized hazard category.
 * @param {string|null} evento
 * @param {string|null} [causa]
 * @returns {'flood'|'landslide'|'rain_wind'|'wildfire'|'other'}
 */
export function classifySngrHazard(evento, causa = null) {
  const text = `${evento || ''} ${causa || ''}`.toLowerCase();
  if (/inundaci|aluvión|aluvion|desbordamiento|anegamiento/.test(text)) {
    return 'flood';
  }
  if (
    /deslizamiento|derrumbe|socavamiento|erosi[oó]n|hundimiento|ca[ií]da|movimiento en masa/.test(
      text,
    )
  ) {
    return 'landslide';
  }
  if (/incendio forestal|quema/.test(text)) {
    return 'wildfire';
  }
  if (/lluvia|vendaval|granizada|tormenta|viento/.test(text)) {
    return 'rain_wind';
  }
  return 'other';
}

export function sngrHazardColor(category, stale = false) {
  if (stale) return '#9ca3af';
  switch (category) {
    case 'flood':
      return '#38bdf8';
    case 'landslide':
      return '#f59e0b';
    case 'rain_wind':
      return '#818cf8';
    case 'wildfire':
      return '#ef4444';
    default:
      return '#a855f7';
  }
}

function resolveCoordinates(attributes, geometry) {
  let lat = numberOrNull(
    attributes?.latitud,
    ECUADOR_BOUNDS.south,
    ECUADOR_BOUNDS.north,
  );
  let lon = numberOrNull(
    attributes?.longitud,
    ECUADOR_BOUNDS.west,
    ECUADOR_BOUNDS.east,
  );
  if (lat !== null && lon !== null) return { lat, lon };
  lat = numberOrNull(geometry?.y, ECUADOR_BOUNDS.south, ECUADOR_BOUNDS.north);
  lon = numberOrNull(geometry?.x, ECUADOR_BOUNDS.west, ECUADOR_BOUNDS.east);
  if (lat !== null && lon !== null) return { lat, lon };
  return null;
}

/**
 * Normalizes raw ArcGIS features from a single SNGR FeatureServer layer.
 */
export function normalizeSngrFeatures(
  features,
  {
    feedId = SNGR_FEEDS.rainySeason.id,
    sourceUrl = SNGR_FEEDS.rainySeason.sourceUrl,
    now = Date.now(),
  } = {},
) {
  if (!Array.isArray(features)) return [];
  const out = [];
  for (const feature of features) {
    const attr = feature?.attributes;
    if (!attr || typeof attr !== 'object') continue;
    const coords = resolveCoordinates(attr, feature?.geometry);
    if (!coords) continue;

    const eventTime = parseSngrTimestamp(
      attr.fechadelevento,
      attr.horadelevento,
    );
    if (!eventTime || eventTime.ms > now + FUTURE_TOLERANCE_MS) continue;

    const updatedTime = parseSngrTimestamp(
      attr.fechaultimaactualizacion,
      attr.horaultimaactualizacion,
    );

    const sequenceId = numberOrNull(attr.secuencianacional, 1, 1e9);
    const objectId = numberOrNull(attr.objectid, 1, 1e12);
    const id = sequenceId
      ? `sngr-${sequenceId}`
      : `sngr-${feedId}-${objectId ?? `${coords.lat.toFixed(4)}_${coords.lon.toFixed(4)}`}`;

    const evento = cleanText(attr.evento) || 'Evento adverso';
    const causa = cleanText(attr.causa);
    const categoria = cleanText(attr.categoriadelevento);
    const hazardCategory = classifySngrHazard(evento, causa);

    const provincia = cleanText(attr.provincia) || 'Ecuador';
    const canton = cleanText(attr.canton);
    const parroquia = cleanText(attr.parroquia);
    const sector = cleanText(attr.sector);

    const lagDays = Math.max(
      0,
      Math.round(((now - eventTime.ms) / 86_400_000) * 10) / 10,
    );

    out.push({
      id,
      sequenceId,
      feedId,
      sourceUrl,
      lat: coords.lat,
      lon: coords.lon,
      evento,
      causa,
      categoria,
      hazardCategory,
      nivel: cleanText(attr.niveldelevento),
      estado: cleanText(attr.estadodelevento),
      provincia,
      canton,
      parroquia,
      sector,
      eventAt: eventTime.iso,
      eventMs: eventTime.ms,
      eventDateECT: eventTime.dateECT,
      eventTimeECT: eventTime.timeECT,
      updatedAt: updatedTime?.iso || null,
      updatedMs: updatedTime?.ms || null,
      lagDays,
      impacts: {
        personasAfectadas:
          numberOrNull(attr.personasafectadasdirectamente, 0, 1e7) ?? 0,
        personasDamnificadas:
          numberOrNull(attr.personasdamnificadas, 0, 1e7) ?? 0,
        personasEvacuadas: numberOrNull(attr.personasevacuadas, 0, 1e7) ?? 0,
        personasHeridas: numberOrNull(attr.personasheridas, 0, 1e7) ?? 0,
        personasFallecidas: numberOrNull(attr.personasfallecidas, 0, 1e7) ?? 0,
        familiasAfectadas: numberOrNull(attr.familiasafectadas, 0, 1e7) ?? 0,
        viviendasAfectadas: numberOrNull(attr.viviendasafectadas, 0, 1e7) ?? 0,
        viviendasDestruidas:
          numberOrNull(attr.viviendasdestruidas, 0, 1e7) ?? 0,
        puentesAfectados: numberOrNull(attr.puentesafectados, 0, 1e6) ?? 0,
        viasAfectadasMetros:
          numberOrNull(attr.metroslinealesdeviasafectadas, 0, 1e8) ?? 0,
        haQuemadas: numberOrNull(attr.hadecoberturavegetalquemada, 0, 1e7) ?? 0,
      },
      descripcion:
        cleanText(attr.situacionactual) ||
        cleanText(attr.descripciongeneraldeevento),
      fuenteInformacion: cleanText(attr.fuentesdeinformacion),
      scopeNote:
        'SNGR field incident report (REDM/EVIN); historical/monitored record with publication lag, not a real-time warning or susceptibility map.',
    });
  }
  return out;
}

/**
 * Merges and deduplicates normalized SNGR events across multiple feeds,
 * preferring entries with newer `updatedMs` when `sequenceId` matches.
 */
export function mergeSngrEvents(eventLists, { limit = 150 } = {}) {
  const byKey = new Map();
  for (const list of eventLists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const key = item.sequenceId ? `seq:${item.sequenceId}` : item.id;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, item);
        continue;
      }
      const existingUpd = existing.updatedMs ?? existing.eventMs ?? 0;
      const candidateUpd = item.updatedMs ?? item.eventMs ?? 0;
      if (candidateUpd > existingUpd) {
        byKey.set(key, item);
      }
    }
  }
  return [...byKey.values()]
    .sort((a, b) => {
      if (b.eventMs !== a.eventMs) return b.eventMs - a.eventMs;
      return (b.sequenceId ?? 0) - (a.sequenceId ?? 0);
    })
    .slice(0, limit);
}
