import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import tls from 'node:tls';
import test from 'node:test';
import {
  ALLOWLISTED_CELEC_MRIDS,
  ECUADOR_HYDRO_PLANTS,
  assessMazarReserve,
  buildEcuadorEnergySnapshot,
  computeIntervalAverageMW,
  decodePlotlyY,
  normalizeCelecItems,
  parseCenaceHtml,
} from '../../src/layers/ecuadorEnergy/model.js';
import { createEcuadorEnergySource } from '../../src/layers/ecuadorEnergy/source.js';
import {
  SECTIGO_DV_R36_INTERMEDIATE_PEM,
  buildCelecPointValuesUrl,
  createEcuadorEnergyService,
  ecuadorEnergyProxy,
} from './ecuadorEnergy.js';

function encodeFloat64Base64(values) {
  const buf = Buffer.alloc(values.length * 8);
  values.forEach((v, idx) => buf.writeDoubleLE(v, idx * 8));
  return { dtype: 'f8', bdata: buf.toString('base64') };
}

function buildCenaceFixture({
  dateHeading = 'Viernes, 30 de octubre de 2026',
  cocaMWh = 18584,
  mazarMWh = 389,
  pauteMWh = 1059,
  sopladoraMWh = 646,
  slotIndex = 36,
  demandMW = 4457.5,
  hydroMW = 3286.1,
} = {}) {
  const labels = Array.from({ length: 48 }, (_, idx) => {
    const h = String(Math.floor(idx / 2)).padStart(2, '0');
    const m = idx % 2 === 0 ? '00' : '30';
    return `${h}:${m}`;
  });
  const demandSeries = labels.map((_, idx) =>
    idx <= slotIndex ? demandMW : NaN,
  );
  const hydroSeries = labels.map((_, idx) =>
    idx <= slotIndex ? hydroMW : NaN,
  );
  const piePlot = [
    {
      type: 'pie',
      labels: [
        'IMPORTACIÓN',
        'HIDROELÉCTRICA',
        'TÉRMICA',
        'RENOVABLE',
        'EXPORTACIÓN',
      ],
      values: [30.39, 51191.52, 21543.57, 592.39, 57.42],
    },
  ];
  const barPlot = [
    { type: 'bar', name: 'Coca Codo', y: encodeFloat64Base64([cocaMWh]) },
    { type: 'bar', name: 'Minas San Francisco', y: [4347] },
    { type: 'bar', name: 'San Francisco', y: [2915] },
    { type: 'bar', name: 'Delsitanisagua', y: [2239] },
    { type: 'bar', name: 'Agoyán', y: [2102] },
    { type: 'bar', name: 'Paute', y: [pauteMWh] },
    { type: 'bar', name: 'Sopladora', y: [sopladoraMWh] },
    { type: 'bar', name: 'Mazar', y: [mazarMWh] },
  ];
  const thermalBar = [
    { type: 'bar', name: 'Térmica', y: [20122] },
    { type: 'bar', name: 'Gas Natural', y: [1422] },
    { type: 'bar', name: 'Renovable', y: [592] },
  ];
  const curvePlot = [
    {
      type: 'scatter',
      name: 'Hidráulica',
      x: labels,
      y: encodeFloat64Base64(hydroSeries),
    },
    {
      type: 'scatter',
      name: 'DEMANDA NACIONAL',
      x: labels,
      y: encodeFloat64Base64(demandSeries),
    },
    {
      type: 'scatter',
      name: 'PRODUCCIÓN TOTAL',
      x: labels,
      y: encodeFloat64Base64(demandSeries),
    },
  ];
  const noisyAnnualPlot = [
    {
      type: 'bar',
      name: 'Coca Codo',
      y: [9999999],
    },
  ];
  return `
    <html><body>
      <div class="tab-content">
        <h2>PRODUCCIÓN EN TIEMPO REAL</h2>
        <span>${dateHeading}</span>
        <script>
          Plotly.newPlot("pie-div", ${JSON.stringify(piePlot)});
          Plotly.newPlot("bar-div", ${JSON.stringify(barPlot)});
          Plotly.newPlot("thermal-div", ${JSON.stringify(thermalBar)});
          Plotly.newPlot("curve-div", ${JSON.stringify(curvePlot)});
        </script>
      </div>
      <div class="tab-content">
        <h2>INFORMACIÓN OPERATIVA ANUAL</h2>
        <span>2026 (hasta el día 29 de octubre)</span>
        <script>
          Plotly.newPlot("annual-div", ${JSON.stringify(noisyAnnualPlot)});
        </script>
      </div>
    </body></html>
  `;
}

