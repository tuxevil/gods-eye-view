import https from 'node:https';
import tls from 'node:tls';
import { readResponseJsonCapped } from './common/http.js';
import {
  ALLOWLISTED_CELEC_MRIDS,
  ECUADOR_HYDRO_PLANTS,
  SOURCE_URLS,
  buildEcuadorEnergySnapshot,
  formatEcuadorCelecDate,
  normalizeCelecItems,
  parseCenaceHtml,
} from '../../src/layers/ecuadorEnergy/model.js';

/**
 * Official intermediate CA (Sectigo Public Server Authentication CA DV R36,
 * issued by Sectigo Public Server Authentication Root R46) omitted by
 * www.cenace.gob.ec's TLS handshake. Supplying this intermediate alongside
 * Node's root store keeps rejectUnauthorized: true verified end-to-end.
 */
export const SECTIGO_DV_R36_INTERMEDIATE_PEM = [
  '-----BEGIN CERTIFICATE-----',
  'MIIGTDCCBDSgAwIBAgIQOXpmzCdWNi4NqofKbqvjsTANBgkqhkiG9w0BAQwFADBf',
  'MQswCQYDVQQGEwJHQjEYMBYGA1UEChMPU2VjdGlnbyBMaW1pdGVkMTYwNAYDVQQD',
  'Ey1TZWN0aWdvIFB1YmxpYyBTZXJ2ZXIgQXV0aGVudGljYXRpb24gUm9vdCBSNDYw',
  'HhcNMjEwMzIyMDAwMDAwWhcNMzYwMzIxMjM1OTU5WjBgMQswCQYDVQQGEwJHQjEY',
  'MBYGA1UEChMPU2VjdGlnbyBMaW1pdGVkMTcwNQYDVQQDEy5TZWN0aWdvIFB1Ymxp',
  'YyBTZXJ2ZXIgQXV0aGVudGljYXRpb24gQ0EgRFYgUjM2MIIBojANBgkqhkiG9w0B',
  'AQEFAAOCAY8AMIIBigKCAYEAljZf2HIz7+SPUPQCQObZYcrxLTHYdf1ZtMRe7Yeq',
  'RPSwygz16qJ9cAWtWNTcuICc++p8Dct7zNGxCpqmEtqifO7NvuB5dEVexXn9RFFH',
  '12Hm+NtPRQgXIFjx6MSJcNWuVO3XGE57L1mHlcQYj+g4hny90aFh2SCZCDEVkAja',
  'EMMfYPKuCjHuuF+bzHFb/9gV8P9+ekcHENF2nR1efGWSKwnfG5RawlkaQDpRtZTm',
  'M64TIsv/r7cyFO4nSjs1jLdXYdz5q3a4L0NoabZfbdxVb+CUEHfB0bpulZQtH1Rv',
  '38e/lIdP7OTTIlZh6OYL6NhxP8So0/sht/4J9mqIGxRFc0/pC8suja+wcIUna0HB',
  'pXKfXTKpzgis+zmXDL06ASJf5E4A2/m+Hp6b84sfPAwQ766rI65mh50S0Di9E3Pn',
  '2WcaJc+PILsBmYpgtmgWTR9eV9otfKRUBfzHUHcVgarub/XluEpRlTtZudU5xbFN',
  'xx/DgMrXLUAPaI60fZ6wA+PTAgMBAAGjggGBMIIBfTAfBgNVHSMEGDAWgBRWc1hk',
  'lfmSGrASKgRieaFAFYghSTAdBgNVHQ4EFgQUaMASFhgOr872h6YyV6NGUV3LBycw',
  'DgYDVR0PAQH/BAQDAgGGMBIGA1UdEwEB/wQIMAYBAf8CAQAwHQYDVR0lBBYwFAYI',
  'KwYBBQUHAwEGCCsGAQUFBwMCMBsGA1UdIAQUMBIwBgYEVR0gADAIBgZngQwBAgEw',
  'VAYDVR0fBE0wSzBJoEegRYZDaHR0cDovL2NybC5zZWN0aWdvLmNvbS9TZWN0aWdv',
  'UHVibGljU2VydmVyQXV0aGVudGljYXRpb25Sb290UjQ2LmNybDCBhAYIKwYBBQUH',
  'AQEEeDB2ME8GCCsGAQUFBzAChkNodHRwOi8vY3J0LnNlY3RpZ28uY29tL1NlY3Rp',
  'Z29QdWJsaWNTZXJ2ZXJBdXRoZW50aWNhdGlvblJvb3RSNDYucDdjMCMGCCsGAQUF',
  'BzABhhdodHRwOi8vb2NzcC5zZWN0aWdvLmNvbTANBgkqhkiG9w0BAQwFAAOCAgEA',
  'YtOC9Fy+TqECFw40IospI92kLGgoSZGPOSQXMBqmsGWZUQ7rux7cj1du6d9rD6C8',
  'ze1B2eQjkrGkIL/OF1s7vSmgYVafsRoZd/IHUrkoQvX8FZwUsmPu7amgBfaY3g+d',
  'q1x0jNGKb6I6Bzdl6LgMD9qxp+3i7GQOnd9J8LFSietY6Z4jUBzVoOoz8iAU84OF',
  'h2HhAuiPw1ai0VnY38RTI+8kepGWVfGxfBWzwH9uIjeooIeaosVFvE8cmYUB4TSH',
  '5dUyD0jHct2+8ceKEtIoFU/FfHq/mDaVnvcDCZXtIgitdMFQdMZaVehmObyhRdDD',
  '4NQCs0gaI9AAgFj4L9QtkARzhQLNyRf87Kln+YU0lgCGr9HLg3rGO8q+Y4ppLsOd',
  'unQZ6ZxPNGIfOApbPVf5hCe58EZwiWdHIMn9lPP6+F404y8NNugbQixBber+x536',
  'WrZhFZLjEkhp7fFXf9r32rNPfb74X/U90Bdy4lzp3+X1ukh1BuMxA/EEhDoTOS3l',
  '7ABvc7BYSQubQ2490OcdkIzUh3ZwDrakMVrbaTxUM2p24N6dB+ns2zptWCva6jzW',
  'r8IWKIMxzxLPv5Kt3ePKcUdvkBU/smqujSczTzzSjIoR5QqQA6lN1ZRSnuHIWCvh',
  'JEltkYnTAH41QJ6SAWO66GrrUESwN/cgZzL4JLEqz1Y=',
  '-----END CERTIFICATE-----',
].join('\n');

