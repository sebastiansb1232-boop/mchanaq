/**
 * Juego de muestra para cuando el backend no responde.
 *
 * Imita la **forma** del contrato v1.2, endpoint por endpoint, para que la
 * interfaz se pueda desarrollar y demostrar sin depender del servicio. Dos
 * cosas que conviene tener claras:
 *
 *  - Los números son **ficticios**. Todas las respuestas llevan
 *    `data_origin: "fixture"` y la interfaz lo rotula «Datos de muestra».
 *    No se presentan como evidencia.
 *  - Las geometrías son cajas alrededor de centroides reales del Perú, no
 *    los límites oficiales. Los definitivos los pone Angelo en
 *    `data/processed/territories.geojson`.
 *
 * Todo es determinista: la misma fecha y el mismo territorio dan siempre el
 * mismo valor, así que la pantalla no cambia entre recargas.
 */

import {
  SENSORS,
  type Classification,
  type ComparisonStatus,
  type DailyRow,
  type HotspotCollection,
  type HotspotFeature,
  type Metadata,
  type MetricId,
  type MetricItem,
  type MetricResponse,
  type Sensor,
  type SensorComparison,
  type SensorSignal,
  type SignalStatus,
  type TerritoryCollection,
  type TerritoryFeature,
  type TerritorySummary,
  type TerritoryType,
} from "../api/types";
import { daysInMonth, monthRange, pad2, periodOf, splitIso } from "../api/client";

/** Marca que acompaña a todo lo que sale de aquí. */
export const FIXTURE_ORIGIN = "fixture";
export const FIXTURE_NOTICE =
  "DATOS FICTICIOS (muestra). No usar como evidencia ni en la presentación.";

/* -------------------------------------------------------------------------- */
/* Rango cubierto por la muestra                                              */
/* -------------------------------------------------------------------------- */

export const FIXTURE_FIRST_YEAR = 2001;
export const FIXTURE_LAST_YEAR = 2026;
export const FIXTURE_LAST_MONTH = 10;

/** Primer día que publica cada sensor, según su lanzamiento real. */
const SENSOR_SINCE: Record<Sensor, string> = {
  MODIS_TERRA: "2000-02-01",
  MODIS_AQUA: "2002-07-01",
  VIIRS_SNPP: "2012-01-01",
};

const LAST_DAY = `${FIXTURE_LAST_YEAR}-${pad2(FIXTURE_LAST_MONTH)}-${pad2(
  daysInMonth(FIXTURE_LAST_YEAR, FIXTURE_LAST_MONTH)
)}`;

export function sensorAvailableOn(sensor: Sensor, date: string): boolean {
  return date >= SENSOR_SINCE[sensor] && date <= LAST_DAY;
}

/* -------------------------------------------------------------------------- */
/* Azar reproducible                                                          */
/* -------------------------------------------------------------------------- */

/** FNV-1a: convierte una clave de texto en semilla. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: generador pequeño y estable. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = (...parts: (string | number)[]) => prng(hash(parts.join("|")));

/* -------------------------------------------------------------------------- */
/* Territorios de muestra                                                     */
/* -------------------------------------------------------------------------- */

interface Seed {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Media de alto a ancho de la caja, en grados. */
  size: number;
  elevation: number;
  /** Cuán propenso es el territorio a mostrar actividad, 0–1. */
  bias: number;
}

