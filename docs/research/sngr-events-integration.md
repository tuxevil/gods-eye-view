# SNGR adverse events integration for Ecuador

Verified LIVE on 2026-10-30 UTC.

## Upstream sources (`sgrportal.gestionderiesgos.gob.ec`)

The Secretaría Nacional de Gestión de Riesgos (SNGR) publishes ArcGIS REST
FeatureServer layers at `https://sgrportal.gestionderiesgos.gob.ec/server/rest/services`:

1. **`Hosted/EVENT_ADV_GEOJSON_FL/FeatureServer/0`** (`points`):
   - Rainy-season and hydro-meteorological field reports (`Inundación`,
     `Lluvias Intensas`, `Deslizamiento`, `Vendaval`, `Aluvión (Flujos)`,
     `Erosión Hídrica`, `Caídas (Colapso)`).
   - Event dates formatted as `DD/MM/YYYY` with `HH:mm` in `America/Guayaquil`
     (`-05:00`).
2. **`Hosted/EVENT_ADV_HOST/FeatureServer/0`** (`C_REDM_EVENT_MB_5`):
   - General SNGR adverse event registry (`Incendio Forestal`, `Deslizamiento`,
     `Inundación`, `Erosión Hídrica`, etc.).
   - Event dates formatted as Unix epoch milliseconds (midnight UTC of the
     civil date) plus `HH:mm` in `America/Guayaquil` (`-05:00`).

Both layers share the SNGR national sequence identifier (`secuencianacional`).

## Domain & provenance rules (`src/layers/sngrEvents/model.js`)

- **Deduplication:** Records across both feeds are merged by `secuencianacional`,
  retaining the record with the newest `updatedMs`.
- **Bounds & timestamps:** Coordinates are validated within continental Ecuador
  and Galápagos (`lat ∈ [-5.5, 2.0]`, `lon ∈ [-92.5, -75.0]`), falling back from
  attribute `latitud`/`longitud` to WGS84 (`outSR=4326`) geometry. Future dates
  beyond 24h tolerance are rejected.
- **Explicit publication lag:** Every event and the feed summary expose
  `lagDays` (`latestLagDays`) and state explicitly that SNGR REDM/EVIN records
  are field incident reports with publication lag, distinct from real-time
  emergency warnings and static susceptibility maps (`SUSCEPT_INUNDACIONES`).

## Server & client lifecycle

- **Endpoint:** `GET /api/sngr-events` (`server/providers/sngrEvents.js`),
  10-minute TTL, 6-hour finite stale fallback, single-flight deduplication, and
  partial-degradation flags (`rainySeasonError`, `nationalAdverseError`).
- **Layer:** `sngr-events` (share token `8`, category `Events`), with point
  clustering, hazard-category color legend (`flood`, `landslide`, `rain_wind`,
  `wildfire`, `stale`), ambient labels, and interactive selection cards.
