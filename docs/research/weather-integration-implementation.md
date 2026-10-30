# Ecuador weather implementation and source audit

Verified 2026-10-30 UTC. This note separates LIVE probes from deterministic tests.
The pre-existing `ecuador-data-coverage.md` is preserved.

## Activation and contracts

Restart the local Vite server after pulling these commits (`npm run dev -- --host
127.0.0.1 --port 4173 --strictPort` after the existing operator-owned process is
stopped). The existing process was deliberately left alone; it returned 404 for
the newly added route. Enable **Weather stations** in Data Layers / Weather.
Navigate to Ecuador, select a marker for source, exact observation UTC, units,
condition and missing sensors. Labels use the shared world overlay; markers use
one clustered CustomDataSource, capped at 400 reports. Temperature color legend
appears in the Weather card. Gray means stale or unavailable temperature.

At globe scale the provider requests Ecuador including Galápagos. Below 2,000 km
camera altitude it selects a bounded 10° cell worldwide. Refresh is five minutes;
cell changes are picked up on the next refresh (toggle off/on for immediate
refresh). This is airport sampling, not a uniform land/weather network or an
interpolation surface. Dense cells above the AWC 400-report limit fail closed;
future subdivision/cache-file ingestion is required for complete dense coverage.

Portable `weatherStations/model.js` normalizes independent nullable fields;
`source.getSnapshot({signal,cell})` returns
`{schemaVersion:1,readings,stale,fetchedAt}`. Records include provider-qualified
identity, station name/coordinates, observedMs/observedAt, tempC, humidity,
windMs/gustMs/windDeg, pressureHpa/pressureType, solarWm2, rainRateMmHr,
rainDailyMm, cloud, condition, source. METAR humidity is explicitly derived from
temperature/dew point; pressure is altimeter setting, not station pressure.
Missing fields remain null. Variable wind direction remains null, calm speed can
be zero. METAR cloud codes/conditions are observations, not quantitative rainfall.
Ambient hourly rain accumulation is `rainLastHourMm`, never an instantaneous
rate. Fetched time never overwrites observed time. Reports older than 90 minutes
are stale; future observations beyond five minutes and reports older than one day
are rejected. The current layer shows newest-per-station, not a history browser.

The application lifecycle schedules work only while enabled. Disable aborts and
invalidates in-flight results; refresh replaces entities rather than appending.
Catalog source availability supports omitted providers. Shared URL token `6`
serializes enablement only. Analyst records and the voice manifest expose the
same observations through the existing analyst/tool/MCP bridge. No new MCP
server or parallel weather engine is introduced. Context is explicitly false:
station samples are queryable records, not fabricated area weather context.

Server `/api/weather-stations?cell=ecuador` accepts GET and validated fixed cells
only. Fixed AWC origin, no redirects, 12-second deadline, 2 MiB streaming cap,
400-row cap, 64-entry cache, four concurrent cells, single-flight per cell,
five-minute TTL, one-minute failure cooldown and six-hour last-good fallback.
Stale fallback preserves original timestamps; the client retains last-good data
and reports degraded/stale on failure. Cache is memory-only and lost on restart.
A failed optional Ambient provider does not erase METAR; `ambientError` marks
partial failure. No key is required for METAR. No client credential storage.

## Official sources and LIVE results

