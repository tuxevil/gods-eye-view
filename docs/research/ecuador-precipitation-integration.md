# Ecuador satellite precipitation integration

Implemented in the existing `feat/ecuador-weather-integrations` working tree on
2026-10-30 Ecuador time / 2026-10-31 UTC. Research follows the `research` skill's
primary-source workflow; this implementation delegate performs the work directly,
as requested, without additional agents. No commit, push, PR, public deployment,
AEGIS edit, credentials, arbitrary proxies or TLS bypass.

## Delivered and activation

Enable **Rain radar**, open its Weather card, select **Ecuador · IMERG**, and
choose **View coverage** or navigate to Ecuador. The existing US radar default
and published `weather-radar` layer token `v` remain unchanged. The selected
product is clearly headed **SATELLITE ESTIMATE · IMERG · mm/h**. GOES infrared
remains a separate cloud product, never called precipitation.

The map shows NASA GIBS IMERG **30-minute mean precipitation rate**, in mm/h,
with 13 actual half-hour frames (six hours between first and last). The shared
weather timeline steps/playbacks those frames. Each displayed frame has an
explicit ISO UTC period start/end, year included. Selection requires an exact
frame match (zero nearest-frame gap); other products' unmatched history targets
hide precipitation rather than borrowing/interpolating a rainfall frame.

For accumulation, center the map on an Ecuador location and choose **Sample map
center** in the same card. This independently requests a **90-day daily IMERG
archive via NASA POWER**, displaying a UTC calendar day's accumulated mm, exact
start/end, sampled coordinates, archive provenance and fetch time. **Previous
day / Next day / Latest available day / Latest day** browse the returned archive.
The seven-day sum is shown only when seven consecutive daily totals are known;
otherwise it is unknown. This is a sampled native-grid estimate, **not a polygon
or watershed total, station measurement, or an accumulation raster**. Query
coordinates are rounded to 0.1° for bounded cache reuse; POWER echoes the query
location, not necessarily the native pixel center. Native IMERG sampling is
approximately 11 km at the equator; display pixels do not increase resolution.

Daily controls are deliberately separate from the half-hour map clock: a daily
value is never presented as corresponding to a current map rate frame. Sampling
is explicit, not automatic camera polling. Sampling outside 93°W–74°W,
6°S–2°N is rejected; the map's larger crop includes Ecuador/Galápagos and context.
Daily sample/date and timeline state are transient. Product/opacity persist in
stored state and both long-form and binary shared links. Existing links retain
radar as the frozen meaning of an absent product option.

## Official sources, access and semantics

