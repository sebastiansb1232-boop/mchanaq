/**
 * Tipos del contrato `/api/v1` — versión 1.2 · `schema_version: "1.0"`.
 *
 * Fuente de verdad: `contracts/api-contract.md`, `docs/harness/*` y los
 * fixtures de `data/fixtures/`. Nadie cambia aquí un nombre, un tipo o una
 * unidad por su cuenta: primero se corrige el contrato (ver §8 del contrato).
 *
 * Dos reglas gobiernan todo este archivo:
 *
 *  1. `null` nunca es `0`. `null` es «no se sabe»; `0` es «se observó y no
 *     hubo detecciones». De ahí que casi todo valor numérico sea `| null`.
 *  2. La API no calcula tasas, anomalías ni categorías, y **el frontend
 *     tampoco**. Lo que se pinta viene tal cual de `data/processed/`.
 */

/** Versión del esquema que esta interfaz sabe leer. */
export const SCHEMA_VERSION = "1.0";

/* -------------------------------------------------------------------------- */
/* Enumerados (§6 del contrato)                                               */
/* -------------------------------------------------------------------------- */

export type TerritoryType = "province" | "hydro_unit";
export const TERRITORY_TYPES: TerritoryType[] = ["province", "hydro_unit"];

/** Un sensor por consulta. Los conteos **nunca** se suman entre sensores. */
export type Sensor = "MODIS_TERRA" | "MODIS_AQUA" | "VIIRS_SNPP";
export const SENSORS: Sensor[] = ["MODIS_TERRA", "MODIS_AQUA", "VIIRS_SNPP"];

export type Classification = "high" | "moderate" | "low" | "partial" | "not_evaluable";
export type ComparisonStatus =
  | "concordant_elevated"
  | "concordant_not_elevated"
  | "discordant"
  | "single_sensor"
  | "insufficient";
export type SignalStatus = "elevated" | "not_elevated" | null;
export type AnomalyStatus = "estimated" | "insufficient_baseline" | "not_estimable";
export type DataQualityStatus = "usable" | "partial" | "insufficient";

/* -------------------------------------------------------------------------- */
/* Métricas                                                                   */
/* -------------------------------------------------------------------------- */

/** Métricas de actividad: **exigen** `sensor`. */
export type ActivityMetric =
  | "activity_rate"
  | "fire_pixel_days_8_9"
  | "active_days"
  | "max_consecutive_active_days"
  | "observation_coverage";

/** Métricas ambientales diarias: `sensor` es opcional. */
export type EnvMetric = "t_amb_c" | "t_suelo_c" | "wind_dir_deg" | "wind_speed_10m_ms" | "elevation_m";

export type MetricId = ActivityMetric | EnvMetric | "conditions_classification";

export const ACTIVITY_METRICS: ActivityMetric[] = [
  "activity_rate",
  "fire_pixel_days_8_9",
  "active_days",
  "max_consecutive_active_days",
  "observation_coverage",
];

export const ENV_METRICS: EnvMetric[] = [
  "t_amb_c",
  "t_suelo_c",
  "wind_dir_deg",
  "wind_speed_10m_ms",
  "elevation_m",
];

/* -------------------------------------------------------------------------- */
/* Fila diaria (`activity_daily.json`)                                        */
/* -------------------------------------------------------------------------- */

/** Variables ambientales de un día. Todas pueden faltar. */
export interface DailyEnv {
  /** Temperatura del aire a 2 m, °C — ERA5-Land `temperature_2m`. */
  t_amb_c: number | null;
  /** Temperatura de la superficie, °C — LST de MODIS/VIIRS. `null` si hubo nubes. */
  t_suelo_c: number | null;
  /** Dirección del viento, grados 0–360, **desde dónde sopla**. */
  wind_dir_deg: number | null;
  /** Velocidad del viento a 10 m, m/s. */
  wind_speed_10m_ms: number | null;
  /** Elevación media, m s.n.m. */
  elevation_m: number | null;
  /** Qué DEM se usó: depende de la época (ver `dem_by_epoch`). */
  dem_source: string | null;
}