test('decodePlotlyY decodes plain arrays and typed base64 buffers portably', () => {
  assert.deepEqual(decodePlotlyY([12.5, null, NaN, 4]), [12.5, null, null, 4]);
  const f8 = encodeFloat64Base64([18584.25, NaN, 389.5]);
  assert.deepEqual(decodePlotlyY(f8), [18584.25, null, 389.5]);

  const i2Buf = Buffer.alloc(4);
  i2Buf.writeInt16LE(389, 0);
  i2Buf.writeInt16LE(1059, 2);
  assert.deepEqual(
    decodePlotlyY({ dtype: 'i2', bdata: i2Buf.toString('base64') }),
    [389, 1059],
  );
});

test('parseCenaceHtml selects real-time section, preserves MWh vs MW, and handles missing date headers', () => {
  const nowMs = Date.parse('2026-10-30T23:30:00Z');
  const parsed = parseCenaceHtml(buildCenaceFixture(), nowMs);
  assert.equal(parsed.sourceDate, '2026-10-30');
  assert.equal(parsed.observedAt, '2026-10-30T23:00:00.000Z');
  assert.equal(parsed.stale, false);
  assert.equal(parsed.dailyCompositionMWh.hydroMWh, 51191.52);
  assert.equal(parsed.dailyCompositionMWh.naturalGasMWh, 1422);
  assert.equal(
    parsed.hydroGenerators.find((g) => g.central === 'Coca Codo')
      ?.generationMWh,
    18584,
  );
  assert.equal(parsed.latestPowerMW.demandMW, 4457.5);
  assert.equal(parsed.latestPowerMW.hydroMW, 3286.1);

  const missingDate = parseCenaceHtml(
    buildCenaceFixture({ dateHeading: 'Fecha no disponible' }),
    nowMs,
  );
  assert.equal(missingDate.sourceDate, null);
  assert.equal(missingDate.observedAt, null);
  assert.equal(missingDate.observedMs, null);
  assert.equal(missingDate.stale, true);
});

test('computeIntervalAverageMW accepts only monotonic same-day samples with valid clocks', () => {
  const valid = computeIntervalAverageMW(
    {
      sourceDate: '2026-10-30',
      dailyCumulativeMWh: 19200,
      observedMs: Date.parse('2026-10-30T23:00:00Z'),
    },
    {
      sourceDate: '2026-10-30',
      dailyCumulativeMWh: 18584,
      observedMs: Date.parse('2026-10-30T22:30:00Z'),
    },
  );
  assert.deepEqual(valid, {
    estimatedIntervalAvgMW: 1232,
    intervalStartAt: '2026-10-30T22:30:00.000Z',
    intervalEndAt: '2026-10-30T23:00:00.000Z',
    intervalHours: 0.5,
  });

  // Rejects day reset / decreasing cumulative MWh
  assert.equal(
    computeIntervalAverageMW(
      {
        sourceDate: '2026-10-30',
        dailyCumulativeMWh: 500,
        observedMs: Date.parse('2026-10-30T23:00:00Z'),
      },
      {
        sourceDate: '2026-10-30',
        dailyCumulativeMWh: 18584,
        observedMs: Date.parse('2026-10-30T22:30:00Z'),
      },
    ),
    null,
  );

  // Rejects mismatched civil dates
  assert.equal(
    computeIntervalAverageMW(
      {
        sourceDate: '2026-10-31',
        dailyCumulativeMWh: 19200,
        observedMs: Date.parse('2026-10-31T05:30:00Z'),
      },
      {
        sourceDate: '2026-10-30',
        dailyCumulativeMWh: 18584,
        observedMs: Date.parse('2026-10-31T04:30:00Z'),
      },
    ),
    null,
  );

  // Rejects missing clock or zero interval
  assert.equal(
    computeIntervalAverageMW(
      { sourceDate: '2026-10-30', dailyCumulativeMWh: 19200, observedMs: null },
      {
        sourceDate: '2026-10-30',
        dailyCumulativeMWh: 18584,
        observedMs: Date.parse('2026-10-30T22:30:00Z'),
      },
    ),
    null,
  );
});

