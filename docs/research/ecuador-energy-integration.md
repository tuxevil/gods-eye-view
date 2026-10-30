# Ecuador hydro and grid integration (CELEC SUR + CENACE)

Verified LIVE on 2026-10-30, approximately 23:15–23:20 UTC. Source audit,
implementation, and verification were performed directly in God's Eye View
without touching `/root/aegis` or coupling the two repositories. The untracked
`docs/research/ecuador-data-coverage.md` remains preserved.

## Primary sources, TLS remediation, and contracts

- **CELEC EP Celec Sur (`https://generacioncsr.celec.gob.ec:8443/ords/csr/sardomcsr/pointValues`)**:
  queried over standard verified TLS (`rejectUnauthorized: true`) using an
  allowlist of 12 metric IDs (`ALLOWLISTED_CELEC_MRIDS`):
  - **Mazar**: elevation `30031` (`m s.n.m.`), inflow `30538` (`m³/s`), units online `30503`
  - **Paute-Molino (Amaluza)**: elevation `24019` (`m s.n.m.`), plant flow `24811` (`m³/s`), basin flow `24812` (`m³/s`)
  - **Sopladora**: elevation `90919` (`m s.n.m.`), flow `90537` (`m³/s`), units online `90503`
  - **Minas San Francisco**: elevation `650919` (`m s.n.m.`), flow `650538` (`m³/s`), units online `650503`
    Queries format `fecha` in the `America/Guayaquil` civil day and fall back to
    the preceding Ecuador civil day around midnight if the new day has no valid
    samples yet. Each metric retains its own `loctimestamp` (`cotaObservedAt`,
    `inflowObservedAt`, `flowObservedAt`, `basinFlowObservedAt`, `unitsObservedAt`).
- **CENACE (`https://www.cenace.gob.ec/info-operativa/InformacionOperativa.htm`)**:
  `www.cenace.gob.ec` serves only its leaf certificate (`*.cenace.gob.ec`) and
  omits its intermediate CA (`Sectigo Public Server Authentication CA DV R36`,
  issued by `Sectigo Public Server Authentication Root R46`, SHA-256 fingerprint
  `8C:54:C3:34:B6:6B:A4:E4:26:77:2A:F4:A3:F9:13:6C:19:A1:AE:C7:29:FD:B2:8C:53:5C:07:A5:A4:EF:22:E0`).
  Instead of disabling TLS verification (`rejectUnauthorized: false`),
  `server/providers/ecuadorEnergy.js` supplies the official Sectigo intermediate
  CA alongside `tls.rootCertificates` with `rejectUnauthorized: true`, and
  `server/providers/ecuadorEnergy.test.mjs` cryptographically verifies the
  intermediate signature against Node's trusted root store.
- **Portable parser (`src/layers/ecuadorEnergy/model.js`)**:
  parses the semantic `PRODUCCIÓN EN TIEMPO REAL` section without `jsdom` or
  Node builtins, decoding both JSON arrays and Plotly base64 typed arrays
  (`f8`, `f4`, `i4`, `i2`) via `Uint8Array` and `DataView`.

## Strict separation of cumulative MWh, instantaneous MW, and interval estimates

- **Daily cumulative energy (`dailyCumulativeMWh`)**: per-plant and per-source
  bars/pies from CENACE are daily cumulative energy in **MWh** for
  `cenaceSourceDate`, never instantaneous power in **MW**.
- **Estimated interval average MW (`estimatedIntervalAvgMW`)**: computed as
  `(ΔMWh / Δhours)` **only** when two consecutive CENACE samples belong to the
  same non-null `sourceDate`, same plant, have valid distinct observation clocks
  (`0 < Δhours <= 6`), and are monotonically non-decreasing
  (`currentMWh >= previousMWh`). Resets, missing date headings, and mismatched
  days are rejected.
- **National preliminary SCADA power (`latestPowerMW`)**: half-hourly curves
  (`DEMANDA NACIONAL`, `PRODUCCIÓN TOTAL`, `Hidráulica`, `Térmica`, `Renovable`,
  `Importación`, `Exportación`) are reported in **MW** at the last finite slot
  (`observedAt`), with an explicit caveat that observed dispatch/demand balance
  does not represent available reserve margin or unrationed demand.
- **Mazar thresholds**: `2098 m s.n.m.` (published design minimum),
  `2115 m s.n.m.` (technical sediment precaution threshold), `2120 m s.n.m.`
  (pre-alert), and `2153 m s.n.m.` (normal maximum). Any linear projection to
  `2115 m` is explicitly labeled a constant-rate continuation scenario to the
  sediment threshold, not a mandatory shutdown order or blackout countdown.

## LIVE verification on port 4173

`GET http://127.0.0.1:4173/api/ecuador-energy` returned HTTP 200
(`schemaVersion: 1`, `stale: false`, `cenaceError: false`, `celecError: false`):

- **CENACE (`sourceDate: 2026-10-30`, `observedAt: 2026-10-30T23:00:00.000Z`, `18:00` ECT)**:
  - National SCADA power: Demand `4,457.49 MW`, Total production `4,457.49 MW`,
    Hydro `3,286.10 MW`, Thermal `1,164.48 MW`, Renewable `6.91 MW`.
  - Daily cumulative energy: Hydro `51,191.52 MWh`, Thermal `21,543.57 MWh`
    (Natural gas `1,422 MWh`), Renewable `592.39 MWh`, Import `30.39 MWh`,
    Export `57.42 MWh`.
- **Hydro plants (8 cataloged sites)**:
  - **Coca Codo Sinclair**: `18,584 MWh` cumulative daily energy
  - **Mazar**: `2,123.435 m s.n.m.`, inflow `44.741 m³/s`, `1` unit online, `389 MWh` cumulative daily energy (`above-pre-alert`, `+8.44 m` above `2,115 m`)
  - **Paute-Molino (Amaluza)**: `1,974.518 m s.n.m.`, flow `74.506 m³/s`, basin flow `47.117 m³/s`, `1,059 MWh` cumulative daily energy
  - **Sopladora**: `1,314.43 m s.n.m.`, flow `51.564 m³/s`, `2` units online, `646 MWh` cumulative daily energy
  - **Minas San Francisco**: `785.57 m s.n.m.`, flow `28.045 m³/s`, `3` units online, `4,347 MWh` cumulative daily energy
  - **San Francisco**: `2,915 MWh` cumulative daily energy
  - **Delsitanisagua**: `2,239 MWh` cumulative daily energy
  - **Agoyán**: `2,102 MWh` cumulative daily energy

## Test, boundary, token, i18n, and build gates

- Focused test command:
  ```sh
  node --test server/providers/ecuadorEnergy.test.mjs src/layers/ecuadorEnergy/ecuadorEnergy.test.mjs src/app/constructCatalog.test.mjs src/app/sourceComposition.test.mjs src/data/layerState.test.mjs src/data/layerStateTokenLedger.test.mjs src/firstRunExperience.test.mjs
  ```
  Result: **134 tests passed, 0 failed**.
- `npm run check:boundaries`: **passed** (`1,047` modules, `82` portable entries).
- `npm run layer-token:check -- --base-ref main`: **passed** (`32 published, 2 new`; `ecuador-energy` assigned token `7`).
- `npm run i18n`: all 10 locale catalogs complete (`2,734` messages); zero new unmarked UI strings.
- `npm run build`: **passed** (`14.08s`).
