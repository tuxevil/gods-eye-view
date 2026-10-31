/** Physical assets are not generating plants. No reservoir centroid is fabricated.
 * Transform evidence and unresolved identities: docs/research/paute-geographic-sites.md.
 */
export const PAUTE_SITE_SOURCES = Object.freeze({
  sopladora:
    'https://www.celec.gob.ec/celecsur/wp-content/uploads/2024/07/Pliego-CONVOCATORIA-PUBLICA-OBRAS-DE-ESTABILIZACION-DE-TALUDES_24072024.pdf',
  mazar:
    'https://www.celec.gob.ec/celecsur/wp-content/uploads/2026/01/ANEXO-4-Informe-Tecnico-Interconexion-PGF-Mazar-Flotante.pdf',
  molino:
    'https://www.celec.gob.ec/celecsur/informacion-tecnica/central-hidroelectrica-paute-molino/',
  chamber:
    'https://www.celec.gob.ec/celecsur/informacion-tecnica/central-hidroelectrica-paute-sopladora/',
});

// PROJ EPSG:32717 -> EPSG:4326, always_xy=True; output rounded to ~1 m.
// Source integer metres are reporting resolution, not a surveyed accuracy claim.
const locations = Object.freeze({
  'sopladora-access-portal': Object.freeze({
    sourceCrs: 'EPSG:32717',
    sourceAxes: 'easting,northing',
    sourceCoordinates: Object.freeze([783726, 9712929]),
    crs: 'EPSG:4326',
    axes: 'longitude,latitude',
    lon: -78.448473,
    lat: -2.594615,
    sourceResolution: '1 m reported; positional accuracy unspecified',
    transform: 'PROJ / pyproj; EPSG:32717 → EPSG:4326; always_xy=True',
  }),
  'sopladora-discharge': Object.freeze({
    sourceCrs: 'EPSG:32717',
    sourceAxes: 'easting,northing',
    sourceCoordinates: Object.freeze([785159, 9711931]),
    crs: 'EPSG:4326',
    axes: 'longitude,latitude',
    lon: -78.435576,
    lat: -2.603609,
    sourceResolution: '1 m reported; positional accuracy unspecified',
    transform: 'PROJ / pyproj; EPSG:32717 → EPSG:4326; always_xy=True',
  }),
});

/** Fail closed on missing CRS, swapped axes, hemisphere, or provenance.
 * This accepts reviewed catalog transforms, never arbitrary provider coordinates.
 */
export function normalizeSiteLocation(site) {
  const location = site?.location;
  const verified = Boolean(
    site?.coordinatesVerified === true &&
    Boolean(site?.provenance?.url && site.provenance.section) &&
    location?.crs === 'EPSG:4326' &&
    location.axes === 'longitude,latitude' &&
    location.sourceCrs === 'EPSG:32717' &&
    location.sourceAxes === 'easting,northing' &&
    location.sourceCoordinates?.length === 2 &&
    location.sourceCoordinates[0] > 100000 &&
    location.sourceCoordinates[0] < 900000 &&
    location.sourceCoordinates[1] > 9600000 &&
    location.sourceCoordinates[1] < 9800000 &&
    Number.isFinite(location.lon) &&
    location.lon > -79 &&
    location.lon < -78 &&
    Number.isFinite(location.lat) &&
    location.lat > -3 &&
    location.lat < -2 &&
    Boolean(location.sourceResolution && location.transform),
  );
  return {
    lat: verified ? location.lat : null,
    lon: verified ? location.lon : null,
    coordinatesVerified: verified,
    locationRole: site?.role || 'unknown',
    locationPrecision: location?.sourceResolution || 'Unknown',
    locationProvenance: site?.provenance || null,
  };
}

const site = (
  id,
  name,
  plantId,
  role,
  relationship,
  source,
  section,
  extra = {},
) =>
  Object.freeze({
    id,
    name,
    plantId,
    role,
    relationship,
    coordinatesVerified: Boolean(locations[id]),
    location: locations[id] || null,
    provenance: Object.freeze({
      url: PAUTE_SITE_SOURCES[source],
      section,
      reviewedAt: '2026-10-31',
    }),
    ...extra,
  });