let cenaceTlsAgent = null;
function getCenaceAgent() {
  if (!cenaceTlsAgent) {
    cenaceTlsAgent = new https.Agent({
      rejectUnauthorized: true,
      ca: [...tls.rootCertificates, SECTIGO_DV_R36_INTERMEDIATE_PEM],
    });
  }
  return cenaceTlsAgent;
}

export function fetchCenaceVerifiedHtml({
  timeoutMs = 12_000,
  maxBytes = 4 * 1024 * 1024,
  agent = getCenaceAgent(),
} = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      SOURCE_URLS.cenace,
      {
        agent,
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': 'GodsEyeView-energy/0.1',
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`CENACE HTTP ${res.statusCode}`));
          return;
        }
        const chunks = [];
        let total = 0;
        res.on('data', (chunk) => {
          total += chunk.length;
          if (total > maxBytes) {
            req.destroy(new Error('CENACE response exceeds size cap'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('CENACE request timed out'));
    });
  });
}

export function buildCelecPointValuesUrl(
  mrid,
  nowMs,
  dayOffset = 0,
  lookbackDays = 2,
) {
  if (!ALLOWLISTED_CELEC_MRIDS.includes(Number(mrid))) {
    throw new Error(`Disallowed CELEC MRID: ${mrid}`);
  }
  const dayMs = nowMs - dayOffset * 86_400_000;
  const fecha = formatEcuadorCelecDate(dayMs);
  const startIso = new Date(nowMs - lookbackDays * 86_400_000).toISOString();
  const endIso = new Date(nowMs).toISOString();
  return (
    `https://generacioncsr.celec.gob.ec:8443/ords/csr/sardomcsr/pointValues?mrid=${Number(mrid)}` +
    `&fechaInicio=${encodeURIComponent(startIso)}` +
    `&fechaFin=${encodeURIComponent(endIso)}` +
    `&fecha=${encodeURIComponent(fecha)}`
  );
}

