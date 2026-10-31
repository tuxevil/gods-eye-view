/** WGS84 point membership. Boundary belongs to the polygon, including hole edges.
 * Unwrap each ring continuously so small dateline-crossing units remain local.
 * This is geographic containment, never a hydraulic routing calculation. */
export function validPoint(lon, lat) {
  return (
    Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    Math.abs(lon) <= 180 &&
    Math.abs(lat) <= 90
  );
}
function ringMembership(ring, lon, lat) {
  let inside = false;
  let previous = ring[0]?.[0];
  const points = ring.map(([x, y]) => {
    while (x - previous > 180) x -= 360;
    while (x - previous < -180) x += 360;
    previous = x;
    return [x, y];
  });
  const anchor = points[0][0];
  while (lon - anchor > 180) lon -= 360;
  while (lon - anchor < -180) lon += 360;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, ay] = points[j],
      [bx, by] = points[i];
    const cross = (lon - ax) * (by - ay) - (lat - ay) * (bx - ax);
    if (
      Math.abs(cross) <= 1e-10 &&
      lon >= Math.min(ax, bx) - 1e-10 &&
      lon <= Math.max(ax, bx) + 1e-10 &&
      lat >= Math.min(ay, by) - 1e-10 &&
      lat <= Math.max(ay, by) + 1e-10
    )
      return 'boundary';
    if (
      ay > lat !== by > lat &&
      lon < ((bx - ax) * (lat - ay)) / (by - ay) + ax
    )
      inside = !inside;
  }
  return inside ? 'inside' : 'outside';
}
export function containsPoint(geometry, lon, lat) {
  if (!validPoint(lon, lat)) return null;
  if (!['Polygon', 'MultiPolygon'].includes(geometry?.type)) return null;
  const polygons =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some((rings) => {
    const shell = ringMembership(rings[0], lon, lat);
    if (shell === 'boundary') return true;
    if (shell !== 'inside') return false;
    for (const hole of rings.slice(1)) {
      const membership = ringMembership(hole, lon, lat);
      if (membership === 'boundary') return true;
      if (membership === 'inside') return false;
    }
    return true;
  });
}
/** Classify only caller-supplied, already loaded point records. No acquisition. */
export function groupContainedPoints(geometry, groups = []) {
  return groups.map(({ id, state, records = [] }) => {
    const contained = [],
      unknown = [];
    for (const record of records) {
      const membership =
        record.coordinatesVerified === false ||
        (id === 'ecuador-energy' && record.coordinatesVerified !== true)
          ? null
          : containsPoint(geometry, record.lon, record.lat);
      if (membership === true) contained.push(record);
      if (membership === null) unknown.push(record);
    }
    return { id, state, contained, unknown, loadedCount: records.length };
  });
}
