import { validPoint } from './geometry.js';
export function validateWatershedCollection(value) {
  if (
    value?.type !== 'FeatureCollection' ||
    !Array.isArray(value.features) ||
    !value.features.length ||
    value.features.length > 64 ||
    ![
      'product',
      'license',
      'sourceUrl',
      'dataDate',
      'version',
      'resolution',
      'attribution',
    ].every(
      (key) =>
        typeof value.provenance?.[key] === 'string' &&
        value.provenance[key].length > 0,
    )
  )
    throw new Error('Invalid watershed collection/provenance');
  let vertices = 0;
  const ids = new Set();
  for (const feature of value.features) {
    const p = feature.properties,
      g = feature.geometry;
    if (
      feature.type !== 'Feature' ||
      typeof p?.id !== 'string' ||
      !p.id ||
      ids.has(p.id) ||
      typeof p.name !== 'string' ||
      !Number.isFinite(p.areaKm2) ||
      p.areaKm2 <= 0 ||
      !Number.isInteger(p.level) ||
      !validPoint(p.labelLon, p.labelLat) ||
      !['Polygon', 'MultiPolygon'].includes(g?.type)
    )
      throw new Error('Invalid watershed feature');
    ids.add(p.id);
    const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    if (!Array.isArray(polygons) || !polygons.length)
      throw new Error('Invalid watershed polygons');
    for (const rings of polygons) {
      if (!Array.isArray(rings) || !rings.length)
        throw new Error('Invalid watershed rings');
      for (const ring of rings) {
        if (!Array.isArray(ring) || ring.length < 4)
          throw new Error('Invalid watershed ring');
        for (const point of ring) {
          if (
            !Array.isArray(point) ||
            point.length !== 2 ||
            !validPoint(point[0], point[1]) ||
            ++vertices > 60000
          )
            throw new Error('Invalid/bounded watershed coordinates');
        }
        if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1])
          throw new Error('Unclosed watershed ring');
      }
    }
  }
  return value;
}