/** Una fila de la serie diaria, tal como la devuelve la API. */
export interface DailyRow extends DailyEnv {
  date: string;
  territory_type?: TerritoryType;
  territory_id?: string;
  sensor?: Sensor;
  /** Detecciones de confianza baja (clase 7). Se informan aparte, no se suman. */
  fire_pixels_low: number | null;
  /** Detecciones nominal/alta (clases 8–9): la señal que se usa. */
  fire_pixels_nominal_high: number | null;
  /** Píxeles de tierra válidos observados ese día. `0` → día sin observación. */
  valid_land_pixels: number | null;
  /** Píxeles de tierra que cabría esperar en un día de cobertura completa. */
  expected_land_pixels_per_day: number | null;
  /** Fracción 0–1 de lo que alcanzó a ver el satélite. */
  observation_coverage: number | null;
  /** Tasa diaria, adimensional. La calcula el backend, no esta interfaz. */
  activity_rate: number | null;
  source_product?: string | null;
  processing_version?: string | null;
}

/** Un día sin observación no es «cero fuego»: se rotula «Sin observación». */
export function isUnobserved(row: Pick<DailyRow, "valid_land_pixels" | "observation_coverage">): boolean {
  return (row.valid_land_pixels ?? 0) === 0 || (row.observation_coverage ?? 0) === 0;
}

/* -------------------------------------------------------------------------- */
/* Resumen del período (`activity_summary.json`)                              */
/* -------------------------------------------------------------------------- */

export interface HistoricalAnomaly {
  value: number | null;
  status: AnomalyStatus;
  baseline_years: number;
}

export interface ActivitySummary {
  fire_pixel_days_8_9: number | null;
  active_days: number | null;
  max_consecutive_active_days: number | null;
  activity_rate: number | null;
  observation_coverage: number | null;
  historical_anomaly: HistoricalAnomaly;
}

/* -------------------------------------------------------------------------- */
/* Susceptibilidad contextual (`conditions_assessment.json`)                  */
/* -------------------------------------------------------------------------- */

/** Una variable que el árbol de decisión miró, con su procedencia. */
export interface ConditionFactor {
  variable: string;
  value: number | string | null;
  unit: string | null;
  rule_status: string | null;
  source_product?: string | null;
  source_period?: string | null;
  source_resolution?: string | null;
}

/**
 * Resultado del árbol de decisión. Es una lectura **cualitativa** del
 * terreno: no es probabilidad de ignición ni pronóstico de propagación.
 */
export interface EnvironmentalConditions {
  classification: Classification;
  /** Camino recorrido en el árbol, p. ej. `["N0:pass", "N1:yes", "N3a:no"]`. */
  decision_path: string[];
  factors: ConditionFactor[];
  modifiers: string[];
  missing_variables: string[];
}

/* -------------------------------------------------------------------------- */
/* Ficha del territorio (`/summary`)                                          */
/* -------------------------------------------------------------------------- */

export interface TerritoryRef {
  type: TerritoryType;
  id: string;
  name: string | null;
}

export interface DataQuality {
  status: DataQualityStatus;
  notes: string[];
}

export interface Provenance {
  source_products: string[];
  generated_at: string | null;
  processing_version: string | null;
}

export interface TerritorySummary {
  schema_version: string;
  territory: TerritoryRef;
  date: string | null;
  period: { id: string | null };
  sensor: Sensor;
  /** Fila diaria del día pedido. `null` si se consultó solo por período. */
  daily: DailyRow | null;
  activity: ActivitySummary;
  environmental_conditions: EnvironmentalConditions;
  data_quality?: DataQuality;
  provenance?: Provenance;
}

/* -------------------------------------------------------------------------- */
/* Comparación entre sensores (`/sensor-comparison`)                          */
/* -------------------------------------------------------------------------- */

export interface SensorSignal {
  available: boolean;
  activity_rate: number | null;
  historical_anomaly: number | null;
  observation_coverage: number | null;
  signal_status: SignalStatus;
}

