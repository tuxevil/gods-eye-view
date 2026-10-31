import { plantGeography } from './sites.js';

/**
 * Portable Ecuador energy contract: dated hydro plant catalog, CELEC SUR
 * reservoir/flow telemetry, and CENACE daily cumulative energy (MWh) and
 * half-hourly national power series (MW).
 *
 * Observations, cumulative energy (MWh), instantaneous power (MW), and
 * interval average estimates (ΔMWh / Δh) remain strictly distinct.
 */
export const CATALOG_REVIEWED_AT = '2026-10-30';
export const CELEC_STALE_MS = 2 * 3600_000;
export const CENACE_STALE_MS = 2 * 3600_000;
export const FUTURE_SKEW_MS = 5 * 60_000;
export const MAX_INTERVAL_HOURS = 6;

export const SOURCE_URLS = Object.freeze({
  celec: 'https://generacioncsr.celec.gob.ec/',
  cenace: 'https://www.cenace.gob.ec/info-operativa/InformacionOperativa.htm',
});

export const MAZAR_THRESHOLDS = Object.freeze({
  designMinMsnm: 2098,
  sedimentCriticalMsnm: 2115,
  preAlertMsnm: 2120,
  normalMaxMsnm: 2153,
});

/**
 * Official Ecuador hydro plant catalog mapped to CENACE daily bar labels and
 * allowlisted CELEC SUR pointValues MRIDs. Nominal installed MW is design
 * capacity, never guaranteed available power.
 */
export const ECUADOR_HYDRO_PLANTS = Object.freeze([
  Object.freeze({
    id: 'coca-codo-sinclair',
    name: 'Coca Codo Sinclair',
    cenaceName: 'Coca Codo',
    operator: 'CELEC EP Coca Codo Sinclair',
    basin: 'Coca (Napo / Sucumbíos)',
    role: 'Run-of-river with daily compensating reservoir (800,000 m³)',
    installedMW: 1500,
    lat: -0.1986,
    lon: -77.6839,
    celecMrids: null,
    thresholds: null,
  }),
  Object.freeze({
    id: 'mazar',
    name: 'Mazar',
    cenaceName: 'Mazar',
    operator: 'CELEC EP Celec Sur',
    basin: 'Paute Integral (head reservoir, Azuay / Cañar)',
    role: 'Generating plant supplied by the separate Mazar storage reservoir',
    installedMW: 170,
    lat: null,
    lon: null,
    celecMrids: Object.freeze({
      cotaMsnm: 30031,
      inflowM3s: 30538,
      unitsOnline: 30503,
    }),
    thresholds: MAZAR_THRESHOLDS,
  }),
  Object.freeze({
    id: 'paute-molino',
    name: 'Paute-Molino',
    cenaceName: 'Paute',
    operator: 'CELEC EP Celec Sur',
    basin: 'Paute Integral (Amaluza reservoir, Azuay)',
    role: 'Underground generating plant supplied by the separate Amaluza reservoir',
    installedMW: 1100,
    lat: null,
    lon: null,
    celecMrids: Object.freeze({
      cotaMsnm: 24019,
      flowM3s: 24811,
      basinFlowM3s: 24812,
    }),
    thresholds: null,
  }),
  Object.freeze({
    id: 'sopladora',
    name: 'Sopladora',
    cenaceName: 'Sopladora',
    operator: 'CELEC EP Celec Sur',
    basin: 'Paute Integral (lower cascade, Azuay / Morona Santiago)',
    role: 'Lower cascade stage capturing Paute-Molino turbine discharge',
    installedMW: 487,
    lat: null,
    lon: null,
    celecMrids: Object.freeze({
      cotaMsnm: 90919,
      flowM3s: 90537,
      unitsOnline: 90503,
    }),
    thresholds: null,
  }),
  Object.freeze({
    id: 'minas-san-francisco',
    name: 'Minas San Francisco',
    cenaceName: 'Minas San Francisco',
    operator: 'CELEC EP Celec Sur',
    basin: 'Jubones (Azuay / El Oro)',
    role: 'Pacific slope hydroelectric plant with daily regulation',
    installedMW: 270,
    lat: -3.3106,
    lon: -79.4831,
    celecMrids: Object.freeze({
      cotaMsnm: 650919,
      flowM3s: 650538,
      unitsOnline: 650503,
    }),
    thresholds: null,
  }),
  Object.freeze({
    id: 'delsitanisagua',
    name: 'Delsitanisagua',
    cenaceName: 'Delsitanisagua',
    operator: 'CELEC EP Gensur',
    basin: 'Zamora (Zamora Chinchipe)',
    role: 'Amazon slope hydroelectric plant',
    installedMW: 180,
    lat: -3.9804,
    lon: -79.0178,
    celecMrids: null,
    thresholds: null,
  }),
  Object.freeze({
    id: 'agoyan',
    name: 'Agoyán',
    cenaceName: 'Agoyán',
    operator: 'CELEC EP Hidroagoyán',
    basin: 'Pastaza (upper cascade, Tungurahua)',
    role: 'Upper Pastaza cascade plant upstream of San Francisco',
    installedMW: 156,
    lat: -1.3975,
    lon: -78.3822,
    celecMrids: null,
    thresholds: null,
  }),
  Object.freeze({
    id: 'san-francisco',
    name: 'San Francisco',
    cenaceName: 'San Francisco',
    operator: 'CELEC EP Hidroagoyán',
    basin: 'Pastaza (lower cascade, Tungurahua)',
    role: 'Lower Pastaza cascade plant fed by Agoyán discharge',
    installedMW: 212,
    lat: -1.4083,
    lon: -78.2994,
    celecMrids: null,
    thresholds: null,
  }),
]);

