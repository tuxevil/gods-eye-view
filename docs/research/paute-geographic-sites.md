# Paute physical sites — 2026-10-31

## Delivered and unresolved

This increment separates ten physical asset identities from the existing eight
CENACE generating plants. Only **two** physical locations meet the evidence bar:
Sopladora's access portal and discharge. **It does not deliver verified Mazar or
Amaluza dam coordinates or powerhouse coordinates.** Those locations and both
reservoir surfaces remain unknown; no guessed centroids, polygon, hydraulic
routing, upstream catchment or inferred generation/risk is supplied.

The three old Paute plant coordinates were uncited and conflated different
assets. They are now null and not plotted. Their plant IDs, CENACE labels,
CELEC MRIDs, measurements, dates, units and thresholds remain in the snapshot
and analyst records. The five unrelated plants retain their legacy approximate
points, explicitly unverified and excluded from containment. This means the
Mazar/Molino/Sopladora plant telemetry currently has no map anchor: restoring
those plant cards requires evidence for their actual physical locations.

## Primary evidence and conversion

Official documents were downloaded with normal verified HTTPS, without a proxy,
credentials or TLS overrides. PDFs were read locally with pypdf; original files
and investigation/check logs are in `/tmp/paute-research` (temporary evidence,
not application assets). Web search access and direct downloads are real source
access; unit fixtures are not LIVE telemetry evidence.

