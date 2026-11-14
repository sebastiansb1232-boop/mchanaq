/**
 * FASE 2 (OPCIONAL) — Proyeccion visual de propagacion
 * ===================================================
 *
 * Corresponde a la seccion 12 de `docs/harness/arquitectura-frontend-backend.md`
 * (v1.2): esta desacoplada de la Fase 1 y no toca ninguno de sus endpoints.
 * Reutiliza las variables diarias ya preparadas en Fase 1 (`wind_dir_deg`,
 * `wind_speed_10m_ms`, `elevation_m`, cobertura, `t_amb_c`) para estimar hacia
 * donde podria extenderse un fuego desde un foco de partida.
 *
 * Cuando el backend publique `/spread-forecast` o `/spread-simulate`, esta
 * implementacion local se sustituye por la respuesta del servidor sin cambiar
 * la interfaz.
 *
 * QUE ES. Un modelo de tiempo de llegada sobre una grilla. Desde un punto de
 * ignicion hipotetico propaga un frente usando la forma eliptica clasica de
 * Alexander (1985) / Anderson (1983), corregida por pendiente con la regla de
 * campo de que la velocidad se duplica cada 10 grados de pendiente ascendente,
 * y por humedad del combustible con un contenido de extincion.
 *
 * QUE NO ES. No predice donde ni cuando se va a iniciar un incendio, no estima
 * probabilidad de ignicion y no esta calibrado ni validado contra incendios
 * reales del Peru. El relieve y el combustible que usa aqui son sinteticos
 * mientras el backend no publique SRTM y cobertura; sirven para desarrollar y
 * mostrar la interaccion, no para operar.
 *
 * COMO SE COMUNICA. Siempre acompaniado del distintivo de simulacion y del
 * listado de supuestos. Nunca como alerta, pronostico ni apoyo a decisiones de
 * evacuacion.
 *
 * Referencias del modelo:
 * - Anderson, H.E. (1983). Predicting wind-driven wildland fire size and shape.
 * - Alexander, M.E. (1985). Estimating the length-to-breadth ratio of elliptical
 *   forest fire patterns.
 * - Rothermel, R.C. (1972). A mathematical model for predicting fire spread.
 */

import { PERU_BOUNDS, pointInRing, ringBounds, type LatLon } from "./geo";
import { ISOCHRONE_STEPS_H } from "../api/types";
import { inferno } from "./palette";

/** Identificador del modelo, segun `model_metadata.model_name` del contrato. */
export const SPREAD_MODEL_NAME = "heuristic_wind_slope_spread_v1";

/** Aviso que debe acompaniar siempre al resultado (arquitectura v1.2 §12.2). */
export const SPREAD_DISCLAIMER =
  "Proyeccion exploratoria basada en viento diario, DEM y cobertura; no sustituye modelos fisicos operativos en tiempo real.";

export interface SpreadInputs {
  /** Vertices del area de interes, en [lat, lon]. */
  ring: LatLon[];
  /** Punto de ignicion hipotetico. */
  ignition: LatLon;
  /** Velocidad del viento a 10 m, en m/s. */
  windSpeedMs: number;
  /** Direccion DESDE la que sopla el viento, en grados meteorologicos (0 = norte). */
  windDirDeg: number;
  /** Contenido de humedad del combustible fino muerto, en porcentaje. */
  fuelMoisturePct: number;
  /** Proporcion de superficie con vegetacion potencialmente combustible, 0 a 100. */
  vegetationPct: number;
  /** Pendiente media del territorio, en grados. Modula el relieve sintetico. */
  slopeMeanDeg: number;
  /** Horizonte de la simulacion, en horas. */
  horizonHours: number;
}

export interface SpreadResult {
  /** Numero de columnas y filas de la grilla. */
  cols: number;
  rows: number;
  /** Recuadro del dominio simulado. */
  bounds: { south: number; west: number; north: number; east: number };
  /** Tiempo de llegada del frente a cada celda, en horas. Infinity = no alcanzada. */
  arrival: Float32Array;
  /** Carga de combustible normalizada, 0 a 1. 0 = no combustible. */
  fuel: Float32Array;
  /** Elevacion sintetica, en metros. */
  elevation: Float32Array;
  /** Lado de celda, en metros. */
  cellSizeM: number;
  /** Superficie alcanzada por banda horaria acumulada. */
  bands: { hours: number; areaHa: number }[];
  /** Superficie total alcanzada al horizonte, en hectareas. */
  totalAreaHa: number;
  /** Recuadro que ocupa el frente. Sirve para encuadrar el mapa. */
  reachedBounds: { south: number; west: number; north: number; east: number } | null;
  /** Velocidad de avance de cabeza, en m/min. */
  headRosMMin: number;
  /** Relacion largo/ancho de la elipse. */
  lengthToBreadth: number;
  /** Supuestos activos, para mostrarlos junto al resultado. */
  assumptions: string[];
}