export interface SensorComparison {
  schema_version: string;
  date?: string | null;
  period_id: string | null;
  territory_type: TerritoryType;
  territory_id: string;
  status: ComparisonStatus;
  sensors: Partial<Record<Sensor, SensorSignal>>;
  interpretation: string | null;
  method_version?: string | null;
}

/* -------------------------------------------------------------------------- */
/* Territorios y coropleta                                                    */
/* -------------------------------------------------------------------------- */

export interface TerritoryProps {
  territory_type: TerritoryType;
  territory_id: string;
  territory_name: string | null;
  pfafstetter_level?: number | null;
  source?: string | null;
}

export interface TerritoryFeature {
  type: "Feature";
  properties: TerritoryProps;
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] };
}

export interface TerritoryCollection {
  schema_version?: string;
  type: "FeatureCollection";
  features: TerritoryFeature[];
}

/** Un valor por territorio, para pintar la coropleta. */
export interface MetricItem {
  territory_type: TerritoryType;
  territory_id: string;
  value: number | string | null;
}

export interface MetricResponse {
  schema_version: string;
  date: string | null;
  period: string | null;
  metric: MetricId;
  unit: string | null;
  items: MetricItem[];
}

/* -------------------------------------------------------------------------- */
/* Focos (`/hotspots`, prioridad 3 — puede no existir)                        */
/* -------------------------------------------------------------------------- */

export interface HotspotProps {
  date: string;
  sensor: Sensor;
  territory_type?: TerritoryType;
  territory_id?: string;
  confidence?: number | string | null;
  frp_mw?: number | null;
}

export interface HotspotFeature {
  type: "Feature";
  properties: HotspotProps;
  geometry: { type: "Point"; coordinates: [number, number] };
}

export interface HotspotCollection {
  schema_version?: string;
  type: "FeatureCollection";
  features: HotspotFeature[];
}

/* -------------------------------------------------------------------------- */
/* Metadatos (`/metadata`)                                                    */
/* -------------------------------------------------------------------------- */

export interface DateRange {
  from: string;
  to: string;
}

export interface SensorMeta {
  id: Sensor;
  product: string;
  overpass_local: string;
  available_since: string;
  resolution: string;
}

export interface DemEpoch {
  epoch: string;
  applies_to: string;
  dem_source: string;
  resolution: string;
}

export interface Parameters {
  min_observation_coverage_for_comparison: number | null;
  elevated_signal_robust_z: number | null;
  min_baseline_years: number | null;
  umbral_veg_pct: number | null;
  umbral_pend_pct: number | null;
  note?: string | null;
}

export interface Metadata {
  schema_version: string;
  /** `"fixture"` avisa que los números son ficticios y no deben presentarse. */
  data_origin?: string | null;
  notice?: string | null;
  generated_at?: string | null;
  processing_version?: string | null;
  territory_types: TerritoryType[];
  sensors: SensorMeta[];
  /** Ojo: es una **lista** de rangos por sensor, no un rango único. */
  available_date_ranges_by_sensor: Partial<Record<Sensor, DateRange[]>>;
  available_periods_by_sensor: Partial<Record<Sensor, string[]>>;
  common_environmental_dates: DateRange[];
  common_environmental_periods: string[];
  common_analysis_dates: DateRange[];
  common_analysis_periods: string[];
  metrics: { activity: string[]; environmental: string[]; classification: string[] };
  units: Record<string, string>;
  dem_by_epoch: DemEpoch[];
  environmental_sources: Record<string, string>;
  parameters: Parameters;
  limitations: string[];
}

/* -------------------------------------------------------------------------- */
/* Errores (§4 del contrato)                                                  */
/* -------------------------------------------------------------------------- */

export type ApiErrorCode =
  | "INVALID_PARAMETER"
  | "NOT_FOUND"
  | "PERIOD_NOT_AVAILABLE"
  | "INTERNAL_ERROR";

export interface ApiErrorBody {
  code: ApiErrorCode | string;
  detail: string;
}

/* -------------------------------------------------------------------------- */
/* Etiquetas visibles — las pone el frontend (§6)                             */
/* -------------------------------------------------------------------------- */

