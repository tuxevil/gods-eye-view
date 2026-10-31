# Ecuador data coverage for God's Eye View

Reviewed 2026-10-30. This note compares the current repository integrations with public Ecuadorian sources. No application source was changed.

## Current repository coverage

The app has useful global context, but it is not an Ecuador situational-awareness product:

- Wind is forecast data from global NOAA GFS and ECMWF IFS models. The global infrared satellite mosaic includes Ecuador, but is hourly and typically 2–3 hours late. NOAA MRMS rain radar is limited to the contiguous United States, so it contributes no Ecuador radar returns. Lightning density covers the Americas and Pacific, including Ecuador, at roughly 8 km / 15-minute accumulation. See [`DATA_SOURCES.md`](../../DATA_SOURCES.md).
- Earthquakes use a global USGS feed. FIRMS fires are global but require a NASA FIRMS key. See [`DATA_SOURCES.md`](../../DATA_SOURCES.md).
- Public CCTV catalogs do not include Ecuador. ALPR reads a community OSM extract for the US and Canada; the repository explicitly says other regions have no data. See [`DATA_SOURCES.md`](../../DATA_SOURCES.md).
- The bundled dam/infrastructure layer is an OSM/OpenInfraMap snapshot, not telemetry. It contains 704 dam features globally; a coarse Ecuador bounding-box scan found two geometries (one named Delsitanisagua), with no live reservoir level, inflow, or generation values. See [`dams/README.md`](../../src/data/local_data/dams/README.md).
- The code and source inventory contain no Ecuador-specific INAMHI, Gestión de Riesgos, CENACE, ECU 911, or crime-statistics provider.

## Public Ecuador sources worth integrating

| Need | First-party source and available content | Coverage / implementation caveat |
| --- | --- | --- |
| Weather alerts, observations, rain and river context | [INAMHI services](https://servicios.inamhi.gob.ec/) lists current meteorological/hydrological alerts, provincial forecasts, hydrometeorological station viewer, drought monitor, bulletins and GeoGlows. INAMHI describes GeoGlows as providing short-range rain forecasts, satellite precipitation, fire monitoring, river discharge and hydro-energy tools ([INAMHI description](https://www.inamhi.gob.ec/plataforma-para-el-fortalecimiento-de-capacidades-de-monitoreo-y-prevencion-de-incendios-forestales/)). Its [GeoNode](https://geoservicios.inamhi.gob.ec/) publishes open geospatial datasets, maps and resources. | Strong first implementation target. Verify stable machine-readable endpoints, update cadence, attribution and permitted reuse per dataset. Some alerts remain PDFs and some forecast products are regional. |
| Floods, rain impacts, landslides | The public [SNGR ArcGIS REST directory](https://sgrportal.gestionderiesgos.gob.ec/server/rest/services/) exposes services. It includes [rain-impact events](https://sgrportal.gestionderiesgos.gob.ec/server/rest/services/Hosted/EVENTOS_X_LLUVIAS/FeatureServer/0), a separate Zone 4 rainfall-monitoring layer with fields such as accumulation and overflow, and a [flood-susceptibility polygon layer](https://sgrportal.gestionderiesgos.gob.ec/server/rest/services/Susceptibilidad_de_Inundaciones/MapServer/0). | Distinguish dated incident reports from static hazard susceptibility. Check each layer's last-edited dates and geographic extent before presenting it as current nationwide coverage. |
| Generation and reservoirs | [CENACE operational information](https://www.cenace.gob.ec/info-operativa/InformacionOperativa.htm) publishes daily/monthly/annual production and a real-time generation curve, marked preliminary SCADA data. CENACE says its [validated real dispatch report](https://www.cenace.gob.ec/elaboracion-del-despacho-real/) is published through BOSNINET. A 2026 CENACE report describes a CENACE–INAMHI exchange of real-time and historical river-level/flow data through JSON web services ([report](https://www.cenace.gob.ec/wp-content/uploads/downloads/2026/04/Informe-RDC-25_2026-abril-vf.pdf)). | Public national generation is suitable for a dashboard/summary. The report describes the river-data JSON exchange as institutional cooperation; it does not establish an unauthenticated public endpoint for dam levels. Confirm access with CENACE/INAMHI before promising per-reservoir telemetry. |
| Crime / safety context | The [Datos Abiertos Ecuador homicide dataset](https://www.datosabiertos.gob.ec/dataset/homicidios-intencionales) is published by the Ministry of the Interior in XLSX and is aggregated nationally/territorially; related datasets include arrests and disappearances. | Useful for dated province/canton trends or choropleths, not a live incident feed or a precise real-time crime map. Preserve the publication period and update date in the UI. |
| Public cameras | ECU 911 states that it operates about 6,500 national surveillance cameras and describes footage handling for operational response and judicial requests ([ECU 911](https://www.ecu911.gob.ec/camaras-de-videovigilancia/)). | The official page is not a public camera stream catalog. Treat access to live government video as unavailable absent an explicitly public feed and authorization. Openly published traffic cameras or OSM camera locations can be separate, limited alternatives. |

## Suggested Ecuador-first slice

1. Add current INAMHI alerts and observed station/rain/river data, with source timestamp, coverage, and explicit stale/unavailable states.
2. Add SNGR dated rain/flood/landslide impact reports and a separately styled static flood-susceptibility layer.
3. Add CENACE national generation mix/curve, then pursue public access to reservoir-level feeds before showing live Mazar/Amaluza values.
4. Add Ministry of the Interior statistics as historical/periodic territorial aggregates, not point incidents.
5. Add cameras only from openly accessible public catalogs; do not imply access to ECU 911's operational network.

This would complement global wind, cloud, lightning and earthquake context while making the Ecuador-specific observations and their freshness visible.