test('normalizeCelecItems and assessMazarReserve enforce future bounds, staleness, and 2115 m sediment threshold', () => {
  const nowMs = Date.parse('2026-10-30T22:30:00Z');
  const items = normalizeCelecItems(
    [
      { loctimestamp: '2026-10-31T05:00:00Z', valueedit: null },
      { loctimestamp: '2026-10-30T23:00:00Z', valueedit: 2125 }, // 30m future -> rejected
      { loctimestamp: '2026-10-30T22:00:00Z', valueedit: 2118.4 },
      { loctimestamp: '2026-10-30T04:00:00Z', valueedit: 2119.3 },
    ],
    nowMs,
  );
  assert.equal(items.length, 2);
  assert.equal(items[0].value, 2118.4);

  const assessment = assessMazarReserve(items[0], items, nowMs);
  assert.equal(assessment.reserveStatus, 'pre-alert-low');
  assert.equal(assessment.marginTo2115M, 3.4);
  assert.equal(assessment.marginTo2098M, 20.4);
  assert.equal(assessment.changeMPerDay, -1.2);
  assert.equal(assessment.daysTo2115Scenario, 2.8);

  const critical = assessMazarReserve(
    { observedMs: nowMs, value: 2114.8 },
    [],
    nowMs,
  );
  assert.equal(critical.reserveStatus, 'critical-sediment-zone');
  assert.equal(critical.daysTo2115Scenario, 0);
});