export const ALLOWLISTED_CELEC_MRIDS = Object.freeze([
  30031, 30538, 30503, 24019, 24811, 24812, 90919, 90537, 90503, 650919, 650538,
  650503,
]);

const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

const ecuadorDayParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Guayaquil',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function formatEcuadorCelecDate(timestampMs) {
  return `${ecuadorDayParts.format(new Date(timestampMs))} 00:00:00`;
}

export function ecuadorIsoDate(timestampMs) {
  const parts = ecuadorDayParts.formatToParts(new Date(timestampMs));
  const byType = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

export function numberOrNull(value, min = -Infinity, max = Infinity) {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
    ? value
    : null;
}

const B64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeBase64Bytes(bdata) {
  const clean = String(bdata || '').replace(/[\r\n\s]/g, '');
  if (!clean || clean.length % 4 !== 0) return new Uint8Array(0);
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((clean.length * 3) / 4 - pad);
  let outIndex = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64_ALPHABET.indexOf(clean[i]);
    const c1 = B64_ALPHABET.indexOf(clean[i + 1]);
    const c2 = clean[i + 2] === '=' ? 0 : B64_ALPHABET.indexOf(clean[i + 2]);
    const c3 = clean[i + 3] === '=' ? 0 : B64_ALPHABET.indexOf(clean[i + 3]);
    if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) return new Uint8Array(0);
    const triple = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (outIndex < out.length) out[outIndex++] = (triple >> 16) & 0xff;
    if (outIndex < out.length) out[outIndex++] = (triple >> 8) & 0xff;
    if (outIndex < out.length) out[outIndex++] = triple & 0xff;
  }
  return out;
}

export function decodePlotlyY(raw) {
  if (Array.isArray(raw)) {
    return raw.map((v) =>
      typeof v === 'number' && Number.isFinite(v) ? v : null,
    );
  }
  const readers = {
    f8: [8, 'getFloat64'],
    f4: [4, 'getFloat32'],
    i4: [4, 'getInt32'],
    i2: [2, 'getInt16'],
  };
  const spec = readers[raw?.dtype];
  if (!spec || typeof raw?.bdata !== 'string') return [];
  const bytes = decodeBase64Bytes(raw.bdata);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const [stride, getter] = spec;
  const values = [];
  for (let offset = 0; offset + stride <= view.byteLength; offset += stride) {
    const val = view[getter](offset, true);
    values.push(Number.isFinite(val) ? val : null);
  }
  return values;
}