/* -------------------------------------------------------------------------- */
/* Relieve y combustible sinteticos                                            */
/* -------------------------------------------------------------------------- */

function hash2(x: number, y: number, seed: number): number {
  let h = seed ^ Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Ruido de valor bilineal. */
function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return (a * (1 - xf) + b * xf) * (1 - yf) + (c * (1 - xf) + d * xf) * yf;
}

/** Ruido fractal de 4 octavas, salida 0 a 1. */
function fbm(x: number, y: number, seed: number): number {
  let v = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < 4; o++) {
    v += valueNoise(x * freq, y * freq, seed + o * 7919) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return v / norm;
}

/* -------------------------------------------------------------------------- */
/* Fisica simplificada del frente                                              */
/* -------------------------------------------------------------------------- */

/**
 * Relacion largo/ancho de la elipse en funcion del viento (Anderson 1983).
 * U en m/s.
 */
export function lengthToBreadth(windMs: number): number {
  const lb = 0.936 * Math.exp(0.2566 * windMs) + 0.461 * Math.exp(-0.1548 * windMs) - 0.397;
  return Math.max(1, Math.min(8, lb));
}

/**
 * Factor de humedad del combustible. Cae a cero en el contenido de extincion.
 * Forma cuadratica, consistente con el amortiguamiento de Rothermel.
 */
export function moistureFactor(fuelMoisturePct: number, extinctionPct = 30): number {
  const r = Math.max(0, Math.min(1, fuelMoisturePct / extinctionPct));
  return Math.max(0, (1 - r) ** 2);
}

/**
 * Factor de pendiente. Regla de campo: la velocidad se duplica cada 10 grados
 * de pendiente ascendente. Cuesta abajo frena, pero de forma menos marcada.
 */
export function slopeFactor(slopeDeg: number): number {
  if (slopeDeg >= 0) return Math.min(8, Math.exp(0.0693 * slopeDeg));
  return Math.max(0.35, Math.exp(0.0693 * slopeDeg * 0.5));
}

/** Velocidad de avance de cabeza, en m/min, sin pendiente. */
export function headRos(windMs: number, fuelMoisturePct: number, vegetationPct: number): number {
  const R0 = 0.9; // m/min en combustible fino, sin viento ni pendiente
  const wind = 1 + 0.72 * Math.pow(Math.max(0, windMs), 1.22);
  const fuelLoad = 0.25 + 0.75 * Math.max(0, Math.min(1, vegetationPct / 100));
  return R0 * wind * moistureFactor(fuelMoisturePct) * fuelLoad;
}

/* -------------------------------------------------------------------------- */
/* Monticulo binario para Dijkstra                                             */
/* -------------------------------------------------------------------------- */

class MinHeap {
  private cost: number[] = [];
  private idx: number[] = [];

  get size(): number {
    return this.idx.length;
  }