/**
 * Bounded Ecuador energy service: fixed allowlisted MRIDs, verified TLS,
 * single-flight coalescing, 5-minute TTL, 1-minute failure cooldown, and
 * 6-hour last-good fallback preserving original observation timestamps.
 */
export function createEcuadorEnergyService({
  fetchImpl = globalThis.fetch,
  fetchCenaceHtml = fetchCenaceVerifiedHtml,
  now = Date.now,
} = {}) {
  const mridHistory = new Map();
  const previousCenaceByPlant = new Map();
  const latestCenaceByPlant = new Map();
  let lastCenace = null;
  let cachedSnapshot = null;
  let pendingTask = null;
  let failureUntil = -Infinity;

  function mergeMridReadings(mrid, incoming, nowMs) {
    const key = Number(mrid);
    const existing = mridHistory.get(key) || [];
    const byTime = new Map();
    const cutoff = nowMs - 72 * 3600_000;
    for (const item of [...existing, ...incoming]) {
      if (item.observedMs >= cutoff && item.observedMs <= nowMs + 5 * 60_000) {
        byTime.set(item.observedMs, item);
      }
    }
    const merged = [...byTime.values()]
      .sort((a, b) => b.observedMs - a.observedMs)
      .slice(0, 96);
    if (merged.length > 0) {
      mridHistory.set(key, merged);
    }
    return mridHistory.get(key) || [];
  }

  async function fetchOneMrid(mrid, nowMs) {
    const lookbackDays = [30031, 30538, 24019].includes(Number(mrid)) ? 3 : 2;
    for (let dayOffset = 0; dayOffset < 2; dayOffset++) {
      const signal = AbortSignal.timeout(12_000);
      const url = buildCelecPointValuesUrl(
        mrid,
        nowMs,
        dayOffset,
        lookbackDays,
      );
      const response = await fetchImpl(url, {
        signal,
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'GodsEyeView-energy/0.1',
        },
      });
      if (!response.ok) {
        throw new Error(`CELEC HTTP ${response.status}`);
      }
      const payload = await readResponseJsonCapped(
        response,
        512 * 1024,
        signal,
      );
      const normalized = normalizeCelecItems(payload?.items || [], nowMs);
      if (normalized.length > 0) {
        return mergeMridReadings(mrid, normalized, nowMs);
      }
    }
    return mridHistory.get(Number(mrid)) || [];
  }

  function recordCenacePlantSamples(parsed) {
    if (!parsed?.sourceDate || !Number.isFinite(parsed?.observedMs)) return;
    const byName = new Map(
      (parsed.hydroGenerators || []).map((g) => [
        String(g.central || '').toLowerCase(),
        g.generationMWh,
      ]),
    );
    for (const spec of ECUADOR_HYDRO_PLANTS) {
      const mwh = byName.get(spec.cenaceName.toLowerCase());
      if (typeof mwh !== 'number' || !Number.isFinite(mwh)) continue;
      const priorLatest = latestCenaceByPlant.get(spec.id);
      if (
        priorLatest &&
        priorLatest.sourceDate === parsed.sourceDate &&
        parsed.observedMs > priorLatest.observedMs &&
        mwh >= priorLatest.dailyCumulativeMWh
      ) {
        previousCenaceByPlant.set(spec.id, priorLatest);
      } else if (priorLatest && priorLatest.sourceDate !== parsed.sourceDate) {
        previousCenaceByPlant.delete(spec.id);
      }
      if (
        !priorLatest ||
        priorLatest.sourceDate !== parsed.sourceDate ||
        parsed.observedMs > priorLatest.observedMs
      ) {
        latestCenaceByPlant.set(spec.id, {
          sourceDate: parsed.sourceDate,
          dailyCumulativeMWh: mwh,
          observedMs: parsed.observedMs,
        });
      }
    }
  }

  return async function snapshot() {
    const nowMs = now();
    if (failureUntil > nowMs) {
      throw new Error('Ecuador energy provider unavailable');
    }
    const age = cachedSnapshot ? nowMs - cachedSnapshot.fetchedAt : Infinity;
    if (age < 300_000) {
      return { ...cachedSnapshot, stale: cachedSnapshot.stale };
    }
    if (cachedSnapshot?.retryAfter > nowMs) {
      return { ...cachedSnapshot, stale: true };
    }
    if (pendingTask) return pendingTask;

    pendingTask = (async () => {
      const startedMs = now();
      let cenaceError = false;
      let celecError = false;

      const cenacePromise = (async () => {
        try {
          const html = await fetchCenaceHtml({ timeoutMs: 12_000 });
          const parsed = parseCenaceHtml(html, startedMs);
          recordCenacePlantSamples(parsed);
          lastCenace = parsed;
        } catch {
          cenaceError = true;
        }
      })();

      const celecPromise = (async () => {
        const results = await Promise.allSettled(
          ALLOWLISTED_CELEC_MRIDS.map((mrid) => fetchOneMrid(mrid, startedMs)),
        );
        const succeeded = results.filter(
          (r) => r.status === 'fulfilled' && r.value.length > 0,
        ).length;
        if (succeeded === 0) {
          celecError = true;
        } else if (results.some((r) => r.status === 'rejected')) {
          celecError = true;
        }
      })();

      try {
        await Promise.all([cenacePromise, celecPromise]);
        const hasAnyCelec = [...mridHistory.values()].some(
          (list) => list.length > 0,
        );
        if (cenaceError && celecError && !lastCenace && !hasAnyCelec) {
          throw new Error('Ecuador energy provider unavailable');
        }
        const built = buildEcuadorEnergySnapshot({
          cenace: lastCenace,
          celecByMrid: mridHistory,
          previousCenaceByPlant,
          nowMs: startedMs,
          cenaceError,
          celecError,
        });
        cachedSnapshot = built;
        return built;
      } catch {
        if (
          cachedSnapshot &&
          startedMs - cachedSnapshot.fetchedAt < 6 * 3600_000
        ) {
          cachedSnapshot.retryAfter = startedMs + 60_000;
          return { ...cachedSnapshot, stale: true };
        }
        failureUntil = startedMs + 60_000;
        throw new Error('Ecuador energy provider unavailable');
      } finally {
        pendingTask = null;
      }
    })();

    return pendingTask;
  };
}

export function ecuadorEnergyProxy(options) {
  const snapshot = createEcuadorEnergyService(options);
  const install = (server) => {
    server.middlewares.use('/api/ecuador-energy', async (req, res) => {
      const send = (status, payload) => {
        res.writeHead(status, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify(payload));
      };
      const url = new URL(req.url, 'http://localhost');
      if (req.method !== 'GET') return send(405, { error: 'GET required' });
      if (url.pathname !== '/' || [...url.searchParams.keys()].length > 0) {
        return send(400, { error: 'Invalid request' });
      }
      try {
        send(200, await snapshot());
      } catch (e) {
        send(503, { error: e.message });
      }
    });
  };
  return {
    name: 'ecuador-energy-proxy',
    configureServer: install,
    configurePreviewServer: install,
  };
}