test('createEcuadorEnergyService handles CELEC midnight fallback, monotonic interval MW, TTL, and partial failure', async () => {
  let clock = Date.parse('2026-10-30T22:40:00Z');
  let cenaceSlot = 35; // 17:30 ECT = 22:30 UTC
  let cocaMWh = 18000;
  let failCelec = false;
  let failCenace = false;

  const fetchImpl = async (url) => {
    if (failCelec) return new Response('bad', { status: 503 });
    const parsedUrl = new URL(url);
    const mrid = Number(parsedUrl.searchParams.get('mrid'));
    const fecha = parsedUrl.searchParams.get('fecha');
    // Simulate midnight empty day on first day query for 30031 when fecha starts with 31/10/2026
    if (fecha?.startsWith('31/10/2026')) {
      return new Response(
        JSON.stringify({
          items: [{ loctimestamp: '2026-10-31T05:00:00Z', valueedit: null }],
        }),
        { status: 200 },
      );
    }
    const valMap = {
      30031: 2123.435,
      30538: 40.29,
      30503: 1,
      24019: 1974.42,
      24811: 68.54,
      24812: 47.12,
      90919: 1314.98,
      90537: 45.76,
      90503: 1,
      650919: 785.93,
      650538: 30.75,
      650503: 3,
    };
    return new Response(
      JSON.stringify({
        items: [
          {
            loctimestamp: '2026-10-30T22:00:00Z',
            valueedit: valMap[mrid] ?? 1,
          },
        ],
      }),
      { status: 200 },
    );
  };

  const fetchCenaceHtml = async () => {
    if (failCenace) throw new Error('CENACE down');
    return buildCenaceFixture({
      cocaMWh,
      slotIndex: cenaceSlot,
    });
  };

  const service = createEcuadorEnergyService({
    fetchImpl,
    fetchCenaceHtml,
    now: () => clock,
  });

  const first = await service();
  assert.equal(first.schemaVersion, 1);
  assert.equal(first.stale, false);
  assert.equal(first.plants.length, ECUADOR_HYDRO_PLANTS.length);
  const mazar1 = first.plants.find((p) => p.id === 'mazar');
  assert.equal(mazar1.cotaMsnm, 2123.435);
  assert.equal(mazar1.inflowM3s, 40.29);
  assert.equal(mazar1.dailyCumulativeMWh, 389);
  const coca1 = first.plants.find((p) => p.id === 'coca-codo-sinclair');
  assert.equal(coca1.dailyCumulativeMWh, 18000);
  assert.equal(coca1.estimatedIntervalAvgMW, null);

  // Advance 6 minutes and advance CENACE half-hour slot (17:30 -> 18:00 ECT)
  clock = Date.parse('2026-10-30T23:06:00Z');
  cenaceSlot = 36;
  cocaMWh = 18584;
  const second = await service();
  const coca2 = second.plants.find((p) => p.id === 'coca-codo-sinclair');
  assert.equal(coca2.dailyCumulativeMWh, 18584);
  assert.equal(coca2.estimatedIntervalAvgMW, 1168);

  // Advance past Ecuador midnight (05:10 UTC = 00:10 ECT on Oct 31) and fail CENACE;
  // CELEC day 0 returns empty and falls back to day 1 (Oct 30).
  clock = Date.parse('2026-10-31T05:10:00Z');
  failCenace = true;
  const partial = await service();
  assert.equal(partial.cenaceError, true);
  assert.equal(partial.celecError, false);
  assert.equal(partial.plants.find((p) => p.id === 'mazar').cotaMsnm, 2123.435);

  // Source seam, intermediate CA cryptographic verification, and proxy route checks
  const intermediate = new crypto.X509Certificate(
    SECTIGO_DV_R36_INTERMEDIATE_PEM,
  );
  assert.equal(
    intermediate.fingerprint256,
    '8C:54:C3:34:B6:6B:A4:E4:26:77:2A:F4:A3:F9:13:6C:19:A1:AE:C7:29:FD:B2:8C:53:5C:07:A5:A4:EF:22:E0',
  );
  const issuerRoot = tls.rootCertificates
    .map((pem) => new crypto.X509Certificate(pem))
    .find(
      (cert) =>
        cert.subject === intermediate.issuer &&
        intermediate.verify(cert.publicKey),
    );
  assert.ok(
    issuerRoot,
    'Intermediate CA must chain to a trusted root in tls.rootCertificates',
  );
  assert.equal(ALLOWLISTED_CELEC_MRIDS.length, 12);
  assert.throws(
    () => buildCelecPointValuesUrl(999999, clock),
    /Disallowed CELEC MRID/,
  );

  const source = createEcuadorEnergySource({
    fetchImpl: async () =>
      new Response(JSON.stringify(second), { status: 200 }),
  });
  const fromSource = await source.getSnapshot();
  assert.equal(fromSource.plants.length, 8);

  let middlewareHandler;
  const plugin = ecuadorEnergyProxy({
    fetchImpl,
    fetchCenaceHtml,
    now: () => clock,
  });
  assert.equal(
    plugin.configureServer({
      middlewares: {
        use(_route, fn) {
          middlewareHandler = fn;
          return 'connect-instance';
        },
      },
    }),
    undefined,
  );

  let statusSent;
  await middlewareHandler(
    { method: 'POST', url: '/' },
    {
      writeHead(s) {
        statusSent = s;
      },
      end() {},
    },
  );
  assert.equal(statusSent, 405);

  await middlewareHandler(
    { method: 'GET', url: '/?extra=1' },
    {
      writeHead(s) {
        statusSent = s;
      },
      end() {},
    },
  );
  assert.equal(statusSent, 400);
});