  push(cost: number, index: number): void {
    this.cost.push(cost);
    this.idx.push(index);
    let i = this.idx.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.cost[p] <= this.cost[i]) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): { cost: number; index: number } | undefined {
    const n = this.idx.length;
    if (n === 0) return undefined;
    const top = { cost: this.cost[0], index: this.idx[0] };
    const lastC = this.cost.pop() as number;
    const lastI = this.idx.pop() as number;
    if (n > 1) {
      this.cost[0] = lastC;
      this.idx[0] = lastI;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.idx.length && this.cost[l] < this.cost[m]) m = l;
        if (r < this.idx.length && this.cost[r] < this.cost[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    const c = this.cost[a];
    this.cost[a] = this.cost[b];
    this.cost[b] = c;
    const i = this.idx[a];
    this.idx[a] = this.idx[b];
    this.idx[b] = i;
  }
}

/* -------------------------------------------------------------------------- */
/* Simulacion                                                                  */
/* -------------------------------------------------------------------------- */

const MAX_SIDE = 150;
const MIN_SIDE = 40;

export function simulateSpread(input: SpreadInputs): SpreadResult {
  const {
    ring,
    ignition,
    windSpeedMs,
    windDirDeg,
    fuelMoisturePct,
    vegetationPct,
    slopeMeanDeg,
    horizonHours,
  } = input;

  // Dominio: recuadro del area de interes expandido, porque el fuego no se
  // detiene en el borde del poligono que dibujo el usuario.
  const b = ringBounds(ring);
  const padLat = Math.max(0.02, (b.north - b.south) * 0.35);
  const padLon = Math.max(0.02, (b.east - b.west) * 0.35);
  const bounds = {
    south: Math.max(PERU_BOUNDS.south - 1, b.south - padLat),
    north: Math.min(PERU_BOUNDS.north + 1, b.north + padLat),
    west: Math.max(PERU_BOUNDS.west - 1, b.west - padLon),
    east: Math.min(PERU_BOUNDS.east + 1, b.east + padLon),
  };

  const latMid = (bounds.north + bounds.south) / 2;
  const mPerDegLat = 110_574;
  const mPerDegLon = 111_320 * Math.cos((latMid * Math.PI) / 180);
  const widthM = (bounds.east - bounds.west) * mPerDegLon;
  const heightM = (bounds.north - bounds.south) * mPerDegLat;

  // Grilla cuadrada en metros, con el lado mayor acotado.
  const longSideM = Math.max(widthM, heightM);
  const side = Math.max(MIN_SIDE, Math.min(MAX_SIDE, Math.round(longSideM / 220)));
  const cellSizeM = longSideM / side;
  const cols = Math.max(2, Math.round(widthM / cellSizeM));
  const rows = Math.max(2, Math.round(heightM / cellSizeM));
  const n = cols * rows;

  const fuel = new Float32Array(n);
  const elevation = new Float32Array(n);
  const arrival = new Float32Array(n).fill(Infinity);

  // Semilla ligada a la posicion: el mismo territorio da siempre el mismo relieve.
  const seed = (Math.abs(Math.round(latMid * 1000)) ^ Math.abs(Math.round(bounds.west * 1000))) >>> 0;
  const relief = 40 + Math.max(0, slopeMeanDeg) * 55; // amplitud en metros
  const vegShare = Math.max(0, Math.min(1, vegetationPct / 100));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const nx = (c / cols) * 6;
      const ny = (r / rows) * 6;
      elevation[i] = fbm(nx, ny, seed) * relief;

      // Combustible: ruido a otra escala, umbralizado por la proporcion de
      // vegetacion del territorio. Las zonas bajo el umbral quedan sin carga
      // (cuerpos de agua, suelo desnudo, urbano) y no propagan.
      const v = fbm(nx * 1.9 + 11.3, ny * 1.9 + 4.7, seed ^ 0x9e3779b9);
      fuel[i] = v > 1 - vegShare ? 0.35 + 0.65 * ((v - (1 - vegShare)) / Math.max(1e-6, vegShare)) : 0;
    }
  }

  // Direccion a la que avanza la cabeza: opuesta a la direccion de procedencia.
  const headingRad = ((windDirDeg + 180) % 360) * (Math.PI / 180);
  const headDx = Math.sin(headingRad); // este positivo
  const headDy = Math.cos(headingRad); // norte positivo

  const LB = lengthToBreadth(windSpeedMs);
  const ecc = Math.sqrt(Math.max(0, LB * LB - 1)) / LB;
  const Rhead = headRos(windSpeedMs, fuelMoisturePct, vegetationPct); // m/min

  // Celda de ignicion
  const igCol = Math.round(((ignition[1] - bounds.west) / (bounds.east - bounds.west)) * cols - 0.5);
  const igRow = Math.round(((bounds.north - ignition[0]) / (bounds.north - bounds.south)) * rows - 0.5);
  const start =
    Math.max(0, Math.min(rows - 1, igRow)) * cols + Math.max(0, Math.min(cols - 1, igCol));

  const heap = new MinHeap();
  arrival[start] = 0;
  heap.push(0, start);

  const NB = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1], [0, 1],
    [1, -1], [1, 0], [1, 1],
  ];
  const horizonMin = horizonHours * 60;

  while (heap.size > 0) {
    const top = heap.pop();
    if (!top) break;
    const { cost, index } = top;
    if (cost > arrival[index]) continue;
    if (cost > horizonMin) continue;

    const r = (index / cols) | 0;
    const c = index - r * cols;

    for (const [dr, dc] of NB) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const j = nr * cols + nc;
      if (fuel[j] <= 0) continue; // sin combustible: el frente no avanza

      // Direccion de avance de esta arista, en el plano.
      const dx = dc;
      const dy = -dr; // la fila crece hacia el sur
      const len = Math.hypot(dx, dy);
      const ux = dx / len;
      const uy = dy / len;

      // Angulo respecto a la cabeza y radio de la elipse en esa direccion.
      const cosT = Math.max(-1, Math.min(1, ux * headDx + uy * headDy));
      const ellipse = (1 - ecc) / Math.max(0.05, 1 - ecc * cosT);

      // Pendiente en la direccion de avance.
      const distM = len * cellSizeM;
      const dz = elevation[j] - elevation[index];
      const slopeDeg = (Math.atan2(dz, distM) * 180) / Math.PI;

      const ros = Math.max(
        0.01,
        Rhead * ellipse * slopeFactor(slopeDeg) * (0.4 + 0.6 * fuel[j])
      ); // m/min
      const t = cost + distM / ros;

      if (t < arrival[j] && t <= horizonMin) {
        arrival[j] = t;
        heap.push(t, j);
      }
    }
  }

  // Convertir a horas, resumir por bandas y medir el recuadro alcanzado.
  let reached = 0;
  let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
  for (let i = 0; i < n; i++) {
    if (arrival[i] === Infinity) continue;
    arrival[i] = arrival[i] / 60;
    reached++;
    const r = (i / cols) | 0;
    const c = i - r * cols;
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
  }

  const latSpan = bounds.north - bounds.south;
  const lonSpan = bounds.east - bounds.west;
  const reachedBounds =
    reached > 0
      ? {
          north: bounds.north - (minR / rows) * latSpan,
          south: bounds.north - ((maxR + 1) / rows) * latSpan,
          west: bounds.west + (minC / cols) * lonSpan,
          east: bounds.west + ((maxC + 1) / cols) * lonSpan,
        }
      : null;

  const cellHa = (cellSizeM * cellSizeM) / 10_000;
  // Pasos de isocrona del contrato (+6 h, +12 h, +24 h), recortados al horizonte.
  const bandHours = ISOCHRONE_STEPS_H.filter((h) => h <= horizonHours);
  if (!bandHours.includes(horizonHours)) bandHours.push(horizonHours);
  bandHours.sort((a, b) => a - b);
  const bands = bandHours.map((h) => {
    let count = 0;
    for (let i = 0; i < n; i++) if (arrival[i] <= h) count++;
    return { hours: h, areaHa: Math.round(count * cellHa) };
  });

  const insideAoi = pointInRing(ignition, ring);

  return {
    cols,
    rows,
    bounds,
    arrival,
    fuel,
    elevation,
    cellSizeM,
    bands,
    totalAreaHa: Math.round(reached * cellHa),
    reachedBounds,
    headRosMMin: Math.round(Rhead * 100) / 100,
    lengthToBreadth: Math.round(LB * 100) / 100,
    assumptions: [
      `Viento constante de ${windSpeedMs.toFixed(1)} m/s desde ${Math.round(windDirDeg)}° durante toda la ventana`,
      `Humedad del combustible fino uniforme de ${fuelMoisturePct.toFixed(0)}% (extincion 30%)`,
      `Carga de combustible derivada de ${Math.round(vegetationPct)}% de cobertura vegetal del territorio`,
      "Relieve sintetico: SRTM aun no conectado desde el backend",
      "Sin supresion, cortafuegos, carreteras ni rios explicitos",
      "Sin focos secundarios por pavesas ni fuego de copas",
      insideAoi
        ? "Ignicion dentro del area de interes"
        : "Ignicion fuera del poligono dibujado",
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* Render a canvas                                                             */
/* -------------------------------------------------------------------------- */

/** El frente usa la rampa calida: el color codifica tiempo, no magnitud. */
export function rampColor(t: number): [number, number, number] {
  return inferno(t);
}

export function rampCss(t: number): string {
  const [r, g, b] = rampColor(t);
  return `rgb(${r},${g},${b})`;
}

/**
 * Dibuja el estado de la simulacion en el instante `tHours` y devuelve un
 * data URL para usarlo como superposicion de imagen en el mapa.
 */
export function renderSpreadPNG(
  result: SpreadResult,
  tHours: number,
  horizonHours: number
): string {
  const { cols, rows, arrival } = result;
  const canvas = document.createElement("canvas");
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const img = ctx.createImageData(cols, rows);
  const data = img.data;

  for (let i = 0; i < cols * rows; i++) {
    const t = arrival[i];
    const o = i * 4;
    if (!isFinite(t) || t > tHours) {
      data[o + 3] = 0;
      continue;
    }
    // Mas reciente = mas brillante. El area ya consumida se apaga.
    const age = (tHours - t) / Math.max(0.5, horizonHours);
    const [r, g, bl] = rampColor(1 - Math.min(1, age * 0.92));
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = bl;
    data[o + 3] = 225;
  }

  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}