function extractPlotlyArrays(sectionHtml) {
  const plots = [];
  const scriptPattern = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let scriptMatch;
  while ((scriptMatch = scriptPattern.exec(sectionHtml))) {
    const code = scriptMatch[1];
    const startPattern = /Plotly\.newPlot\(\s*["'][^"']+["']\s*,\s*/g;
    let match;
    while ((match = startPattern.exec(code))) {
      let quoted = false;
      let escape = false;
      let depth = 0;
      const from = startPattern.lastIndex;
      for (let i = from; i < code.length; i++) {
        const ch = code[i];
        if (quoted) {
          if (escape) escape = false;
          else if (ch === '\\') escape = true;
          else if (ch === '"') quoted = false;
        } else if (ch === '"') {
          quoted = true;
        } else if (ch === '[' || ch === '{') {
          depth++;
        } else if (ch === ']' || ch === '}') {
          depth--;
          if (depth === 0) {
            try {
              plots.push(JSON.parse(code.slice(from, i + 1)));
            } catch {
              // Ignore malformed plot JSON rather than guessing.
            }
            startPattern.lastIndex = i + 1;
            break;
          }
        }
      }
    }
  }
  return plots;
}

/**
 * Parse CENACE's real-time operational HTML without DOM emulation.
 * Selects only the semantic "PRODUCCIÓN EN TIEMPO REAL" tab-content block.
 */
export function parseCenaceHtml(html, nowMs = Date.now()) {
  if (typeof html !== 'string' || !html) {
    throw new Error('Malformed CENACE response');
  }
  const tabStarts = [
    ...html.matchAll(
      /<div[^>]*class=["'][^"']*\btab-content\b[^"']*["'][^>]*>/gi,
    ),
  ];
  let realtimeSection = null;
  for (let i = 0; i < tabStarts.length; i++) {
    const start = tabStarts[i].index;
    const end = tabStarts[i + 1]?.index ?? html.length;
    const candidate = html.slice(start, end);
    const heading =
      candidate
        .match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1]
        ?.replace(/<[^>]+>/g, '') || '';
    if (/PRODUCCI[ÓO]N EN TIEMPO REAL/i.test(heading)) {
      realtimeSection = candidate;
      break;
    }
  }
  if (!realtimeSection) {
    throw new Error('Unrecognized CENACE real-time section');
  }

  let sourceDate = null;
  const spanPattern = /<span[^>]*>([\s\S]*?)<\/span>/gi;
  let spanMatch;
  while ((spanMatch = spanPattern.exec(realtimeSection))) {
    const text = spanMatch[1].replace(/<[^>]+>/g, '').toLowerCase();
    const dateMatch = text.match(
      /(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/,
    );
    if (dateMatch) {
      const monthIndex = MONTHS_ES.indexOf(dateMatch[2]);
      const day = Number(dateMatch[1]);
      const year = Number(dateMatch[3]);
      if (monthIndex >= 0 && day >= 1 && day <= 31 && year >= 2020) {
        sourceDate = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        break;
      }
    }
  }

  let composition = null;
  let thermalBreakdown = null;
  let hydroGenerators = [];
  let hourly = null;

  for (const data of extractPlotlyArrays(realtimeSection)) {
    if (!Array.isArray(data) || data.length === 0) continue;
    const first = data[0];
    if (
      first?.type === 'pie' &&
      Array.isArray(first.labels) &&
      first.labels.some((l) => /HIDROEL/i.test(String(l)))
    ) {
      composition = {};
      first.labels.forEach((label, idx) => {
        const rawVal = first.values?.[idx];
        composition[String(label).trim().toLowerCase()] = Number.isFinite(
          rawVal,
        )
          ? +rawVal.toFixed(2)
          : null;
      });
      continue;
    }
    if (
      first?.type === 'bar' &&
      data.some((trace) =>
        /Coca Codo|Mazar|Paute/i.test(String(trace?.name || '')),
      )
    ) {
      hydroGenerators = data.map((trace) => {
        const yVal = decodePlotlyY(trace?.y)[0];
        return {
          central: String(trace?.name || '').trim(),
          generationMWh:
            typeof yVal === 'number' && Number.isFinite(yVal) && yVal >= 0
              ? +yVal.toFixed(2)
              : null,
        };
      });
      continue;
    }
    if (
      first?.type === 'bar' &&
      data.some((trace) =>
        /Gas Natural|T[ée]rmica/i.test(String(trace?.name || '')),
      )
    ) {
      thermalBreakdown = {};
      for (const trace of data) {
        const name = String(trace?.name || '')
          .trim()
          .toLowerCase();
        const yVal = decodePlotlyY(trace?.y)[0];
        if (name) {
          thermalBreakdown[name] =
            typeof yVal === 'number' && Number.isFinite(yVal) && yVal >= 0
              ? +yVal.toFixed(2)
              : null;
        }
      }
      continue;
    }
    if (
      !hourly &&
      Array.isArray(first?.x) &&
      first.x.length >= 24 &&
      /^\d\d:\d\d$/.test(String(first.x[0]))
    ) {
      const labels = first.x.map((x) => String(x));
      const series = {};
      for (const trace of data) {
        const name = String(trace?.name || '').trim();
        if (!name) continue;
        const values = decodePlotlyY(trace.y);
        series[name] = labels.map((_, idx) => {
          const v = values[idx];
          return typeof v === 'number' && Number.isFinite(v)
            ? +v.toFixed(2)
            : null;
        });
      }
      hourly = { labels, series };
    }
  }

  if (!composition && !hourly && hydroGenerators.length === 0) {
    throw new Error('Unrecognized CENACE charts');
  }

  const demandSeries = hourly?.series?.['DEMANDA NACIONAL'] || [];
  const totalSeries = hourly?.series?.['PRODUCCIÓN TOTAL'] || [];
  const referenceSeries = demandSeries.length ? demandSeries : totalSeries;
  const lastIndex = referenceSeries.findLastIndex((v) => Number.isFinite(v));
  const latestLabel =
    lastIndex >= 0 && /^\d\d:\d\d$/.test(hourly?.labels?.[lastIndex] || '')
      ? hourly.labels[lastIndex]
      : null;

  let observedAt = null;
  let observedMs = null;
  if (sourceDate && latestLabel) {
    const candidateIso = `${sourceDate}T${latestLabel}:00-05:00`;
    const parsedMs = Date.parse(candidateIso);
    if (Number.isFinite(parsedMs) && parsedMs <= nowMs + FUTURE_SKEW_MS) {
      observedMs = parsedMs;
      observedAt = new Date(parsedMs).toISOString();
    }
  }

  const atLast = (seriesName) => {
    if (lastIndex < 0) return null;
    const v = hourly?.series?.[seriesName]?.[lastIndex];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };

  return {
    sourceDate,
    observedAt,
    observedMs,
    latestTimeSlot: latestLabel,
    stale: observedMs === null || nowMs - observedMs > CENACE_STALE_MS,
    dailyCompositionMWh: composition
      ? {
          hydroMWh:
            composition['hidroeléctrica'] ?? composition.hidroelectrica ?? null,
          thermalMWh: composition['térmica'] ?? composition.termica ?? null,
          naturalGasMWh: thermalBreakdown?.['gas natural'] ?? null,
          renewableMWh: composition.renovable ?? null,
          importMWh:
            composition['importación'] ?? composition.importacion ?? null,
          exportMWh:
            composition['exportación'] ?? composition.exportacion ?? null,
        }
      : null,
    hydroGenerators,
    latestPowerMW:
      lastIndex >= 0
        ? {
            slotECT: latestLabel,
            demandMW: atLast('DEMANDA NACIONAL'),
            totalProductionMW: atLast('PRODUCCIÓN TOTAL'),
            hydroMW: atLast('Hidráulica'),
            thermalMW: atLast('Térmica'),
            renewableMW: atLast('Renovable'),
            importMW: atLast('Importación'),
            exportMW: atLast('Exportación'),
          }
        : null,
    hourly,
    source: SOURCE_URLS.cenace,
  };
}

/**
 * Normalize CELEC pointValues items, rejecting non-finite values and future
 * timestamps beyond 5 minutes, sorted newest first.
 */
export function normalizeCelecItems(items, nowMs = Date.now()) {
  if (!Array.isArray(items)) return [];
  const byTime = new Map();
  for (const item of items) {
    const value = numberOrNull(item?.valueedit, -1000, 100_000);
    const observedMs =
      typeof item?.loctimestamp === 'string'
        ? Date.parse(item.loctimestamp)
        : NaN;
    if (
      value === null ||
      !Number.isFinite(observedMs) ||
      observedMs > nowMs + FUTURE_SKEW_MS
    ) {
      continue;
    }
    byTime.set(observedMs, {
      observedMs,
      observedAt: new Date(observedMs).toISOString(),
      value: +value.toFixed(3),
    });
  }
  return [...byTime.values()].sort((a, b) => b.observedMs - a.observedMs);
}

/**
 * Assess Mazar reservoir elevation against design (2,098 m), sediment
 * precaution (2,115 m), and pre-alert (2,120 m) thresholds, plus 24h rate.
 */
export function assessMazarReserve(
  latestReading,
  history = [],
  nowMs = Date.now(),
) {
  const cota = numberOrNull(latestReading?.value, 1800, 2300);
  const base = {
    reserveStatus: 'unknown',
    marginTo2115M: null,
    marginTo2098M: null,
    changeMPerDay: null,
    trendHours: null,
    daysTo2115Scenario: null,
  };
  if (cota === null) return base;
  const reserveStatus =
    cota <= MAZAR_THRESHOLDS.sedimentCriticalMsnm
      ? 'critical-sediment-zone'
      : cota < MAZAR_THRESHOLDS.preAlertMsnm
        ? 'pre-alert-low'
        : 'above-pre-alert';
  const marginTo2115M = +(cota - MAZAR_THRESHOLDS.sedimentCriticalMsnm).toFixed(
    2,
  );
  const marginTo2098M = +(cota - MAZAR_THRESHOLDS.designMinMsnm).toFixed(2);
  const daysTo2115AtCritical =
    cota <= MAZAR_THRESHOLDS.sedimentCriticalMsnm ? 0 : null;

  const latestMs = latestReading?.observedMs;
  if (
    !Number.isFinite(latestMs) ||
    latestMs > nowMs + FUTURE_SKEW_MS ||
    nowMs - latestMs > CELEC_STALE_MS
  ) {
    return {
      ...base,
      reserveStatus,
      marginTo2115M,
      marginTo2098M,
      daysTo2115Scenario: daysTo2115AtCritical,
    };
  }

  const dayMs = 24 * 3600_000;
  const baseline = history
    .filter(
      (r) =>
        Number.isFinite(r?.value) &&
        Number.isFinite(r?.observedMs) &&
        latestMs - r.observedMs >= 6 * 3600_000 &&
        latestMs - r.observedMs <= dayMs,
    )
    .sort((a, b) => a.observedMs - b.observedMs)[0];

  if (!baseline) {
    return {
      ...base,
      reserveStatus,
      marginTo2115M,
      marginTo2098M,
      daysTo2115Scenario: daysTo2115AtCritical,
    };
  }

  const spanMs = latestMs - baseline.observedMs;
  const rateMPerDay = ((cota - baseline.value) * dayMs) / spanMs;
  const changeMPerDay = +rateMPerDay.toFixed(3);
  const trendHours = +(spanMs / 3600_000).toFixed(1);
  const daysTo2115Scenario =
    cota <= MAZAR_THRESHOLDS.sedimentCriticalMsnm
      ? 0
      : rateMPerDay < -0.05
        ? +(
            (cota - MAZAR_THRESHOLDS.sedimentCriticalMsnm) /
            -rateMPerDay
          ).toFixed(1)
        : null;

  return {
    reserveStatus,
    marginTo2115M,
    marginTo2098M,
    changeMPerDay,
    trendHours,
    daysTo2115Scenario,
  };
}

/**
 * Only comparable monotonic cumulative samples from the same source, plant,
 * and civil day with valid distinct observation clocks may produce
 * (ΔMWh / Δhours) labeled as estimated interval average MW.
 */
export function computeIntervalAverageMW(currentSample, previousSample) {
  if (!currentSample || !previousSample) return null;
  if (
    typeof currentSample.sourceDate !== 'string' ||
    !currentSample.sourceDate ||
    currentSample.sourceDate !== previousSample.sourceDate
  ) {
    return null;
  }
  const currentMWh = numberOrNull(currentSample.dailyCumulativeMWh, 0);
  const previousMWh = numberOrNull(previousSample.dailyCumulativeMWh, 0);
  const currentMs = numberOrNull(currentSample.observedMs, 1);
  const previousMs = numberOrNull(previousSample.observedMs, 1);
  if (
    currentMWh === null ||
    previousMWh === null ||
    currentMs === null ||
    previousMs === null ||
    currentMWh < previousMWh
  ) {
    return null;
  }
  const deltaHours = (currentMs - previousMs) / 3600_000;
  if (deltaHours <= 0 || deltaHours > MAX_INTERVAL_HOURS) return null;
  return {
    estimatedIntervalAvgMW: +((currentMWh - previousMWh) / deltaHours).toFixed(
      1,
    ),
    intervalStartAt: new Date(previousMs).toISOString(),
    intervalEndAt: new Date(currentMs).toISOString(),
    intervalHours: +deltaHours.toFixed(2),
  };
}

export function plantStale(plant, nowMs = Date.now()) {
  if (!plant) return true;
  const times = [
    plant.cotaObservedMs,
    plant.flowObservedMs,
    plant.basinFlowObservedMs,
    plant.unitsObservedMs,
    plant.cenaceObservedMs,
  ].filter((ms) => typeof ms === 'number' && Number.isFinite(ms));
  if (times.length === 0) return true;
  return times.every((ms) => nowMs - ms > CELEC_STALE_MS);
}

export function plantMarkerColor(plant, snapshotStale = false) {
  if (!plant || snapshotStale || plant.stale) return '#94a3b8';
  if (plant.id === 'mazar') {
    if (plant.mazarAssessment?.reserveStatus === 'critical-sediment-zone')
      return '#fb7185';
    if (plant.mazarAssessment?.reserveStatus === 'pre-alert-low')
      return '#fbbf24';
  }
  if (
    plant.cotaMsnm !== null ||
    plant.flowM3s !== null ||
    plant.inflowM3s !== null
  ) {
    return '#2dd4bf';
  }
  if (plant.dailyCumulativeMWh !== null) {
    return '#60a5fa';
  }
  return '#94a3b8';
}

/**
 * Combine the dated plant catalog, CELEC per-MRID histories, and CENACE parsed
 * snapshot into a normalized, provenance-preserving snapshot.
 */
export function buildEcuadorEnergySnapshot({
  cenace = null,
  celecByMrid = new Map(),
  previousCenaceByPlant = new Map(),
  nowMs = Date.now(),
  cenaceError = false,
  celecError = false,
} = {}) {
  const getCelecLatest = (mrid) => {
    if (!mrid) return null;
    const list = celecByMrid.get(mrid) || celecByMrid.get(String(mrid)) || [];
    return list[0] || null;
  };
  const getCelecHistory = (mrid) => {
    if (!mrid) return [];
    return celecByMrid.get(mrid) || celecByMrid.get(String(mrid)) || [];
  };

  const cenaceMap = new Map();
  for (const row of cenace?.hydroGenerators || []) {
    if (row?.central)
      cenaceMap.set(row.central.toLowerCase(), row.generationMWh);
  }

  const plants = ECUADOR_HYDRO_PLANTS.map((spec) => {
    const mrids = spec.celecMrids;
    const cotaRec = getCelecLatest(mrids?.cotaMsnm);
    const inflowRec = getCelecLatest(mrids?.inflowM3s);
    const flowRec = getCelecLatest(mrids?.flowM3s);
    const basinFlowRec = getCelecLatest(mrids?.basinFlowM3s);
    const unitsRec = getCelecLatest(mrids?.unitsOnline);

    const dailyCumulativeMWh =
      cenaceMap.get(spec.cenaceName.toLowerCase()) ?? null;
    const cenaceObservedMs =
      dailyCumulativeMWh !== null ? (cenace?.observedMs ?? null) : null;
    const cenaceObservedAt =
      dailyCumulativeMWh !== null ? (cenace?.observedAt ?? null) : null;

    const prevSample = previousCenaceByPlant.get(spec.id) || null;
    const intervalEstimate = computeIntervalAverageMW(
      {
        sourceDate: cenace?.sourceDate ?? null,
        dailyCumulativeMWh,
        observedMs: cenaceObservedMs,
      },
      prevSample,
    );

    const mazarAssessment =
      spec.id === 'mazar'
        ? assessMazarReserve(cotaRec, getCelecHistory(mrids?.cotaMsnm), nowMs)
        : null;

    const candidateObserved = [
      cotaRec?.observedMs,
      inflowRec?.observedMs,
      flowRec?.observedMs,
      basinFlowRec?.observedMs,
      unitsRec?.observedMs,
      cenaceObservedMs,
    ].filter((v) => typeof v === 'number' && Number.isFinite(v));
    const latestObservedMs = candidateObserved.length
      ? Math.max(...candidateObserved)
      : null;

    const record = {
      id: spec.id,
      name: spec.name,
      cenaceName: spec.cenaceName,
      operator: spec.operator,
      basin: spec.basin,
      role: spec.role,
      installedMW: spec.installedMW,
      lat: spec.lat,
      lon: spec.lon,
      ...plantGeography(spec.id),
      catalogReviewedAt: CATALOG_REVIEWED_AT,
      cotaMsnm: cotaRec?.value ?? null,
      cotaObservedAt: cotaRec?.observedAt ?? null,
      cotaObservedMs: cotaRec?.observedMs ?? null,
      cotaStale:
        cotaRec?.observedMs != null
          ? nowMs - cotaRec.observedMs > CELEC_STALE_MS
          : null,
      inflowM3s: inflowRec?.value ?? null,
      inflowObservedAt: inflowRec?.observedAt ?? null,
      inflowObservedMs: inflowRec?.observedMs ?? null,
      flowM3s: flowRec?.value ?? null,
      flowObservedAt: flowRec?.observedAt ?? null,
      flowObservedMs: flowRec?.observedMs ?? null,
      basinFlowM3s: basinFlowRec?.value ?? null,
      basinFlowObservedAt: basinFlowRec?.observedAt ?? null,
      basinFlowObservedMs: basinFlowRec?.observedMs ?? null,
      unitsOnline: unitsRec?.value != null ? Math.round(unitsRec.value) : null,
      unitsObservedAt: unitsRec?.observedAt ?? null,
      unitsObservedMs: unitsRec?.observedMs ?? null,
      dailyCumulativeMWh,
      cenaceSourceDate: cenace?.sourceDate ?? null,
      cenaceObservedAt,
      cenaceObservedMs,
      estimatedIntervalAvgMW: intervalEstimate?.estimatedIntervalAvgMW ?? null,
      intervalStartAt: intervalEstimate?.intervalStartAt ?? null,
      intervalEndAt: intervalEstimate?.intervalEndAt ?? null,
      intervalHours: intervalEstimate?.intervalHours ?? null,
      thresholds: spec.thresholds,
      mazarAssessment,
      observedMs: latestObservedMs,
      observedAt:
        latestObservedMs !== null
          ? new Date(latestObservedMs).toISOString()
          : null,
      sources: [...(mrids ? [SOURCE_URLS.celec] : []), SOURCE_URLS.cenace],
    };
    record.stale = plantStale(record, nowMs);
    return record;
  });

  const nationalSummary = cenace
    ? {
        sourceDate: cenace.sourceDate,
        observedAt: cenace.observedAt,
        observedMs: cenace.observedMs,
        stale: Boolean(cenace.stale || cenaceError),
        dailyCompositionMWh: cenace.dailyCompositionMWh,
        latestPowerMW: cenace.latestPowerMW,
        source: SOURCE_URLS.cenace,
        scopeNote:
          'CENACE preliminary SCADA: daily cumulative energy (MWh) and half-hourly power (MW). Dispatch/demand balance does not indicate available reserve margin.',
      }
    : null;

  return {
    schemaVersion: 1,
    catalogReviewedAt: CATALOG_REVIEWED_AT,
    fetchedAt: nowMs,
    stale: (cenaceError && celecError) || plants.every((p) => p.stale),
    cenaceError: Boolean(cenaceError),
    celecError: Boolean(celecError),
    nationalSummary,
    plants,
  };
}