/** Provincias. Centroides aproximados; la geometría es una caja. */
const PROVINCES: Seed[] = [
  { id: "1501", name: "Lima", lat: -11.9, lon: -76.9, size: 0.7, elevation: 850, bias: 0.25 },
  { id: "1601", name: "Maynas", lat: -3.9, lon: -73.3, size: 1.5, elevation: 110, bias: 0.72 },
  { id: "2501", name: "Coronel Portillo", lat: -8.4, lon: -74.5, size: 1.4, elevation: 160, bias: 0.84 },
  { id: "1701", name: "Tambopata", lat: -12.7, lon: -69.8, size: 1.2, elevation: 230, bias: 0.9 },
  { id: "0801", name: "Cusco", lat: -13.5, lon: -71.9, size: 0.6, elevation: 3400, bias: 0.38 },
  { id: "0401", name: "Arequipa", lat: -16.4, lon: -71.5, size: 0.9, elevation: 2330, bias: 0.17 },
  { id: "1301", name: "Trujillo", lat: -8.1, lon: -79.0, size: 0.5, elevation: 90, bias: 0.12 },
  { id: "0301", name: "Huamanga", lat: -13.2, lon: -74.2, size: 0.7, elevation: 2760, bias: 0.46 },
];

/** Unidades hidrográficas (nivel Pfafstetter por confirmar). */
const HYDRO: Seed[] = [
  { id: "49871", name: "Alto Ucayali", lat: -9.2, lon: -74.2, size: 1.6, elevation: 320, bias: 0.8 },
  { id: "49877", name: "Bajo Marañón", lat: -4.8, lon: -75.6, size: 1.7, elevation: 140, bias: 0.68 },
  { id: "49799", name: "Madre de Dios", lat: -12.2, lon: -70.4, size: 1.5, elevation: 260, bias: 0.88 },
  { id: "13771", name: "Chira", lat: -4.9, lon: -80.6, size: 0.9, elevation: 180, bias: 0.3 },
  { id: "13755", name: "Rímac", lat: -11.8, lon: -76.6, size: 0.6, elevation: 1900, bias: 0.22 },
];

function seeds(type: TerritoryType): Seed[] {
  return type === "province" ? PROVINCES : HYDRO;
}

function findSeed(type: TerritoryType, id: string): Seed | null {
  return seeds(type).find((s) => s.id === id) ?? null;
}

/** El territorio con que se abre la herramienta. */
export const DEFAULT_TERRITORY: { type: TerritoryType; id: string } = {
  type: "province",
  id: "2501",
};

/** Caja ligeramente irregular, para que no parezcan rectángulos perfectos. */
function boxOf(s: Seed): number[][] {
  const r = rnd("geom", s.id);
  const h = s.size / 2;
  const jitter = () => (r() - 0.5) * s.size * 0.18;
  const pts: [number, number][] = [
    [s.lon - h + jitter(), s.lat + h + jitter()],
    [s.lon + h + jitter(), s.lat + h + jitter()],
    [s.lon + h + jitter(), s.lat - h + jitter()],
    [s.lon - h + jitter(), s.lat - h + jitter()],
  ];
  return [...pts, pts[0]];
}

export function fixtureTerritories(type: TerritoryType): TerritoryCollection {
  const features: TerritoryFeature[] = seeds(type).map((s) => ({
    type: "Feature",
    properties: {
      territory_type: type,
      territory_id: s.id,
      territory_name: s.name,
      pfafstetter_level: type === "hydro_unit" ? 5 : null,
      source: "MUESTRA (geometría aproximada)",
    },
    geometry: { type: "Polygon", coordinates: [boxOf(s)] },
  }));
  return { schema_version: "1.0", type: "FeatureCollection", features };
}

/** Centroide del territorio: lo usa la simulación de Fase 2. */
export function territoryCenter(type: TerritoryType, id: string): { lat: number; lon: number } | null {
  const s = findSeed(type, id);
  return s ? { lat: s.lat, lon: s.lon } : null;
}

export function territoryName(type: TerritoryType, id: string): string | null {
  return findSeed(type, id)?.name ?? null;
}

/* -------------------------------------------------------------------------- */
/* Física mínima de la muestra                                                */
/* -------------------------------------------------------------------------- */

/**
 * Qué DEM corresponde al año, según `dem_by_epoch` de los metadatos.
 * MODIS cae en la época de NASADEM; VIIRS en la de Copernicus.
 */
export function demSourceForYear(year: number): string {
  return year <= 2011 ? "NASADEM_HGT_001" : "COPERNICUS_DEM_GLO30";
}

