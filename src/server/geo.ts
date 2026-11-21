// Plain geometry for the location layers. There is no PostGIS (migration 0001), so a lookup is a bounding-box prefilter in SQL followed by
// these functions in code. Every distance is a straight line on the sphere, and every layer that shows one says so. Coordinates are lat/lon.

const EARTH_RADIUS_M = 6_371_000;
const METRES_PER_DEGREE_LAT = 111_320;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres between two points. */
export function haversineMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface Box {
  min_lat: number;
  max_lat: number;
  min_lon: number;
  max_lon: number;
}

/** A square box that contains the circle of `radiusM` metres around the point (a prefilter, never the answer). */
export function boxAround(lat: number, lon: number, radiusM: number): Box {
  const dLat = radiusM / METRES_PER_DEGREE_LAT;
  const dLon = radiusM / (METRES_PER_DEGREE_LAT * Math.max(0.01, Math.cos(rad(lat))));
  return { min_lat: lat - dLat, max_lat: lat + dLat, min_lon: lon - dLon, max_lon: lon + dLon };
}

/** Metres east and north of the centre, for drawing a schematic (x east, y north). */
export function offsetMetres(centreLat: number, centreLon: number, lat: number, lon: number): { east: number; north: number } {
  return {
    east: Math.round(rad(lon - centreLon) * EARTH_RADIUS_M * Math.cos(rad(centreLat))),
    north: Math.round(rad(lat - centreLat) * EARTH_RADIUS_M),
  };
}

/** Even-odd ray casting for one closed ring of [lon, lat] pairs. */
export function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** A GeoJSON polygon: the first ring is the outer boundary, any others are holes. */
export function pointInPolygon(lon: number, lat: number, rings: number[][][]): boolean {
  if (rings.length === 0 || !pointInRing(lon, lat, rings[0])) return false;
  return !rings.slice(1).some((hole) => pointInRing(lon, lat, hole));
}
