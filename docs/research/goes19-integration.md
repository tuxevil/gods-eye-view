# GOES-19 infrared for Ecuador

Verified LIVE on 2026-10-30, approximately 22:39–22:44 UTC. Source research,
implementation and checks performed directly by the implementation agent; no
background agent was spawned, as explicitly instructed. No energy work, secrets,
AEGIS changes, push, PR or deployment. The pre-existing untracked
`docs/research/ecuador-data-coverage.md` was preserved.

## Primary sources and choice

- [NOAA STAR GOES-19 full disk](https://www.star.nesdis.noaa.gov/GOES/fulldisk.php?sat=G19)
  documents 10-minute full-disk updates and Band 13 clean longwave IR at 10.3 µm.
  This is observed infrared brightness information, not surface rainfall. Its
  JPEG is geostationary imagery and is **not** suitable for stretching onto a
  longitude/latitude rectangle. NOAA describes this web imagery as informational
  and disclaims operational use and guaranteed availability.
- [SSEC RealEarth API documentation](https://realearth.ssec.wisc.edu/doc/api.php)
  documents product metadata, explicit available timestamps and exact timestamped
  product addressing. [SSEC WMS access documentation](https://realearth.ssec.wisc.edu/doc/dataaccess.php)
  explicitly documents `map=<product>.map`, GetCapabilities/GetMap, and separate
  named layers for each available time. It also disclaims ownership and guaranteed
  availability. This is the processing service owner's primary documentation for
  NOAA GOES imagery, not a NOAA-hosted WMS. Attribution identifies both parties.
- [RealEarth product catalog](https://realearth.ssec.wisc.edu/api/products?products=G19-ABI-FD-BAND13&timespan=-3h)
  returned HTTP 200 application/json, 1,677 bytes in the focused probe. ID
  `G19-ABI-FD-BAND13`, raster, projection `epsg:4326`; real scan timestamps such
  as `20261030.222020`. Preserve the **20 seconds**, not an inferred minute grid.
- [LIVE WMS capabilities](https://realearth.ssec.wisc.edu/cgi-bin/mapserv?map=G19-ABI-FD-BAND13.map&service=WMS&version=1.1.1&request=GetCapabilities)
  returned HTTP 200 XML, 178,666 bytes; advertised EPSG:4326, image/png, and
  `G19-ABI-FD-BAND13_20261030_222020` plus historical named layers. Parent extent
  is the service canvas ±180°, ±85°, not a claim of full-disk coverage everywhere.
  Nested leaf LatLonBoundingBox entries contained metre-like values; they are
  deliberately **not** interpreted as degree bounds. The runtime uses the compact
  documented JSON catalog for times and a fixed verified Ecuador display window.
- [nowCOAST capabilities](https://nowcoast.noaa.gov/geoserver/observations/satellite/ows?service=WMS&request=GetCapabilities)
  returned HTTP 200 XML, 45,080 bytes. Its regional GOES footprint has southern
  bound 10.9106°N and excludes Ecuador; that option remains North America. Existing
  global mosaic and default satellite selection are preserved.

## Georeferencing and LIVE image evidence

WMS **1.1.1**, `srs=EPSG:4326`, `bbox=west,south,east,north`, `format=image/png`,
`transparent=true`, explicit `layers=G19-ABI-FD-BAND13_YYYYMMDD_HHMMSS` and empty
styles. Reprojection is performed by MapServer/PROJ at SSEC, not by stretching a
raw geostationary JPEG. No `latest`, `current`, nearest-time or WMS time lookup.

Display crop: west -100°, south -16°, east -60°, north 4°. This includes Ecuador,
Galápagos and surrounding South America within the GOES-East disk. It is a crop
of full-disk observations, not a new regional satellite acquisition. Source
sampling is approximately 2 km at nadir; 4096-pixel detail requests do not imply
new sensor resolution. The upstream SSEC watermark is retained.

Direct exact-layer GetMap for 2026-10-30T22:20:20Z returned HTTP 200 image/png,
412,718 bytes, 1024×512 pixels over that crop. The image was decoded and inspected:
cloud structures, Pacific coast and Andes aligned with the requested geographic
view. Timestamp-only layer guesses (`20261030.222020` or underscored without the
product prefix) returned HTTP 500; only documented full product/time names are
used. An invalid old bare layer likewise failed rather than substituting latest.
The `wms.ssec.wisc.edu` documentation alias returned 503 during the first probe;
the pinned `realearth.ssec.wisc.edu` host worked. No fallback host is inferred.

Actual running Vite middleware, `0.0.0.0:4173`, at 22:43:20 UTC returned HTTP 200:
`unavailable=false`, `stale=false`, 13 frames 20:20:20–22:20:20 UTC, 23-minute
latency, original observation timestamp and separate metadata fetch timestamp.
At approximately 22:43:34 UTC all of these same-origin routes returned image/png:

| Request | HTTP | Pixels | Bytes |
| --- | --- | --- | --- |
| Latest whole crop | 200 | 2048×1024 | 1,332,811 |
| Latest `size=1024x512` | 200 | 1024×512 | 412,718 |
| Latest detail `bbox=-84,-6,-76,-2` | 200 | 4096×2048 | 300,037 |
| History 20:20:20 UTC | 200 | 2048×1024 | 1,456,394 |
| Geographic tile z=4/x=8/y=8 | 200 | 256×256 | 45,386 |

These are instantaneous access results, not availability or latency promises.

## Implementation and activation

`server/providers/goes19.js` pins the catalog/product/map endpoints, validates
calendar-correct explicit scan times and provides geographic GetMap URLs.
`server/providers/weather.js` registers `clouds-goes19` using the existing weather
metadata/image/tile routes and shared bounded acquisition/cache engine.

Enable **Satellite clouds** in Weather, open its card, choose **Ecuador · GOES-19**,
then **View coverage** or navigate to Ecuador. Use **Full** for the complete gray
infrared image; **Clouds only** applies the existing brightness alpha filter, not
a scientific cloud mask. UTC observation/age, source, and “infrared, not rain”
appear in the readout. Shared observed history controls select the actual catalog
frames. North America and Global remain available. Selection persists through
existing layer state with a new product option code `e`; published layer tokens
and existing option codes/defaults are unchanged. Spanish and all other shipped
locales include the new labels.

The existing running dev process picked up this implementation and served the
LIVE routes above. For a later clean start use:

```sh
npm run dev -- --host 0.0.0.0 --port 4173 --strictPort
```

A separate actual Vite startup on `0.0.0.0:4174` reached “ready in 735 ms” and was
stopped after verification; the authorized process on port 4173 was preserved.
Middleware hooks still return undefined; no Connect return value was introduced.
No credentials or environment variables are necessary.

## Bounds, freshness and failure behavior

Reuse: 12-second shared deadline including queue time, 8 upstream slots,
120 coalesced operations/96 pending maximum; no redirects; metadata streaming cap
512 KiB; PNG signature/IHDR dimension validation; whole images ≤16 MiB; tiles
bounded by size. Image cache ≤128 entries/16 MiB, image lifetime ≤24 hours;
30-second failure cooldown with ≤128 failure keys. All origins and map/product
names are code-owned; client URLs/destinations cannot enter upstream requests.
Whole crop 2048×1024 maximum, optional 1024×512; bounded 4096×2048 detail windows
rounded to 0.25° must fit the crop; geographic tiles use existing levels 0–6.

Catalog query is the last 3 hours; ≤512 explicit values accepted, ≤26 allowlisted
frames retained, latest 13 displayed. No cadence expansion or fabricated times.
Metadata refresh 2 minutes; last good metadata may survive an upstream failure
for ≤1 hour and is explicitly stale. Cached exact images can still be served;
uncached images fail when metadata refresh failed. Every image request must use
an allowlisted, canonical timestamp no more than 3 hours old. Unknown and expired
frames fail closed. An exact layer removed between metadata and image requests
produces an image error, never a newer substituted frame.

Fresh metadata with an observation older than 40 minutes is marked stale/delayed;
`fetchedAt` never advances `observedAt`. Latest and history retain their real scan
times. The history clock permits a maximum 40-minute preceding frame gap. This
threshold is a display policy, not a claimed delivery SLA. During a delay the
existing UI can retain imagery with its actual timestamp and explicit status.

## Verification and remaining limits

Focused command (no full suite):

```sh
node --test src/data/weatherProxy.test.mjs src/layers/weather/source.test.mjs src/layers/weather/weather.test.mjs src/layers/weather/shellRendering.test.mjs src/layers/weather/infraredImage.test.mjs src/layers/weather/clock.test.mjs src/data/layerState.test.mjs src/share/viewCodec.test.mjs
```

Result: **275 tests passed, 0 failed**. Covers Ecuador/Galápagos coordinates,
canonical exact time/layer URLs, irregular seconds, bounded history, invalid and
future timestamps, timeout/upstream/WMS error responses, cache behavior, stale
fallback without time advancement, UI selection/provenance/history, both raster
and shell transfer paths, and persistent/share serialization.

`npm run i18n`: all 10 locale catalogs complete (2,726 messages). The command still
exits nonzero for one **pre-existing** unmarked weather-station UI string,
`src/layers/weatherStations/index.js:172`, “Ambient unavailable; METAR available”.
That separate METAR code was left untouched. New catalog strings pass validation.

Architecture, layer-token and build results are recorded below after completion.
Browser end-to-end visual acceptance is pending the parent: no preview tools or
T3 services were changed. Infrared only; visible imagery and energy are deferred.

Final gates: `npm run check:boundaries` **passed** (1,043 modules, 81 portable
entries, all package export groups); `npm run layer-token:check -- --base-ref main`
**passed** (32 published, 1 new); `npm run build` **passed**, 14.36 seconds. Build
retains the existing >1,500 kB chunk warning. `git diff --check` passed. Port 4173
remains bound to **0.0.0.0**; the temporary startup-check port 4174 is closed.
No full-suite result or browser acceptance is claimed.