- [NASA GIBS API documentation](https://nasa-gibs.github.io/gibs-api-docs/access-basics/)
  documents public WMS/WMTS service access. The runtime uses the fixed official
  `gibs.earthdata.nasa.gov` host, no authentication. WMS 1.1.1 GetMap requests
  explicitly use EPSG:4326 and west,south,east,north bounds. Source reprojection
  establishes georeferencing; a raw satellite JPEG is never stretched onto Earth.
- [GIBS geographic WMTS capabilities](https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/1.0.0/WMTSCapabilities.xml)
  advertises `IMERG_Precipitation_Rate_30min`, PNG, a 2km tile matrix (browse
  grid, **not sensor resolution**), global geographic bounds and PT30M temporal
  intervals with explicit gaps. Its advertised Domains resource is used at
  runtime: [compact time domains](https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/1.0.0/IMERG_Precipitation_Rate_30min/default/2km/all/all.xml).
  Only the recent tail of those exact advertised intervals is enumerated;
  there is no cadence guessed from wall-clock time and no cross-gap expansion.
- [NASA Worldview's maintained 30-minute product description](https://github.com/nasa-gibs/worldview/blob/main/config/default/common/config/metadata/layers/multi-mission/imerg/IMERG_Precipitation_Rate_30min.md)
  defines rain/snow rates in mm/h, 0.1° grid, approximately five-hour browse
  delay, Early Run first and later replacement by Final. Runtime provenance
  says **Early/Final V07 best available**; the browse service does not expose
  the processing edition of each particular frame. Do not label all frames
  Final, Late, instantaneous rate, or ground observations.
- [NASA's daily GIBS description](https://github.com/nasa-gibs/worldview/blob/main/config/default/common/config/metadata/layers/multi-mission/imerg/IMERG_Precipitation_Rate.md)
  explicitly calls its daily imagery a custom PPS product derived from half-hour
  inputs, still in mm/h, without a directly corresponding daily science product.
  Therefore `IMERG_Precipitation_Rate` **is not integrated as daily accumulation**.
  Multiplying that PNG by 24 or summing color bins would be unsupported.
- [NASA POWER's IMERG source/parameter documentation](https://power.larc.nasa.gov/docs/methodology/data/sources_meteorology/#imerg)
  documents `IMERG_PRECTOT`, daily sum from half-hourly IMERG, daily UTC only,
  Late Run near-real-time joined to Final in the archive. The response says
  `mm/day`; this implementation labels each complete day's integrated amount
  in **mm**, preserving the day boundary. Source documentation lists ~14-hour
  Late and ~3.5-month Final latency, but those are **not observed availability
  guarantees**. Per-day processing run is not in the returned point payload.
- [POWER daily API](https://power.larc.nasa.gov/docs/services/api/temporal/daily/)
  documents point requests, parameters, JSON and explicit `time-standard=UTC`;
  default local-solar-time is deliberately overridden. Fixed parameter
  `IMERG_PRECTOT`, community AG, last 90 completed UTC days only. No key or login
  is used. This is IMERG, not POWER's MERRA-2 precipitation parameter.
- [NASA GIBS color map v1.3](https://gibs.earthdata.nasa.gov/colormaps/v1.3/GPM_Precipitation_Rate.xml)
  defines distinct rain/snow palettes and transparent no-data **and** insignificant
  (<0.1 mm/h) classes. The UI uses representative source colors at 0.2/1/5/20
  mm/h for each palette. Transparent pixels cannot distinguish missing from
  insignificant precipitation; they are never treated as zero or dry weather.
- [NASA IMERG documentation](https://gpm.nasa.gov/data/imerg) explains the
  multi-satellite estimate. [NASA Disasters' IMERG guidance](https://science.data.nasa.gov/disasters/data-gallery/gpm-imerg-precipitation)
  describes relief/coastal/convective biases and cautions against replacing
  local gauge/radar measurements with satellite estimates. Its daily accumulation
  gallery is a distinct Giovanni-derived product; it is not the GIBS rate PNG.
  No confirmed flood detection, flood forecast or alert is produced here.

## Use rights and attribution

[NASA science data licensing policy](https://science.data.nasa.gov/about/license)
states that NASA-led mission data without a restrictive notice are CC0 and
encourages original-source citation. [GIBS use guidance](https://nasa-gibs.github.io/gibs-api-docs/)
asks clients to acknowledge its imagery and ESDIS. [NASA's POWER support guidance](https://forum.earthdata.nasa.gov/viewtopic.php?t=82)
permits research/publication/commercial use with acknowledgment. No restrictive
notice was present in the inspected product metadata. This is data-use guidance,
not a claim that the application's MIT license owns NASA data or logos.

Acknowledgment: We acknowledge the use of imagery provided by services from
NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data
and Information System (ESDIS). Daily IMERG data are provided through NASA POWER.
GPM/PPS, GIBS/ESDIS and POWER attribution is present in the card and the canonical
Data attribution popover; globe imagery also carries a Cesium credit.

## LIVE evidence (distinct from fixtures)

Direct HTTPS access and actual running Vite middleware probes performed around
02:59–03:06 UTC, 2026-10-31 (evening of October 30 in Ecuador):

- Official full WMS capabilities: HTTP 200, ~2.58 MB; layer filtering did not
  reduce this response. **Not used at runtime** because the compact advertised
  Domains XML is approximately 0.5 KB and fits existing bounded metadata reads.
  Compact Domains: HTTP 200, half-hour archive beginning 1998-01-01 with real
  gaps, latest end 2026-10-30T21:30:00Z. The daily custom browse archive separately
  began 2000-06-01. Neither full archive is exposed unbounded in this UI.
- Actual `/api/weather/manifest?product=precipitation-imerg`: HTTP 200,
  unavailable=false, stale=false; 13 frames 2026-10-30T15:30:00.000Z through
  21:30:00.000Z; lag ~329–335 minutes. Latest period ends 22:00Z. These are source
  timestamps, not fetch times and not claims of current rainfall.
- Actual `/api/weather/image?product=precipitation-imerg&time=2026-10-30T21%3A30%3A00.000Z&size=1024x512`:
  HTTP 200 image/png, 1024×512. Decoded and visually inspected: nonblank green,
  yellow and red precipitation patterns, transparency preserved. Inspection
  confirms useful imagery, not independent validation of rainfall or coast
  alignment; georeferencing comes from the official WMS contract.
- Actual `/api/weather/accumulation?lat=-2&lon=-79`: HTTP 200; 90 UTC days,
  2026-08-02 through 2026-10-30; 46 missing recent days, last available day
  **2026-09-14**, 0.33 mm. Nonzero values also included September 10 (0.08 mm)
  and 11 (0.03 mm); source zeros were preserved. October 30 remained null.
  This is a concrete current upstream lag, not an app rounding/caching issue.
- Independent direct POWER probe at -2°, -78.97°, October 20–29: all fill -999;
  October 20–27 **2025** returned real nonzero historic daily values (e.g.
  October 26: 19.14 mm). Historical access works; recent availability cannot
  be promised from the documentation's nominal latency.

The prior Vite process ceased listening during checks for an undetermined reason.
Only this project was restarted on the authorized **0.0.0.0:4173**; actual startup
reported **Vite 6.4.4 ready in 941 ms**. No alternate-port or other service started.
The current middleware probes were repeated against that process. Browser visual
QA is not claimed; no preview/browser/configuration changes were made.

## Alternatives and concrete remaining limits

Official GES DISC/PPS science-file downloads require authorized accounts for the
usual IMERG access paths; no such authorization/credentials were available and
none were harvested. They are not a mandatory dependency of this integration.
A scientifically supported recent accumulation raster would need authorized
numeric downloads or a verified public georeferenced accumulation service.

[NOAA's public GHE/Enterprise Rain Rate catalog](https://registry.opendata.aws/noaa-ghe/)
documents public use, legacy GHE retirement, and replacement Enterprise Rain Rate.
LIVE anonymous S3 listing of its documented replacement bucket returned HTTP 200
with G19, G18, G16 and BLEND prefixes; BLEND advertised only
`RainRate-Blend-INST/`. Legacy GHE listing returned navigation NetCDF files
(~385 MB uncompressed, ~170 MB compressed). No small, documented current Ecuador
accumulation WMS with exact temporal semantics was established in this bounded
research. It would require a separate numeric/geolocation ingestion adapter;
legacy screenshots or arbitrarily georeferenced rasters are not substituted.
The NOAA OSPO historical documentation URL redirected; the lowercase destination
was inaccessible (403) in the web probe. This is not evidence that all NOAA
precipitation is inaccessible.

**Pending:** near-real-time accumulation raster / arbitrary storm-total polygons,
history outside the selected 90-day cell window, browser visual QA, and any future
watershed increment. None is represented as delivered. Current delivered scope
is real recent rate imagery plus real nullable historical cell accumulations.

## Implementation and operational bounds

- `server/providers/imerg.js`: fixed NASA endpoints, strict interval/calendar
  parser, Ecuador crop, EPSG:4326 map URLs, daily point/date/unit normalization.
- `server/providers/weather.js`: registers `precipitation-imerg` and
  `/api/weather/accumulation` in the existing dev/preview middleware. Reuses the
  existing deadline, queue, fetch, PNG validation and cache; no raster engine fork.
- `src/layers/weather/source.js`: allowlisted product/image sizes and validated
  rate-period/daily contracts, abortable daily reads. `index.js`: product controls,
  exact map time, legend, lazy cell archive, nullable daily/seven-day totals,
  independent daily navigation, cancellation and stale/failure visibility.
- Existing `rendering.js` and `shellRendering.js`: credit, raster order and shell
  height; precipitation pixels bypass cloud brightness filters. `weatherPanel.js`
  preserves a zero maximum-gap policy. Locale additions cover all ten shipped
  locales. `layerState.js` / `share/viewCodec.js` freeze the absent radar default;
  no new layer token or voice instruction text was introduced for precipitation.
- `DATA_SOURCES.md` and `dataCredits.js`: canonical source/rights/attribution.

Shared acquisition bounds: 12-second deadline including queue, eight total
upstream slots, 120 operations/96 queued, fixed upstreams/no redirects, 512 KiB
metadata/JSON cap. Daily work additionally allows two distinct concurrent cells,
16 cache/attempt keys, one-hour successful cache, 60-second failure cooldown and
24-hour stale fallback without advancing fetch/day timestamps. Requests are
single-flight per cell. Daily source body cap 64 KiB on the client; dates/units,
coordinates and nulls are validated. No daily work occurs without explicit
sampling on the enabled product; disable/product change aborts pending sampling
and ignores late results. A retained older sample keeps its original coordinates,
dates and fetch time on failure, with visible error status.

Raster bounds remain shared: PNG signature/IHDR size validation; 16 MiB image
maximum, 128-entry/16 MiB cache, 30-second bounded failure cooldown, 24-hour frame
age limit. Whole extent 2048×1024 (optional 1024×512); detail windows up to
4096×2048 within the crop; geographic tiles levels 0–6. Metadata TTL two minutes,
up to one hour marked-stale last-good fallback. At most 26 source frames are
allowlisted, 13 shown. Cached exact images remain available during metadata
failure; uncached images fail. Lag exceeding eight hours is displayed delayed;
that is a UI policy, not a source SLA. Fetched time never advances a source frame.

## Checks performed directly in this increment

Focused test command (no full suite):

```sh
node --test server/providers/imerg.test.mjs server/providers/igepnGeophysics.test.mjs src/layers/igepnGeophysics/igepnGeophysics.test.mjs src/layers/weather/source.test.mjs src/layers/weather/weather.test.mjs src/data/weatherProxy.test.mjs src/data/layerState.test.mjs src/layers/weather/shellRendering.test.mjs src/layers/weather/clock.test.mjs src/ui/weatherPanel.test.mjs src/data/dataCredits.test.mjs src/share/viewCodec.test.mjs src/voice/actionSchemas.test.mjs
```

**325 passed, zero failed.** Additional `src/voice/pointAndAsk.test.mjs`:
**12 passed**, including the complete prompt's 52,000-character ceiling. No
precipitation changes were made to the voice manifest/instructions. Initial
focused failures exposed an expected shell/product descriptor update and a
missing frozen absent radar-product meaning in the binary share codec. Those
were corrected; existing aircraft-link length and all old share vectors pass.

Coverage includes strict advertised intervals/gaps/calendar dates, rate vs daily
accumulation semantics, period bounds, Ecuador/Galápagos crop, WMS lon/lat order,
nullable fill vs actual zero, source/coordinate validation, single-flight/cache,
stale upstream failures preserving timestamps, disabled/late-sample lifecycle,
seven-day completeness, exact map history, globe tiles and shell pixels without
infrared filtering, persistent/binary sharing and attribution.

- `npm run check:boundaries`: passed, 1,056 modules / 84 portable entries and all
  package boundary builds.
- `npm run layer-token:check -- --base-ref main`: passed, 32 published / four new
  in the overall branch (precipitation itself adds **no new layer token**).
- `npm run i18n`: passed, all ten locales complete, 2,774 messages.
- `npm run build`: passed after the final code change, 15.50 seconds; existing
  large-chunk warning remains.
- `git diff --check`: passed. Edited code was formatted with local Prettier.

Additional actual middleware image probes: historical frame **15:30Z**, HTTP 200,
1024×512 PNG, 25,612 bytes; latest **21:30Z** PNG was 35,557 bytes; geographic
z=4/x=8/y=8 tile HTTP 200, 256×256 PNG, 4,712 bytes. The running service remains
listening at 0.0.0.0:4173 after the final build. These probes verify source access,
not the scientific accuracy of estimated rainfall. Deterministic tests use
fixtures and are not described as LIVE source validation.

IGEPN documentation review is in `igepn-geophysics-integration.md`. Its provider
and layer tests were included above; earlier full-suite/live counts remain
explicitly historical. All existing IGEPN/SNGR/energy/METAR/GOES changes and the
untracked `ecuador-data-coverage.md` were preserved. No commit was created.