export const PAUTE_GEOGRAPHIC_SITES = Object.freeze([
  site(
    'mazar-dam',
    'Presa Mazar',
    'mazar',
    'dam',
    'Impounds Mazar reservoir; separate from the powerhouse',
    'mazar',
    'PDF p. 6, Figure 4.1',
    {
      locationNote:
        'Official reference −2.596 / −78.623001; datum unstated. Not verified as WGS84.',
    },
  ),
  site(
    'mazar-reservoir',
    'Embalse Mazar',
    'mazar',
    'reservoir',
    'Storage supplying Mazar; bounded by Mazar dam',
    'mazar',
    'PDF p. 6, Figure 4.1',
  ),
  site(
    'mazar-powerhouse',
    'Casa de máquinas Mazar',
    'mazar',
    'powerhouse',
    'Generating asset of Mazar; exact location unverified',
    'mazar',
    'PDF p. 6',
  ),
  site(
    'amaluza-dam',
    'Presa Daniel Palacios (Amaluza)',
    'paute-molino',
    'dam',
    'Impounds Amaluza reservoir; not Molino powerhouse',
    'molino',
    'PRESA Y TÚNELES',
  ),
  site(
    'amaluza-reservoir',
    'Embalse Amaluza',
    'paute-molino',
    'reservoir',
    'Reservoir supplying Paute-Molino',
    'molino',
    'EMBALSE AMALUZA',
  ),
  site(
    'molino-powerhouse',
    'Casa de máquinas Molino',
    'paute-molino',
    'powerhouse',
    'Generates using Amaluza water; discharge feeds Sopladora',
    'chamber',
    'Introduction; Sistema de Carga',
  ),
  site(
    'sopladora-interconnection',
    'Cámara de interconexión Sopladora',
    'sopladora',
    'interconnection-chamber',
    'Receives Molino turbine discharge; not a reservoir or pressure-head measurement',
    'chamber',
    '2.1 Cámara de Interconexión',
  ),
  site(
    'sopladora-powerhouse',
    'Casa de máquinas Sopladora',
    'sopladora',
    'powerhouse',
    'Underground generating cavern; portal is a separate asset',
    'chamber',
    '4. Central Subterránea',
  ),
  site(
    'sopladora-access-portal',
    'Sopladora · portal de acceso',
    'sopladora',
    'access-portal',
    'Entrance to powerhouse access tunnel; not the underground powerhouse',
    'sopladora',
    'PDF p. 4, §1.1 and Figure 1',
  ),
  site(
    'sopladora-discharge',
    'Sopladora · descarga',
    'sopladora',
    'discharge',
    'Discharge to Paute; not a reservoir or powerhouse',
    'sopladora',
    'PDF p. 4, §1.1 and Figure 1',
  ),
]);

export function geographicSiteRecords(plants = []) {
  return PAUTE_GEOGRAPHIC_SITES.filter((s) =>
    plants.some((p) => p.id === s.plantId),
  ).map((s) => ({
    ...s,
    ...normalizeSiteLocation(s),
    recordType: 'geographic-site',
  }));
}

export function plantGeography(plantId) {
  const sites = PAUTE_GEOGRAPHIC_SITES.filter((s) => s.plantId === plantId);
  return {
    coordinatesVerified: false,
    locationRole: sites.length
      ? 'plant-location-unknown'
      : 'plant-catalog-point',
    locationPrecision: 'Unverified; accuracy unknown',
    locationProvenance: null,
    geographicSiteIds: sites.map((s) => s.id),
    elevationSiteId:
      plantId === 'sopladora'
        ? 'sopladora-interconnection'
        : plantId === 'paute-molino'
          ? 'amaluza-reservoir'
          : plantId === 'mazar'
            ? 'mazar-reservoir'
            : null,
    ...(sites.length ? { lat: null, lon: null } : {}),
    elevationReferent:
      plantId === 'sopladora'
        ? 'Sopladora interconnection chamber (CELEC level; not reservoir elevation or hydraulic head)'
        : plantId === 'paute-molino'
          ? 'Amaluza reservoir'
          : plantId === 'mazar'
            ? 'Mazar reservoir'
            : 'CELEC reported elevation',
  };
}