/**
 * Ficha de cada sensor, para rótulos y leyendas.
 *
 * El `color` es **categórico**: distingue de qué sensor viene un foco, no
 * cuánta actividad hay. Las magnitudes van siempre en una rampa perceptual
 * (ver `lib/palette.ts`), nunca en estos tonos.
 */
export const SENSOR_META: Record<
  Sensor,
  {
    label: string;
    long: string;
    short: string;
    product: string;
    resolution: string;
    since: number;
    /** Hora aproximada de paso, en hora local. */
    overpass: string;
    color: string;
  }
> = {
  MODIS_TERRA: {
    label: "MODIS Terra",
    long: "MODIS · Terra",
    short: "TERRA",
    product: "MOD14A1",
    resolution: "1 km",
    since: 2000,
    overpass: "~10:30",
    color: "#f8850c",
  },
  MODIS_AQUA: {
    label: "MODIS Aqua",
    long: "MODIS · Aqua",
    short: "AQUA",
    product: "MYD14A1",
    resolution: "1 km",
    since: 2002,
    overpass: "~13:30",
    color: "#e65c2f",
  },
  VIIRS_SNPP: {
    label: "VIIRS Suomi-NPP",
    long: "VIIRS · Suomi-NPP",
    short: "VIIRS",
    product: "VNP14A1",
    resolution: "1 km",
    since: 2012,
    overpass: "~13:30",
    color: "#d8ff33",
  },
};

export const SENSOR_LABELS = SENSOR_META;

export const TERRITORY_LABELS: Record<TerritoryType, { one: string; many: string }> = {
  province: { one: "Provincia", many: "Provincias" },
  hydro_unit: { one: "Unidad hidrográfica", many: "Cuencas" },
};

export const CLASSIFICATION_LABELS: Record<Classification, string> = {
  high: "Susceptibilidad alta",
  moderate: "Susceptibilidad moderada",
  low: "Susceptibilidad baja",
  partial: "Evaluación parcial",
  not_evaluable: "No evaluable",
};

export const COMPARISON_LABELS: Record<ComparisonStatus, string> = {
  concordant_elevated: "Concordante y elevada",
  concordant_not_elevated: "Concordante, sin elevación",
  discordant: "Discordante entre sensores",
  single_sensor: "Un solo sensor utilizable",
  insufficient: "Información insuficiente",
};

export const ANOMALY_LABELS: Record<AnomalyStatus, string> = {
  estimated: "Estimada",
  insufficient_baseline: "Historial insuficiente",
  not_estimable: "No estimable",
};

export const QUALITY_LABELS: Record<DataQualityStatus, string> = {
  usable: "Utilizable",
  partial: "Parcial",
  insufficient: "Insuficiente",
};

export const SIGNAL_LABELS: Record<"elevated" | "not_elevated", string> = {
  elevated: "Elevada",
  not_elevated: "Sin elevación",
};

export const METRIC_LABELS: Record<MetricId, string> = {
  activity_rate: "Tasa de actividad",
  fire_pixel_days_8_9: "Píxeles-día (8–9)",
  active_days: "Días activos",
  max_consecutive_active_days: "Racha activa máxima",
  observation_coverage: "Cobertura de observación",
  t_amb_c: "Temp. del aire",
  t_suelo_c: "Temp. de la superficie",
  wind_dir_deg: "Dirección del viento",
  wind_speed_10m_ms: "Velocidad del viento",
  elevation_m: "Elevación",
  conditions_classification: "Susceptibilidad contextual",
};

/** Texto para un valor ausente. `null` jamás se muestra como `0`. */
export const NO_DATA = "Sin datos";
export const NO_OBSERVATION = "Sin observación";
export const NOT_ESTIMABLE = "No estimable";

/* -------------------------------------------------------------------------- */
/* Fase 2 — opcional y desacoplada de la Fase 1                               */
/* -------------------------------------------------------------------------- */

/** Escalones de isócronas del recorrido simulado, en horas. */
export const ISOCHRONE_STEPS_H = [6, 12, 24];

export const SPREAD_PHASE = "phase_2_optional" as const;