- [AWC official API documentation](https://aviationweather.gov/data/api/):
  worldwide METAR, JSON, bounded queries, 100 requests/minute maximum, most
  products 400 results, no CORS, explicit 204 empty response. Uses documented
  `bbox`, `format=json`, `hours=3`, custom user agent. A public machine API;
  aviation reports are not a certified local warning or rainfall service.
- LIVE mainland query `bbox=-6,-82,2,-74`: HTTP 200, 62 report rows,
  14 distinct SE stations. Implemented Ecuador service including Galápagos
  `bbox=-6,-92,2,-74`: 24 normalized regional stations, **16 SE stations**.
  LIVE implemented HTTP middleware: HTTP 200 at 16:47:17 UTC, stale=false.
  SECA, SECO, SECU, SEGS, SEGU, SEJD, SELT, SEMC, SEMT, SENL, SEQM,
  SERB, SESA, SESM, SEST, SETN. Most 16:00 UTC, SEGU 15:00, SETN 14:00;
  the last is correctly individually stale. This is evidence of access at this
  instant, not a promised station roster or uptime SLA.
- LIVE NOAA nowCOAST satellite WMS GetCapabilities: regional GOES IR extent
  west -179.5026, east -50.7495, south **10.9106**, north 50.5532.
  It does **not** cover Ecuador. Five-minute timestamps, latest 16:38 UTC.
  Existing global longwave mosaic covers Ecuador (bounds approximately ±72.74°
  latitude), hourly time list 10:00–16:00 UTC in this response. Existing source
  description retains nominal 2–3-hour processing latency; WMS advertised time
  is not proof of per-pixel capture time. Do not relabel the regional product as
  Ecuador coverage. Source:
  https://nowcoast.noaa.gov/geoserver/observations/satellite/wms?service=WMS&request=GetCapabilities
- [NOAA GOES-19 full disk](https://www.star.nesdis.noaa.gov/GOES/fulldisk.php?sat=G19)
  documents ten-minute imagery. Ecuador needs full-disk or georeferenced South
  America data, not the regional nowCOAST product. Next imagery increment:
  register an explicit full-disk GOES-19 product in the existing weather manifest
  and image engine, with correct geostationary reprojection, exact scan times,
  bounded history and latency. A raw full-disk JPEG is not an equirectangular map.
  No incorrect overlay was added. Global IR remains available now. IR is cloud/
  surface brightness temperature, not observed surface rainfall.
- Existing weather engine: bounded WMS manifests, explicit frame times, weather
  clock/history, cached image/detail routes. Radar is MRMS CONUS only; lightning
  Americas/Pacific density (not individual GLM flashes). Existing wind engine
  already offers NOAA GFS and ECMWF IFS forecast grids and scalar overlays,
  distinct run/valid times, GRIB parsing, approximately 1° display sampling.
  It is a forecast, not a weather station. No duplicate model adapter needed.

## Ambient, INAMHI and Weather Underground

Read-only audit of `/root/aegis/AGENTS.md`, handoff, `sources.js`, `celec.js`,
`backend.js`, `test/sources.test.js`, `test/celec.test.js` performed; no edits.
AEGIS preserves finite numbers/nulls and converts F→C, mph→km/h, inHg→hPa,
inches→mm. Its current weather acquisition uses an undocumented lightning
host/device-data endpoint. That is deliberately not copied. Its hourlyrainin
normalization as a rate is not adopted: an hourly accumulation is not an
instantaneous rain rate. Private station/account identifiers were not copied.

[Official Ambient REST contract](https://github.com/ambient-weather/api-docs/blob/master/apiary.apib)
and [vendor key guidance](https://ambientweather.com/faqs/question/view/id/1934/)
document applicationKey + account apiKey and `/v1/devices` for authorized user
devices. Limits are 1 request/second/account and 3/second/application. There is
no assumption of network-wide public access. Optional adapter implemented,
**mock-tested only**, no authenticated LIVE request or quota spent.

Optional private server environment (never VITE_):

```
AMBIENT_APPLICATION_KEY=<application key>
AMBIENT_API_KEY=<authorized account key>
AMBIENT_PUBLIC_STATIONS=[{"id":"public-alias","device":"<authorized device identifier>","lat":<approved public latitude>,"lon":<approved public longitude>}]
```

Only explicitly allowlisted devices are published, with operator-approved public
coordinates and alias; account names, location metadata, MACs and keys never
appear in normalized output. This is an explicit publication choice by the
operator: do not enable for private station locations without permission.
No account keys exist in this checkout; absent config does zero Ambient work.
The adapter currently joins the Ecuador overview snapshot only. Account access
does not establish general redistribution rights; review the station owner's
permission and current vendor terms before enabling for a public deployment.

[INAMHI services](https://servicios.inamhi.gob.ec/) and
[station viewer](https://inamhi.gob.ec/info/) expose viewing products, but no
stable documented public machine observation API/redistribution permission was
established in this audit. No scraping adapter added. [WU official PWS API](https://www.wunderground.com/pws-api)
is contributor/account-key access; no credential or redistribution entitlement
was available. Both remain future authorized adapters, not prerequisites for METAR.

## Energy follow-on

AEGIS CENACE parser separates daily `generationMWh` composition/plant cumulative
energy from national demand/power series and recovers source date/observation
clock. Tests cover date heading loss and nullable Plotly numeric arrays. CELEC
uses per-metric MRIDs, Ecuador civil-day queries, fallback to previous day, and
preserves original timestamps/history. It currently bypasses TLS verification;
that bypass is not imported into GEV.

LIVE CENACE official operational page: certificate-chain verification failed
(curl 60, HTTP 000). No TLS bypass used. LIVE CELEC public `pointValues` endpoint
on port 8443 for the existing public elevation metric returned HTTP 200, JSON
`items` with 24 `loctimestamp`/`valueedit` observations. This verifies one metric
endpoint, not generation, site coordinates or a stable documented public API.
No energy layer added: mapping charts to verified plant coordinates and metric
contracts remains necessary. Concrete next increment: dated official plant
catalog with provenance/coordinates, fixed allowlisted source metric IDs and
units, CENACE source-date parser fixtures and TLS remediation, then CELEC typed
metrics with Ecuador timezone and stale fallbacks. Preserve cumulative MWh;
only comparable monotonic cumulative samples from the same source/plant/day may
produce `(ΔMWh / Δhours)` explicitly labeled **estimated interval average MW**.
Reject resets, missing clocks and mismatched intervals. Never distribute a
national total over individual plants or call cumulative MWh instantaneous MW.

## Verification

Focused deterministic tests cover nullable normalization, units, derived humidity,
future/stale times, newest-per-station deduplication, provider malformed/empty/
failure responses, cache/coalescing/stale cutoff, Ambient opt-in/privacy, disabled
work, late response races, repeated refresh and HTML escaping. LIVE probes are
separate from fixtures and assertions above. Build and architecture/serialization/
translation outcomes are recorded in the implementation handoff. Browser visual
QA remains unavailable: earlier T3 preview Chrome sandbox failure under root and
html_preview exit 1 were reported in the parent session; no service was changed.

## Parent verification after handoff

The local dev server startup exposed a Vite plugin contract bug: returning
`middlewares.use()` caused Vite to execute Connect as a post-install hook without
a request. The hook now returns undefined; a regression test covers both dev
and preview hook installation. Actual Vite startup succeeds on loopback port 4173.
The restarted application's real `/api/weather-stations?cell=ecuador` endpoint
returned schemaVersion=1, stale=false, 24 regional stations. Quito SEQM had an
observation at 2026-10-30T22:00:00Z (17 °C, 3.086664 m/s wind, BKN); rainfall
fields remained null. The eight focused provider/layer tests passed.
