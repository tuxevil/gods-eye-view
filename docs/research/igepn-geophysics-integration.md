# IGEPN geophysics integration review

Reviewed against the working tree on 2026-10-30. Existing integration is deliberately
uncommitted. This note closes the implementation review/documentation increment;
it does not establish a monitoring SLA or authorization to publish.

## Sources and actual behavior

The fixed official [IGEPN ArcGIS server](https://srvsigaweb.igepn.edu.ec/server/rest/services)
provides three independent queries (JSON, outSR=4326):

- [Tectonic seismicity](https://srvsigaweb.igepn.edu.ec/server/rest/services/Sismicidad_tect%C3%B3nica_365_d%C3%ADas_MIL1/MapServer/0):
  newest-first, maximum 600 returned records from the source's 365-day layer.
- [Volcanic seismicity](https://srvsigaweb.igepn.edu.ec/server/rest/services/Sismicidad_volcanica_MIL1/MapServer/0):
  maximum 500 returned records, source query from the UTC date 90 days ago;
  normalized events are then filtered to the exact preceding 90 days. Response
  exposes at most 300 event records; summary counts use the normalized returned
  window before this final display cap. Counts are **returned catalog events**,
  not a complete instrumental detection count or corrected detection rate.
- [Volcano edifice/hazard catalog](https://srvsigaweb.igepn.edu.ec/server/rest/services/Peligro_volc%C3%A1nico_y_poblaci%C3%B3n_2021_MIL1/MapServer/0):
  maximum 50 features, vintage 2021, generalized polygons. Fifteen code-owned
  edifice identities are enriched by catalog name/alias matching; polygon
  centroids provide display positions where available, not instrument locations.

Tectonic earthquakes, volcanic seismic signals (VT/LP/EXP/TREMI/ND), and static
edifice classifications remain separate record types. An EXP record is an IGEPN
catalog signal classification, not a new eruption forecast or emergency alert.
Catalog eruptive class is **not** a current alert level. No eruption prediction,
ash forecast, hazard polygon overlay, alert bulletin ingestion or warning service
is implemented. No catalog license beyond public endpoint access was established;
retain attribution and review redistribution terms before public deployment.

Coordinates are filtered to 93°W–74.5°W, 6.5°S–3°N (Ecuador including Galápagos).
ArcGIS epoch times become explicit UTC; ECT display uses America/Guayaquil.
Missing volcanic magnitudes stay null; tectonic records require valid magnitude.
Invalid coordinates/timestamps are discarded; the current model's future tolerance
is 24 hours. Seven/thirty/ninety-day counts describe the bounded returned sample,
not proof of inactivity when zero. No pagination is currently implemented.

## Activation, lifecycle and limits

Enable **IGEPN seismic & volcanoes (Ecuador)** in the existing layer catalog.
Click earthquake/signal/edifice markers for source, timestamps, units and catalog
qualification. Existing selection overlay, analyst records and layer state are
used. Enablement uses reserved token `9`; no acquisition occurs at construction
or while disabled. Refresh replaces entities; disable aborts/invalidate client
work and clears selection. Shared links persist enablement, not selected events.

`server/providers/igepnGeophysics.js` installs `/api/igepn-geophysics` in dev and
preview, GET only, no functional query parameters. Three parallel fixed queries,
12-second per-query timeout, 2 MiB JSON response cap, five-minute memory cache,
one in-flight collection. Complete upstream failure can return the last good
snapshot for less than one hour, marked stale without changing fetchedAt. Partial
failure preserves successful feeds and exposes per-feed unavailable flags; missing
volcanic counts become null. No historical snapshot archive is stored. Client
source reads at most 1 MB. Unlike the weather image proxy, this provider currently
has no explicit redirect rejection, retry cooldown or ArcGIS transfer-limit
pagination; do not describe those protections as implemented.

Files: provider + provider tests; `src/layers/igepnGeophysics/{model,source,index}.js`
and layer tests; catalog/composition/standalone wiring, layer token ledger,
credits, locale labels and compact voice manifest entry. Existing SNGR changes
and voice instruction budget reductions were already present and preserved.

## Verification provenance

Prior-session handoff reported 9,119 full-suite passes/one skip, build, boundary,
token and i18n checks, and a LIVE local snapshot of 565 tectonic events, 178
volcanic signals and 15 volcanoes. **Those are historical reports, not new direct
validation in this review.** Focused tests/checks performed in the precipitation
increment are recorded separately in `ecuador-precipitation-integration.md`.

Existing tests cover nullable magnitudes, ECT/UTC times, catalog/signal separation,
returned-window summaries, partial failures, cache/coalescing/stale fallback,
source routes, escaping, disabled work, response races and selection lifecycle.
Browser visual QA remains unverified. No commit, push, PR or deployment performed.
