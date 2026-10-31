# First watershed context layer: Paute vicinity

Investigation and live access: 2026-10-31. Branch:
`feat/ecuador-weather-integrations`. This is geographic context. It does not
estimate reservoir inflows, power availability, blackout risk, basin rainfall,
or upstream contribution from station containment or GOES/IMERG PNG colors.

## Source investigation and distribution decision

- Ecuador's [official geoservice directory](https://iedg.presidencia.gob.ec/servicios/geoservicios/)
  provides institutional discovery, but publication of a WMS image alone does
  not supply inspectable drainage geometry or redistribution permission.
- The public [Unidad Hidrográfica Nivel 5 FeatureServer](https://services7.arcgis.com/rxsqAG0ztOQO48WN/ArcGIS/rest/services/Unidad_Hidrogr%C3%A1fica_Nivel_5/FeatureServer?f=pjson)
  returned metadata describing November 2022 Pfafstetter units, attributed to
  Ministerio del Ambiente y Energía, projected in EPSG:32717. Its
  [ArcGIS item metadata](https://www.arcgis.com/sharing/rest/content/items/5c24bfc422e84d1aacc8c988a0a768b6?f=json)
  identifies owner `rvalle_edu_esri_co`. The terms permit several uses with
  attribution but do not establish unrestricted redistribution, and the owner
  does not independently establish an official institutional publication.
  No geometry was imported from this service. No administrative polygons are
  used as catchments.
- [HydroBASINS](https://www.hydrosheds.org/products/hydrobasins) is the producer's
  drainage-unit product. Its current linked
  [HydroSHEDS license, Appendix A](https://data.hydrosheds.org/file/technical-documentation/HydroSHEDS_TechDoc_v1_4.pdf)
  includes distribution restrictions. The standard level-7 South America
  download was accessible and examined, but was **not imported**. Level 7 also
  grouped the Paute vicinity with a larger 11,118.8 km² unit, too coarse for
  the first useful display. No blanket CC license was assumed for HydroBASINS.
- Chosen alternative: the producer's [HydroATLAS/BasinATLAS](https://www.hydrosheds.org/hydroatlas)
  explicitly distributes its database under **CC BY 4.0**. The authors'
  [Figshare API release metadata](https://api.figshare.com/v2/articles/9890531)
  independently identifies the same license and original download. The release
  contains the drainage geometries used here, with enriched attributes.
  Attribution, license link and modifications are included in Data Credits,
  DATA_SOURCES.md, the bundled README and the GeoJSON provenance. CC BY permits
  sharing/adaptation with attribution and change indication; the dataset is
  not covered by the project's MIT code license. No endorsement is claimed.

Citation: Linke, S. et al. (2019), Global hydro-environmental sub-basin and river
reach characteristics at high spatial resolution, *Scientific Data* 6:283,
[doi:10.1038/s41597-019-0300-6](https://doi.org/10.1038/s41597-019-0300-6).
Release: [HydroATLAS v1.0](https://doi.org/10.6084/m9.figshare.9890531.v1).
Technical reference: [HydroATLAS v1.0 documentation](https://data.hydrosheds.org/file/technical-documentation/HydroATLAS_TechDoc_v10.pdf).

## Actual acquisition and exact provenance

Official archive: `BasinATLAS_Data_v10_shp.zip`, file ID `20087237`.

- Original link: `https://ndownloader.figshare.com/files/20087237`.
- Successful official API download: `https://api.figshare.com/v2/file/download/20087237`.
- The public `figshare.com/ndownloader/files/20087237` frontend returned HTTP 202
  with a WAF challenge. The API file-download endpoint worked with HTTPS and
  HTTP byte ranges; no proxy, credential, TLS bypass or WAF workaround was used.
- Archive size from release metadata: 4,276,492,333 bytes. Published archive MD5:
  `ce5013294bdcb6f884ff6cdf1a1acae0`. **The full archive MD5 was not independently
  recomputed**: only required ZIP member ranges were downloaded.
- ZIP central directory was fetched using bytes `4276392333-4276492332`.
  Level-8 `.shp`, `.dbf`, `.prj`, `.shx` member ranges returned HTTP 206. Every
  decompressed member passed its ZIP CRC32 and size check. Level 7 was examined
  separately; only level-8 originals feed the extraction script.
- Product release metadata date: **2019-12-07**. This is a static release date,
  not a live observation date or a claim that terrain is current. HydroBASINS
  v1c underlies the geometry. Access/extraction: **2026-10-31**.

SHA-256 of `BasinATLAS_v10_lev08` input members:

| Member | SHA-256 |
| --- | --- |
| `.shp` | `bcb58c63b2aee54b3fd772acabb929648f879f000235e122a72376fb9eb5046b` |
| `.dbf` | `5d5bd719701fd5a4ec597a6e936321212fbe5d168c16f1a308d0d176a3c86b1d` |
| `.prj` | `a02a27b1d1982c8516d83398e85a3c8b1aef1713c13ef4d84d7bde17430c07c4` |
| `.shx` | `0eb50b6478df955f24151ef8aa725cfe5c9029f7ea34f157d923739514a94a73` |

The projection file is geographic WGS84, degrees, Greenwich meridian. GeoJSON
uses longitude, latitude (EPSG:4326 semantics); no UTM coordinates were passed
to Cesium. Source geometry is derived from a 15 arc-second grid, approximately
500 m at the equator. **Pfafstetter level 8 is a hierarchy level, not a map
scale or survey accuracy.**

Reproduce after extracting the verified official level-8 members, with Python
`pyshp` and `shapely` installed in an isolated environment:

```sh
python scripts/extract-paute-watersheds.py \
  /path/to/BasinATLAS_v10_lev08.shp \
  src/layers/watersheds/data/paute-units.geojson
```

The script verifies all input SHA-256 hashes. It selects seven exact original
IDs, converts ring structure to GeoJSON, retains multipart/holes, and adds
interior representative points for cards. No simplification, coordinate
rounding, clipping, dissolve, reprojection or drainage reconstruction is used.
Unused environmental attributes are omitted. All seven source geometries pass
Shapely validity checks. Result: **7 features, 1,220 vertices, 52,892 bytes**.
Bundled GeoJSON SHA-256:
`7c3981a7a95277153f3cc359c35e5f336d64f5b94b756d3ddf8d6c9cae4737b7`.

## Spatial extent and naming limits

The source does not name these units Paute, Mazar or Amaluza. Display names are
therefore `BasinATLAS <HYBAS_ID>`, with source IDs and level, never invented
named drainage boundaries. These seven units have source `NEXT_DOWN` chains
converging on `6080270370`, a small unit near the Paute confluence. That bounds
a useful vicinity, **not a verified Mazar/Amaluza reservoir catchment or a claim
of a complete officially named Paute basin**. Runtime does not route flows.

| HYBAS_ID | Source SUB_AREA (km²) |
| --- | ---: |
| 6080269960 | 2192.0 |
| 6080270180 | 789.5 |
| 6080270370 | 9.5 |
| 6080273270 | 1624.4 |
| 6080273280 | 951.3 |
| 6080274470 | 410.7 |
| 6080274660 | 468.7 |

Cards use **SUB_AREA**, the unit's local area. `UP_AREA` is retained only as
`sourceUpstreamAreaKm2` metadata; it is not substituted for polygon area or a
newly computed hydrological result. Units are not unioned into a named basin.

Actual independent point checks against the downloaded geometry:

| Existing catalog point | Longitude, latitude | Geometric result |
| --- | --- | --- |
| Mazar plant catalog | -78.6231, -2.5969 | within 6080269960 |
| Paute-Molino plant catalog | -78.5572, -2.5767 | within 6080269960 |
| Sopladora plant catalog | -78.4739, -2.6006 | within 6080269960 |
| Quito airport reference | -78.354, -0.124 | outside all seven |
| Coca Codo, Minas San Francisco, Delsitanisagua, Agoyán, San Francisco catalog points | existing energy catalog | outside all seven |

These checks prove coordinates/geometry alignment, **not coordinate accuracy,
reservoir position or hydraulic contribution**. Existing energy records have
plant catalog points with no independent coordinate verification flag and no
separate verified reservoir geometry. Their UI membership is consequently
**unknown**, even where the mathematical containment test succeeds. Original
`basin` relationships for the Paute Integral catalog records appear separately
as catalog context with unverified coordinates. No plant point becomes a
reservoir point. Missing reservoir locations remain explicitly unavailable.

## Implementation and activation

The new `src/layers/watersheds/` family has a portable geometry/model/source seam
and a controller that owns Cesium resources and one independent selection.
Source construction is inert. The bundled asset is read once on activation,
validated (64 features / 60,000 vertices / 2 MB maximum), then cached. The source
URL is a fixed bundled module-relative asset, rewritten by Vite for builds.
There is no new server proxy, upstream polling or duplicate weather engine.

The manager's 30-second update reads already loaded optional point snapshots
for the selected card; it does not refetch the static dataset. Optional sources
stay off until the user enables them. `off`, `not-loaded`, `unavailable` and
loaded membership states remain distinct. Missing or explicitly unverified
coordinates are unknown, not outside. Polygon and hole boundaries are included;
shared edges may belong to both adjacent units. The geometric helper unwraps
longitudes for small units crossing the antimeridian. Rendering supports
Polygon/MultiPolygon hierarchy and hole outlines.

- **English:** Data Layers → Weather → **Watershed units**. Navigate to the Paute
  vicinity (for example longitude -78.62, latitude -2.60), then click a polygon.
  Cyan outlines/translucent fill become yellow for the selected unit. Click
  that unit again to deselect, or turn the layer off. The row carries a legend,
  source/license and feature count; the selected world card carries source ID,
  local area, release date, grid resolution/level and provenance.
- **Español:** Capas de datos → Clima → **Unidades hidrográficas** (the Weather
  group translation is `Clima`). Navigate to the same Paute vicinity; pulse
  un polígono. Pulse de nuevo la unidad seleccionada para deseleccionar.
- Enable **Weather stations / Estaciones meteorológicas** separately to classify
  already loaded station observations. Airport coverage can be sparse; no
  missing rainfall or coordinates are filled in.
- Enable **Ecuador hydro & grid / Hidroeléctricas y red de Ecuador** separately
  for existing energy records and documented catalog relations. No provider
  is fetched just because a basin was selected.
- GOES19 and IMERG remain under the existing weather satellite/radar controls.
  Changing weather products, selecting a station or plant, or refreshing the
  selected unit's loaded membership does not clear the watershed selection.
  The layer owns its own world-overlay source and pick owner.

`sourceComposition`, the application catalog and standalone defaults register
`watersheds`. The share ledger reserves **00**, the next free token; existing
assignments/options remain unchanged. Shares restore enabled state, not an
individual basin selection. Tools receive the generated toggle enum and the
existing analyst query accepts `watersheds` and `areaKm2`; records expose source
provenance and geographic-only labeling. Analyst coordinates are interior label
anchors, not reservoir positions or polygon geometry. The new alias `cuencas`
is accepted without adding unnecessary prompt hints. Realtime prompt: **51,995
characters**, under the unchanged 52,000 ceiling.

## Verification and operational state

- Focused geometry/source/controller tests cover inside/outside, holes,
  multipart, outer/hole boundaries, antimeridian, missing/unverified coordinates,
  loaded grouping, provenance validation and byte/feature limits, source failure
  and retry, abort/discard on disable, independent selection, cached refresh,
  no work while off, repeated enables without duplicate entities, cleanup and
  immutable-token serialization.
- Existing adjacent catalog/source-composition, layer-state/ledger, share codec,
  analyst, voice schema/prompt, first-run and weather-station/energy tests were
  run: **262 tests passed**. Voice schema digest/length pins were deliberately updated for the
  generated watershed enum/analyst field addition, preserving legacy arguments.
- UI contracts for layer panel, weather panel, voice manifest and Data Credits
  passed: **35 tests**. All locale catalogs passed `node scripts/i18n.mjs`;
  new messages are translated in every supported locale, including Spanish.
- `npm run check:boundaries` passed both import-direction and package ownership
  checks. New modules use the existing application/standalone ownership groups.
- `npm run layer-token:check -- --base-ref main` passed: 32 published, 5 new
  assignments, including the preserved existing uncommitted integrations.
- `npm run build` passed. Vite reported its existing large-chunk advisory; the
  new GeoJSON appears as a separate approximately 52.89 KB asset.
- `git diff --check` passed. No full unit suite or browser was run.
- The authorized `0.0.0.0:4173` server was not listening at the local endpoint
  check, so it was started with `npm run dev -- --host 0.0.0.0 --port 4173`.
  No service configuration changed and no second service was introduced.
  `GET http://127.0.0.1:4173/src/layers/watersheds/data/paute-units.geojson`
  succeeded; its SHA-256 matches the bundled hash above. The source module also
  served through Vite. Upstream archive-member acquisition and this local
  endpoint check are real requests, not fixture results.
- Visual browser QA remains unperformed under the task's stated root sandbox
  limitation. Real Cesium entity/hierarchy tests, real source geometry and
  endpoint checks do not establish visual legibility on a particular screen.
  The card explicitly wraps long text to 64 characters because the existing
  canvas host does not wrap automatically.

The sizeable pre-existing IGEPN/IMERG work, untracked research notes and the
weather.css heading/timestamp fix were retained. No commit, push, PR, public
deployment or `/root/aegis` edit was made. The server remains on the authorized
binding for parent/user inspection.

## Pending scope

Countrywide basin coverage; authoritative named Paute boundary identification;
verified independent plant/reservoir coordinates or reservoir polygons;
additional official MAATE/INAMHI datasets with confirmed institutional ownership
and redistribution terms; quantitative raster sampling or basin precipitation
aggregation; flow routing, rainfall–runoff calibration, travel times and storage /
power/blackout modeling. These require additional source evidence and separate
implementation. Shared views currently store layer visibility, not the selected
unit ID. Optional-source card membership refreshes on the existing 30-second
watershed update cadence and immediately when the unit is selected again.


## Files changed for this delivery

New: `src/layers/watersheds/{index,source,model,geometry}.js`,
`src/layers/watersheds/watersheds.test.mjs`,
`src/layers/watersheds/data/{paute-units.geojson,README.md}`,
`scripts/extract-paute-watersheds.py`, and this research note.

Wiring: `src/app/{constructCatalog,sourceComposition}.js`,
`src/standalone/layerSources.js`, `scripts/package-boundaries.json`,
`src/data/layerState.js`, `src/data/layerStateTokenReservations.json`,
`src/ui/{layerNames,layerPanel}.js`, `src/voice/layerManifest.js`.

Loaded-record seams: `src/layers/weatherStations/index.js` and
`src/layers/ecuadorEnergy/index.js`. Attribution/localization: `DATA_SOURCES.md`,
`src/data/dataCredits.js`, every locale JSON catalog. Updated focused contracts:
`src/app/{constructCatalog,sourceComposition}.test.mjs`,
`src/data/{layerState,layerStateTokenLedger}.test.mjs`,
`src/voice/actionSchemas.test.mjs`, `src/firstRunExperience.test.mjs` and
`src/layers/weatherStations/weatherStations.test.mjs`. These shared files also
contain preserved work from the existing integrations; the overall working-tree
diff should not be mistaken for watershed-only changes.