/**
 * Promedio de viento por componentes. **Nunca** se promedian los ángulos:
 * la media de 350° y 10° es 0°, no 180°.
 */
export function windFromComponents(u: number, v: number): { dir: number; speed: number } {
  return {
    dir: ((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360,
    speed: Math.sqrt(u * u + v * v),
  };
}

/** Estacionalidad: el estiaje de la selva cae entre agosto y octubre. */
function seasonal(month: number): number {
  return 0.5 + 0.5 * Math.cos(((month - 9) / 12) * 2 * Math.PI);
}

/* -------------------------------------------------------------------------- */
/* Fila diaria                                                                */
/* -------------------------------------------------------------------------- */

function dailyRow(type: TerritoryType, id: string, sensor: Sensor, date: string): DailyRow {
  const s = findSeed(type, id);
  const { year, month } = splitIso(date);
  const r = rnd("daily", type, id, sensor, date);

  const expected = Math.round(260 + (s ? s.size * 240 : 200));

  // Un día de cada diez se queda sin observación útil: nubes o sobrevuelo.
  // Eso es `0` píxeles válidos y cobertura `0`, nunca «cero fuego».
  const unobserved = r() < 0.1;
  const coverage = unobserved ? 0 : 0.55 + r() * 0.45;
  const valid = unobserved ? 0 : Math.round(expected * coverage);

  const push = (s?.bias ?? 0.3) * seasonal(month);
  const high = unobserved ? null : r() < push * 0.55 ? Math.round(r() * push * 14) : 0;
  const low = unobserved ? null : high === null ? null : Math.round((high ?? 0) * 0.4 + (r() < 0.3 ? 1 : 0));

  // Nubes densas invalidan la LST: la temperatura de superficie llega nula.
  // Esa es la regla del <30 % de píxeles válidos del documento técnico.
  const lstBlocked = unobserved || r() < 0.22;

  const baseT = 30 - (s ? s.elevation / 220 : 4);
  const tAmb = baseT + seasonal(month) * 4 + (r() - 0.5) * 3;

  const u = (r() - 0.5) * 7;
  const v = (r() - 0.5) * 7;
  const wind = windFromComponents(u, v);

  return {
    date,
    territory_type: type,
    territory_id: id,
    sensor,
    fire_pixels_low: low,
    fire_pixels_nominal_high: high,
    valid_land_pixels: valid,
    expected_land_pixels_per_day: expected,
    observation_coverage: Number(coverage.toFixed(4)),
    activity_rate: valid > 0 && high !== null ? Number((high / valid).toFixed(6)) : null,
    t_amb_c: Number(tAmb.toFixed(1)),
    t_suelo_c: lstBlocked ? null : Number((tAmb + 6 + r() * 7).toFixed(1)),
    wind_dir_deg: Number(wind.dir.toFixed(1)),
    wind_speed_10m_ms: Number(wind.speed.toFixed(2)),
    elevation_m: s ? s.elevation : null,
    dem_source: demSourceForYear(year),
    source_product:
      sensor === "MODIS_TERRA" ? "MOD14A1" : sensor === "MODIS_AQUA" ? "MYD14A1" : "VNP14A1",
    processing_version: "muestra-0.2.0",
  };
}

/* -------------------------------------------------------------------------- */
/* /metadata                                                                  */
/* -------------------------------------------------------------------------- */

export function fixtureMetadata(): Metadata {
  const ranges = (sensor: Sensor) => [{ from: SENSOR_SINCE[sensor], to: LAST_DAY }];

  const periods = (sensor: Sensor) => {
    const out: string[] = [];
    const a = splitIso(SENSOR_SINCE[sensor]);
    let y = a.year;
    let m = a.month;
    while (y < FIXTURE_LAST_YEAR || (y === FIXTURE_LAST_YEAR && m <= FIXTURE_LAST_MONTH)) {
      out.push(`${y}-${pad2(m)}`);
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
    return out;
  };

  const common = [{ from: SENSOR_SINCE.VIIRS_SNPP, to: LAST_DAY }];

  return {
    schema_version: "1.0",
    data_origin: FIXTURE_ORIGIN,
    notice: FIXTURE_NOTICE,
    generated_at: new Date().toISOString(),
    processing_version: "muestra-0.2.0",
    territory_types: ["province", "hydro_unit"],
    sensors: [
      {
        id: "MODIS_TERRA",
        product: "MOD14A1",
        overpass_local: "~10:30",
        available_since: "2000-02",
        resolution: "1 km",
      },
      {
        id: "MODIS_AQUA",
        product: "MYD14A1",
        overpass_local: "~13:30",
        available_since: "2002-07",
        resolution: "1 km",
      },
      {
        id: "VIIRS_SNPP",
        product: "VNP14A1",
        overpass_local: "~13:30",
        available_since: "2012-01",
        resolution: "1 km",
      },
    ],
    available_date_ranges_by_sensor: {
      MODIS_TERRA: ranges("MODIS_TERRA"),
      MODIS_AQUA: ranges("MODIS_AQUA"),
      VIIRS_SNPP: ranges("VIIRS_SNPP"),
    },
    available_periods_by_sensor: {
      MODIS_TERRA: periods("MODIS_TERRA"),
      MODIS_AQUA: periods("MODIS_AQUA"),
      VIIRS_SNPP: periods("VIIRS_SNPP"),
    },
    // Las variables ambientales y la comparación solo existen donde los tres
    // sensores coinciden: desde que VIIRS entra en órbita.
    common_environmental_dates: common,
    common_environmental_periods: periods("VIIRS_SNPP"),
    common_analysis_dates: common,
    common_analysis_periods: periods("VIIRS_SNPP"),
    metrics: {
      activity: [
        "activity_rate",
        "fire_pixel_days_8_9",
        "active_days",
        "max_consecutive_active_days",
        "observation_coverage",
      ],
      environmental: ["t_amb_c", "t_suelo_c", "wind_dir_deg", "wind_speed_10m_ms", "elevation_m"],
      classification: ["conditions_classification"],
    },
    units: {
      activity_rate: "píxeles-día detectados / píxeles-día válidos (adimensional)",
      observation_coverage: "fracción 0–1",
      fire_pixel_days_8_9: "píxeles-día",
      active_days: "días",
      max_consecutive_active_days: "días",
      t_amb_c: "°C",
      t_suelo_c: "°C",
      wind_dir_deg: "grados (0–360, desde dónde sopla)",
      wind_speed_10m_ms: "m/s",
      elevation_m: "m s.n.m.",
    },
    dem_by_epoch: [
      {
        epoch: "2000-2011",
        applies_to: "MODIS",
        dem_source: "NASADEM_HGT_001 / USGS_SRTMGL1_003",
        resolution: "30 m",
      },
      {
        epoch: "2012-presente",
        applies_to: "VIIRS",
        dem_source: "COPERNICUS_DEM_GLO30",
        resolution: "30 m",
      },
    ],
    environmental_sources: {
      t_amb_c: "ECMWF/ERA5_LAND/HOURLY (temperature_2m)",
      t_suelo_c: "MODIS/061/MOD11A1, MYD11A1; NASA/VIIRS/002/VNP21A1D, VNP21A1N",
      wind: "ECMWF/ERA5_LAND/HOURLY (u/v_component_of_wind_10m)",
    },
    parameters: {
      min_observation_coverage_for_comparison: 0.5,
      elevated_signal_robust_z: 2,
      min_baseline_years: 5,
      umbral_veg_pct: null,
      umbral_pend_pct: null,
      note: "Umbrales de muestra; los reales los definen Tom y Angelo.",
    },
    limitations: [
      "activity_rate no es probabilidad de incendio ni superficie quemada.",
      "No se suman conteos entre sensores.",
      "La susceptibilidad contextual es cualitativa, no un índice validado de riesgo.",
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* /territories/{type}/{id}/activity                                          */
/* -------------------------------------------------------------------------- */

export function fixtureActivity(q: {
  type: TerritoryType;
  id: string;
  sensor: Sensor;
  from: string;
  to: string;
}): { items: DailyRow[] } {
  const items: DailyRow[] = [];
  const a = splitIso(q.from);
  const b = splitIso(q.to);
  let y = a.year;
  let m = a.month;
  let d = a.day;

  // Se recorre día a día en UTC para no arrastrar el huso local.
  while (y < b.year || (y === b.year && (m < b.month || (m === b.month && d <= b.day)))) {
    const date = `${y}-${pad2(m)}-${pad2(d)}`;
    if (sensorAvailableOn(q.sensor, date)) items.push(dailyRow(q.type, q.id, q.sensor, date));
    d += 1;
    if (d > daysInMonth(y, m)) {
      d = 1;
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  }
  return { items };
}

/* -------------------------------------------------------------------------- */
/* Resumen del período y susceptibilidad                                      */
/* -------------------------------------------------------------------------- */

function summaryOfPeriod(type: TerritoryType, id: string, sensor: Sensor, period: string) {
  const [y, m] = period.split("-").map(Number);
  const { from, to } = monthRange(y, m);
  const rows = fixtureActivity({ type, id, sensor, from, to }).items;

  const observed = rows.filter((r) => (r.valid_land_pixels ?? 0) > 0);
  const high = observed.reduce((s, r) => s + (r.fire_pixels_nominal_high ?? 0), 0);
  const valid = observed.reduce((s, r) => s + (r.valid_land_pixels ?? 0), 0);
  const expected = rows.reduce((s, r) => s + (r.expected_land_pixels_per_day ?? 0), 0);

  let streak = 0;
  let best = 0;
  let active = 0;
  for (const r of rows) {
    if ((r.fire_pixels_nominal_high ?? 0) > 0) {
      active += 1;
      streak += 1;
      best = Math.max(best, streak);
    } else {
      streak = 0;
    }
  }

  // La anomalía robusta exige años de línea base. Antes de cumplirlos no se
  // inventa un número: se devuelve `insufficient_baseline`.
  const r = rnd("anom", type, id, sensor, period);
  const baselineYears = Math.max(0, y - 2000 - (sensor === "VIIRS_SNPP" ? 12 : 0));
  const enough = baselineYears >= 5;

  return {
    rows,
    activity: {
      fire_pixel_days_8_9: high,
      active_days: active,
      max_consecutive_active_days: best,
      activity_rate: valid > 0 ? Number((high / valid).toFixed(6)) : null,
      observation_coverage: expected > 0 ? Number((valid / expected).toFixed(4)) : null,
      historical_anomaly: {
        value: enough ? Number(((r() - 0.3) * 3.4).toFixed(1)) : null,
        status: (enough ? "estimated" : "insufficient_baseline") as "estimated" | "insufficient_baseline",
        baseline_years: Math.min(baselineYears, 26),
      },
    },
  };
}

/**
 * Árbol de decisión de susceptibilidad contextual, en su forma de muestra.
 *
 * Reproduce el camino N0 → N1 → N2 → N3a/N3b del documento técnico. N0 es la
 * puerta de calidad: si no pasa, nada más se evalúa y el resultado es
 * `not_evaluable`. Lo que sale de aquí es cualitativo y describe el terreno,
 * no pronostica ignición ni propagación.
 */
function conditionsOfPeriod(type: TerritoryType, id: string, period: string) {
  const s = findSeed(type, id);
  const [, m] = period.split("-").map(Number);
  const r = rnd("cond", type, id, period);

  const veg = Math.round((s ? 20 + s.bias * 70 : 40) + (r() - 0.5) * 14);
  const precip30 = Math.round((1 - seasonal(m)) * 120 + r() * 30);
  const windP = Number((1.2 + r() * 4.5).toFixed(1));
  const tAmb = Number(((s ? 30 - s.elevation / 220 : 24) + seasonal(m) * 4).toFixed(1));
  const slope = Math.round((s ? s.elevation / 120 : 10) + r() * 12);

  const path: string[] = [];
  const triggered: string[] = [];
  const modifiers: string[] = [];
  const missing: string[] = [];

  // N0 — ¿hay con qué evaluar?
  const quality = r();
  if (quality < 0.08) {
    path.push("N0:fail");
    missing.push("vegetation_area_pct", "precip_30d_mm");
    return {
      classification: "not_evaluable" as Classification,
      decision_path: path,
      factors: [],
      modifiers,
      missing_variables: missing,
    };
  }
  path.push("N0:pass");

  // N1 — ¿hay vegetación que pueda arder?
  const hasVeg = veg >= 35;
  path.push(`N1:${hasVeg ? "yes" : "no"}`);
  if (hasVeg) triggered.push("vegetation_present");

  // N2 — ¿viene seco respecto de su propia estación?
  const dry = precip30 < 45;
  path.push(`N2:${dry ? "yes" : "no"}`);
  if (dry) triggered.push("dryness_high");

  // N3a — viento; N3b — pendiente.
  const windy = windP > 3.4;
  const steep = slope > 18;
  path.push(`N3a:${windy ? "yes" : "no"}`);
  path.push(`N3b:${steep ? "yes" : "no"}`);
  if (windy) triggered.push("wind_above_seasonal_p75");
  if (steep) triggered.push("slope_above_threshold");
  if (tAmb > 28) modifiers.push("thermal_history_elevated");

  const score = (hasVeg ? 2 : 0) + (dry ? 2 : 0) + (windy ? 1 : 0) + (steep ? 1 : 0);
  const classification: Classification =
    quality < 0.16 ? "partial" : score >= 5 ? "high" : score >= 3 ? "moderate" : "low";

  return {
    classification,
    decision_path: path,
    factors: [
      {
        variable: "vegetation_area_pct",
        value: veg,
        unit: "%",
        rule_status: hasVeg ? "above_umbral_veg" : "below_umbral_veg",
        source_product: "MAPBIOMAS_PERU_C4",
        source_period: "2024",
        source_resolution: "30 m",
      },
      {
        variable: "precip_30d_mm",
        value: precip30,
        unit: "mm",
        rule_status: dry ? "below_seasonal_p25" : "above_seasonal_p25",
        source_product: "ERA5_LAND_HOURLY",
        source_period: period,
        source_resolution: "~11.1 km",
      },
      {
        variable: "wind_speed_10m_ms",
        value: windP,
        unit: "m/s",
        rule_status: windy ? "above_seasonal_p75" : "not_above_seasonal_p75",
        source_product: "ERA5_LAND_HOURLY",
        source_period: period,
        source_resolution: "~11.1 km",
      },
      {
        variable: "slope_pct",
        value: slope,
        unit: "%",
        rule_status: steep ? "above_umbral_pend" : "below_umbral_pend",
        source_product: demSourceForYear(Number(period.slice(0, 4))),
        source_period: period,
        source_resolution: "30 m",
      },
      {
        variable: "temperature_2m_c",
        value: tAmb,
        unit: "°C",
        rule_status: tAmb > 28 ? "above_seasonal_p75" : "not_above_seasonal_p75",
        source_product: "ERA5_LAND_HOURLY",
        source_period: period,
        source_resolution: "~11.1 km",
      },
    ],
    modifiers,
    missing_variables: missing,
    rules_triggered: triggered,
  };
}

/* -------------------------------------------------------------------------- */
/* /territories/{type}/{id}/summary                                           */
/* -------------------------------------------------------------------------- */

export function fixtureSummary(q: {
  type: TerritoryType;
  id: string;
  sensor: Sensor;
  date: string;
}): TerritorySummary {
  const period = periodOf(q.date);
  const { activity } = summaryOfPeriod(q.type, q.id, q.sensor, period);
  const cond = conditionsOfPeriod(q.type, q.id, period);
  const daily = sensorAvailableOn(q.sensor, q.date)
    ? dailyRow(q.type, q.id, q.sensor, q.date)
    : null;

  const cov = activity.observation_coverage ?? 0;
  const status = cov >= 0.7 ? "usable" : cov >= 0.4 ? "partial" : "insufficient";

  return {
    schema_version: "1.0",
    territory: { type: q.type, id: q.id, name: territoryName(q.type, q.id) },
    date: q.date,
    period: { id: period },
    sensor: q.sensor,
    daily,
    activity,
    environmental_conditions: {
      classification: cond.classification,
      decision_path: cond.decision_path,
      factors: cond.factors,
      modifiers: cond.modifiers,
      missing_variables: cond.missing_variables,
    },
    data_quality: {
      status,
      notes:
        status === "usable"
          ? []
          : ["Cobertura de observación por debajo de lo deseable para este período."],
    },
    provenance: {
      source_products: [daily?.source_product ?? "MOD14A1", "ERA5_LAND_HOURLY"],
      generated_at: new Date().toISOString(),
      processing_version: "muestra-0.2.0",
    },
  };
}

/* -------------------------------------------------------------------------- */
/* /territory-metrics  (coropleta)                                            */
/* -------------------------------------------------------------------------- */

export function fixtureTerritoryMetrics(q: {
  type: TerritoryType;
  metric: MetricId;
  date: string;
  sensor?: Sensor;
}): MetricResponse {
  const period = periodOf(q.date);
  const meta = fixtureMetadata();

  const items: MetricItem[] = seeds(q.type).map((s) => {
    let value: number | string | null = null;

    if (q.metric === "conditions_classification") {
      value = conditionsOfPeriod(q.type, s.id, period).classification;
    } else if ((["t_amb_c", "t_suelo_c", "wind_dir_deg", "wind_speed_10m_ms", "elevation_m"] as string[]).includes(q.metric)) {
      // Variables ambientales: no dependen del sensor. Se toma el primero que
      // publique ese día solo para tener de dónde leerlas.
      const sensor = q.sensor ?? SENSORS.find((x) => sensorAvailableOn(x, q.date)) ?? "MODIS_TERRA";
      const row = sensorAvailableOn(sensor, q.date) ? dailyRow(q.type, s.id, sensor, q.date) : null;
      value = row ? ((row as unknown as Record<string, number | null>)[q.metric] ?? null) : null;
    } else {
      const sensor = q.sensor ?? "MODIS_TERRA";
      if (!sensorAvailableOn(sensor, q.date)) {
        value = null;
      } else if (q.metric === "activity_rate" || q.metric === "observation_coverage") {
        const row = dailyRow(q.type, s.id, sensor, q.date);
        value = row[q.metric];
      } else {
        const a = summaryOfPeriod(q.type, s.id, sensor, period).activity;
        value = (a as unknown as Record<string, number | null>)[q.metric] ?? null;
      }
    }

    return { territory_type: q.type, territory_id: s.id, value };
  });

  return {
    schema_version: "1.0",
    date: q.date,
    period,
    metric: q.metric,
    unit: meta.units[q.metric] ?? null,
    items,
  };
}

/* -------------------------------------------------------------------------- */
/* /territories/{type}/{id}/sensor-comparison                                 */
/* -------------------------------------------------------------------------- */

export function fixtureSensorComparison(q: {
  type: TerritoryType;
  id: string;
  date: string;
}): SensorComparison {
  const period = periodOf(q.date);
  const minCov = fixtureMetadata().parameters.min_observation_coverage_for_comparison ?? 0.5;

  const sensors: Partial<Record<Sensor, SensorSignal>> = {};
  const usable: ("elevated" | "not_elevated")[] = [];

  for (const s of SENSORS) {
    if (!sensorAvailableOn(s, q.date)) {
      sensors[s] = {
        available: false,
        activity_rate: null,
        historical_anomaly: null,
        observation_coverage: null,
        signal_status: null,
      };
      continue;
    }
    const a = summaryOfPeriod(q.type, q.id, s, period).activity;
    const cov = a.observation_coverage ?? 0;
    const anom = a.historical_anomaly.value;

    // Sin cobertura suficiente la señal no se declara: queda `null`, que la
    // interfaz rotula «Sin datos». No se rellena con «sin elevación».
    const signal: SignalStatus = cov < minCov || anom === null ? null : anom >= 2 ? "elevated" : "not_elevated";
    if (signal) usable.push(signal);

    sensors[s] = {
      available: true,
      activity_rate: a.activity_rate,
      historical_anomaly: anom,
      observation_coverage: a.observation_coverage,
      signal_status: signal,
    };
  }

  let status: ComparisonStatus;
  if (usable.length === 0) status = "insufficient";
  else if (usable.length === 1) status = "single_sensor";
  else if (usable.every((x) => x === "elevated")) status = "concordant_elevated";
  else if (usable.every((x) => x === "not_elevated")) status = "concordant_not_elevated";
  else status = "discordant";

  const interpretation: Record<ComparisonStatus, string> = {
    concordant_elevated:
      "[MUESTRA] Los sensores utilizables coinciden en una señal elevada para esta época del año.",
    concordant_not_elevated:
      "[MUESTRA] Los sensores utilizables coinciden en que no hay elevación respecto de su propia estación.",
    discordant:
      "[MUESTRA] Los sensores no coinciden; revisar cobertura, hora de sobrevuelo y diferencias instrumentales antes de concluir.",
    single_sensor:
      "[MUESTRA] Solo un sensor alcanza la cobertura mínima: la señal no se puede contrastar.",
    insufficient:
      "[MUESTRA] Ningún sensor alcanza la cobertura mínima en este período: no hay comparación posible.",
  };

  return {
    schema_version: "1.0",
    date: q.date,
    period_id: period,
    territory_type: q.type,
    territory_id: q.id,
    status,
    sensors,
    interpretation: interpretation[status],
    method_version: "muestra-0.2.0",
  };
}

/* -------------------------------------------------------------------------- */
/* /territories/{type}/{id}/hotspots                                          */
/* -------------------------------------------------------------------------- */

/** Focos repartidos dentro de la caja del territorio, para el mapa. */
export function fixtureHotspots(q: {
  type: TerritoryType;
  id: string;
  date: string;
  sensor: Sensor;
}): HotspotCollection {
  const s = findSeed(q.type, q.id);
  if (!s || !sensorAvailableOn(q.sensor, q.date)) {
    return { schema_version: "1.0", type: "FeatureCollection", features: [] };
  }

  const row = dailyRow(q.type, q.id, q.sensor, q.date);
  const n = row.fire_pixels_nominal_high ?? 0;
  const nLow = row.fire_pixels_low ?? 0;
  const r = rnd("hs", q.type, q.id, q.sensor, q.date);
  const h = s.size / 2;

  const make = (high: boolean): HotspotFeature => ({
    type: "Feature",
    properties: {
      date: q.date,
      sensor: q.sensor,
      territory_type: q.type,
      territory_id: q.id,
      confidence: high ? (r() < 0.5 ? 8 : 9) : 7,
      frp_mw: Number((2 + r() * 48).toFixed(1)),
    },
    geometry: {
      type: "Point",
      coordinates: [s.lon + (r() - 0.5) * h * 1.7, s.lat + (r() - 0.5) * h * 1.7],
    },
  });

  const features = [
    ...Array.from({ length: n }, () => make(true)),
    ...Array.from({ length: nLow }, () => make(false)),
  ];
  return { schema_version: "1.0", type: "FeatureCollection", features };
}
