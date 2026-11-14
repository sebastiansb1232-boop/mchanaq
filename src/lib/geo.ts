/** Utilidades geometricas. Todo en [lat, lon] salvo que se indique lo contrario. */

export type LatLon = [number, number];

/** Recuadro aproximado del Peru continental. */
export const PERU_BOUNDS: { south: number; west: number; north: number; east: number } = {
  south: -18.4,
  west: -81.4,
  north: -0.03,
  east: -68.6,
};

export const PERU_CENTER: LatLon = [-9.9, -75.0];

const R_EARTH_KM = 6371.0088;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Punto dentro de poligono por cruce de rayos. El borde cuenta como dentro. */
export function pointInRing(p: LatLon, ring: LatLon[]): boolean {
  if (ring.length < 3) return false;
  const [y, x] = p;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Area del poligono en kilometros cuadrados.
 * Proyeccion equirectangular local: suficiente para un area de interes de
 * hackathon, no para calculo catastral.
 */
export function ringAreaKm2(ring: LatLon[]): number {
  if (ring.length < 3) return 0;
  const latRef = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const kx = (Math.PI / 180) * R_EARTH_KM * Math.cos(toRad(latRef));
  const ky = (Math.PI / 180) * R_EARTH_KM;
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][1] * kx;
    const yi = ring[i][0] * ky;
    const xj = ring[j][1] * kx;
    const yj = ring[j][0] * ky;
    sum += xj * yi - xi * yj;
  }
  return Math.abs(sum) / 2;
}

export function ringBounds(ring: LatLon[]) {
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;
  for (const [lat, lon] of ring) {
    south = Math.min(south, lat);
    north = Math.max(north, lat);
    west = Math.min(west, lon);
    east = Math.max(east, lon);
  }
  return { south, west, north, east };
}

export function ringCentroid(ring: LatLon[]): LatLon {
  const lat = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const lon = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  return [lat, lon];
}

/**
 * Centroide de un anillo en coordenadas GeoJSON.
 *
 * GeoJSON guarda `[lon, lat]` y el resto de la aplicación trabaja en
 * `[lat, lon]`, que es el orden de Leaflet. Invertir el par al entrar, en un
 * solo sitio, evita el error silencioso de pintar el Perú en medio del
 * Pacífico.
 */
export function polygonCentroid(ring: [number, number][]): LatLon {
  if (!ring.length) return PERU_CENTER;
  const lon = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const lat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  return [lat, lon];
}

/** Convierte un anillo GeoJSON (`[lon, lat]`) al orden de Leaflet. */
export function ringFromGeoJson(ring: [number, number][]): LatLon[] {
  return ring.map(([lon, lat]) => [lat, lon] as LatLon);
}

/** Distancia haversine en kilometros. */
export function distanceKm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function insidePeru(p: LatLon): boolean {
  return (
    p[0] >= PERU_BOUNDS.south &&
    p[0] <= PERU_BOUNDS.north &&
    p[1] >= PERU_BOUNDS.west &&
    p[1] <= PERU_BOUNDS.east
  );
}

/** Rectangulo a partir de dos esquinas opuestas, en sentido horario. */
export function rectRing(a: LatLon, b: LatLon): LatLon[] {
  const south = Math.min(a[0], b[0]);
  const north = Math.max(a[0], b[0]);
  const west = Math.min(a[1], b[1]);
  const east = Math.max(a[1], b[1]);
  return [
    [north, west],
    [north, east],
    [south, east],
    [south, west],
  ];
}

export function formatLatLon(p: LatLon, digits = 3): string {
  const ns = p[0] >= 0 ? "N" : "S";
  const ew = p[1] >= 0 ? "E" : "W";
  return `${Math.abs(p[0]).toFixed(digits)}°${ns} ${Math.abs(p[1]).toFixed(digits)}°${ew}`;
}