1. [CELEC SUR, July 2024 slope/access-road terms of reference](https://www.celec.gob.ec/celecsur/wp-content/uploads/2024/07/Pliego-CONVOCATORIA-PUBLICA-OBRAS-DE-ESTABILIZACION-DE-TALUDES_24072024.pdf),
   **PDF page 4, §1.1, Figure 1**. Explicit UTM WGS84 zone 17S;
   coordinates are easting then northing. Ecuador punctuation denotes thousands:
   `783.726 / 9ꞌ712.929` = **783726 / 9712929 metres**, not decimal degrees.
   The text names the access portal separately from the powerhouse and names
   the discharge separately. Integer metres are reporting resolution; no
   positional accuracy is stated.
   SHA256 `11b2ecdb1712795649f17a8dfab8089beaee1f1aa3fd5f029ac28c9d8bd0986e`.
2. [CELEC, December 2025 Mazar floating-PV interconnection report](https://www.celec.gob.ec/celecsur/wp-content/uploads/2026/01/ANEXO-4-Informe-Tecnico-Interconexion-PGF-Mazar-Flotante.pdf),
   **PDF page 6, Figure 4.1**. Names the Mazar dam and reservoir reach;
   figure gives dam reference latitude −2.596, longitude −78.623001.
   Datum is not stated with the figure, and latitude resolution is only 0.001°.
   This is retained as a source note, **not verified WGS84** or a powerhouse point.
   SHA256 `8619794a587f9609ed30d13831fc9f8e283dcae5dd4116f85e247d7a90469d8e`.
3. [CELEC SUR Molino technical page](https://www.celec.gob.ec/celecsur/informacion-tecnica/central-hidroelectrica-paute-molino/),
   sections EMBALSE AMALUZA and PRESA Y TÚNELES: Daniel Palacios dam forms
   Amaluza reservoir; its water supplies Molino through conveyance works.
   These relationships do not establish an exact geographic point.
4. [CELEC SUR Sopladora technical page](https://www.celec.gob.ec/celecsur/informacion-tecnica/central-hidroelectrica-paute-sopladora/),
   introduction, §2.1 and §4: Molino discharge supplies Sopladora through an
   interconnection chamber. Chamber operating levels are around 1,314 m;
   the underground generating cavern is separate. The reported CELEC level
   is labeled interconnection-chamber elevation, not reservoir elevation or
   hydraulic pressure head. Exact gauge position remains unverified.
5. [PROJ UTM documentation](https://proj.org/en/stable/operations/projections/utm.html):
   inverse projection with southern hemisphere explicitly set. Conversion used
   `pyproj.Transformer.from_crs(32717, 4326, always_xy=True)`; input `(E,N)` metres,
   output `(longitude,latitude)` degrees. EPSG:32717 is WGS84/UTM17S;
   EPSG:4326 output is explicitly ordered for GeoJSON/Cesium. No datum shift,
   no northern-hemisphere interpretation, no PSAD56 assumption. Code stores
   the reviewed transform and raw coordinates, avoiding a new runtime GIS dependency.

| Stable site ID | Role | Source E / N (m) | WGS84 lon / lat | Verified |
|---|---|---|---|---|
| sopladora-access-portal | Access portal, not cavern | 783726 / 9712929 | −78.448473 / −2.594615 | Yes |
| sopladora-discharge | Discharge to Paute | 785159 / 9711931 | −78.435576 / −2.603609 | Yes |
| mazar-dam | Dam | Datum missing | Unknown | No |
| mazar-reservoir | Reservoir surface | No official polygon obtained | Unknown | No |
| mazar-powerhouse | Powerhouse | No identity+CRS table obtained | Unknown | No |
| amaluza-dam | Daniel Palacios dam | No identity+CRS table obtained | Unknown | No |
| amaluza-reservoir | Reservoir surface | No official polygon obtained | Unknown | No |
| molino-powerhouse | Powerhouse | No identity+CRS table obtained | Unknown | No |
| sopladora-interconnection | Interconnection chamber | No identity+CRS table obtained | Unknown | No |
| sopladora-powerhouse | Underground powerhouse | Portal does not locate cavern | Unknown | No |

Unrounded PROJ outputs respectively: `(-78.44847290631314,-2.5946148580682897)`
and `(-78.43557648525248,-2.603608594731762)`. Catalog output rounds to six decimal
places (~0.1 m resolution), without claiming sub-metre survey accuracy.
Both have negative latitude/longitude and lie within Ecuador and the Paute
corridor. Research also found university sampling tables and inconsistent
secondary locations; none was promoted into a verified dam or cavern coordinate.
A transmission-substation or monitoring-station point cannot locate a powerhouse.

## Spatial and application contracts

- Existing `paute-units.geojson` and its seven unsimplified BasinATLAS level-8
  units remain unchanged. Both verified sites fall in **6080269960** using the
  existing point-in-polygon implementation. This identifies local-unit
  containment only, not official named Paute boundaries, reservoir catchments,
  all upstream drainage, or hydraulic contribution.
- No generation, elevation or flow value is copied onto a portal/discharge record.
  Generating plants remain the only top-level analyst energy records and the
  plant count stays eight; geographic sites are nested for discovery. The loaded
  spatial accessor includes distinct physical sites and unresolved identities,
  carrying role, source page, raw CRS/axes, resolution and verification status.
- Energy grouping now requires `coordinatesVerified === true`, including for
  legacy records lacking a flag. Missing coordinates and unverified sites are
  unknown, not outside. Weather-station geometry behavior stays unchanged.
- Site picks reuse the energy datasource, picking owner and selection overlay.
  Site cards include provenance, plant link, physical role and current loaded
  watershed memberships. Basin selection survives a site pick. OFF/not-loaded
  watershed state is displayed without fetching boundaries from the energy layer.
- `plantGeography` identifies reservoir/chamber elevation referents independently
  of plant location. Existing per-metric timestamps, daily MWh dates and units
  remain untouched; national SCADA is not allocated to plants.

## Files, activation and validation

Implementation: `src/layers/ecuadorEnergy/{sites,model,index}.js`,
`src/layers/watersheds/{geometry,index}.js`, callback composition in
`src/app/constructCatalog.js`, and `scripts/package-boundaries.json`.
Tests: `src/layers/ecuadorEnergy/{sites,ecuadorEnergy}.test.mjs` plus existing
provider, watershed, source composition and catalog tests.

Activate **Ecuador hydro & grid**, then **Clima → Unidades hidrográficas**.
Select a BasinATLAS polygon, then Sopladora's named portal or discharge.
Two purple physical-site markers are available. Eight unresolved sites are
reported in the energy summary; no reservoir surface is drawn.
No new layer/state token, service, private endpoint, polling loop or credentials.

Validation completed on 2026-10-31:

- 16 focused energy/watershed tests passed, including the independently
  transformed UTM coordinates, missing/ambiguous CRS rejection, measurement
  referents, point membership and disabled-layer lifecycle.
- 70 catalog, voice-schema and analyst tests passed.
- `npm run check:boundaries` passed (1,061 modules; 85 portable entries).
- Layer-token ledger passed against local `main`: 32 published, 5 new.
- `npm run i18n`, `npm run format:check` and `npm run build` passed. The build
  transformed 920 modules; Vite reported its existing large-chunk warning.
- The dev app and bundled GeoJSON both returned HTTP 200 on port 4173.

The full unit suite was not run. The shared preview browser could not start
Chrome under the root-owned T3 server, so the checks used local headless
Chromium. The app had no JavaScript exceptions, Esri imagery tiles returned
HTTP 200, CENACE populated the energy layer, seven watershed units loaded, and
a purple Sopladora marker was visible. In the captured Ecuador view the camera
was strongly oblique (ONA about 58–60°) and most of the scene appeared green;
turning the watershed layer off did not materially change it. The straight-down
control moved the headless camera away from Ecuador, so this run could not
confirm a clean local basemap, select the basin in the viewport, or verify the
marker card by picking it. IMERG's panel showed its NASA source, mm/h legend and
latency, but the image frame was still loading/unavailable in the capture.
Treat visual acceptance of the overlays as pending in a normal browser session.
No commits, pushes, PRs or deploys; no `/root/aegis` changes. Existing
IGEPN/IMERG/watershed research and the `weather.css` layout fix remain in place.
