/**
 * Único punto de contacto con `/api/v1`.
 *
 * Reglas que este módulo respeta al pie de la letra (contrato v1.2):
 *
 *  - Solo `GET`. La API es de solo lectura.
 *  - **El frontend no calcula** tasas, anomalías ni categorías: las pide.
 *  - Una consulta de actividad = **un** sensor. Nunca se suman conteos.
 *  - `null` nunca se convierte en `0` por el camino.
 *  - Las fechas disponibles las decide `metadata`, no esta interfaz.
 *
 * Cuando el backend no responde, la aplicación sigue viva con el juego de
 * muestra de `lib/fixtures.ts`, que imita la **forma** del contrato. Eso se
 * avisa en pantalla con el rótulo «Datos de muestra»: no es lo mismo que un
 * dato real y no debe presentarse como tal.
 */

import type {
  ApiErrorBody,
  DateRange,
  HotspotCollection,
  MetricId,
  MetricResponse,
  Metadata,
  Sensor,
  SensorComparison,
  TerritoryCollection,
  TerritorySummary,
  TerritoryType,
} from "./types";
import { ACTIVITY_METRICS, SCHEMA_VERSION } from "./types";

/* -------------------------------------------------------------------------- */
/* Configuración                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Base de la API. Se fija con `VITE_API_BASE` al compilar (en Render apunta
 * al servicio del backend). En desarrollo, uvicorn en el puerto 8000.
 */
export const API_BASE: string =
  (import.meta.env?.VITE_API_BASE as string | undefined)?.replace(/\/+$/, "") ||
  "http://localhost:8000/api/v1";

/** Cuánto se espera a la API antes de darla por caída. */
const TIMEOUT_MS = 8000;

/* -------------------------------------------------------------------------- */
/* Errores y cancelación                                                      */
/* -------------------------------------------------------------------------- */

/** Error con el `code` del contrato, para que la interfaz pueda reaccionar. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly detail: string,
    readonly http: number
  ) {
    super(detail || code);
    this.name = "ApiError";
  }

  /** La fecha es válida pero no está publicada: no es un fallo del usuario. */
  get isPeriodUnavailable() {
    return this.code === "PERIOD_NOT_AVAILABLE";
  }
  get isNotFound() {
    return this.code === "NOT_FOUND";
  }
}

/**
 * Una petición cancelada no es un error: ocurre cada vez que el usuario
 * cambia de día o de territorio mientras la anterior viajaba.
 */
export function isAbort(e: unknown): boolean {
  if (e instanceof DOMException && e.name === "AbortError") return true;
  return e instanceof Error && (e.name === "AbortError" || e.message === "aborted");
}

/* -------------------------------------------------------------------------- */
/* Transporte                                                                 */
/* -------------------------------------------------------------------------- */

/** Une el `signal` de quien llama con un plazo propio. */
function withTimeout(signal?: AbortSignal): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const relay = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener("abort", relay, { once: true });
  }
  return {
    signal: ctrl.signal,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", relay);
    },
  };
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : "";
}

/** Construye una URL de la API. Se expone porque el CSV se abre en el navegador. */
export function apiUrl(path: string, params: Record<string, string | number | undefined | null> = {}): string {
  return `${API_BASE}${path}${qs(params)}`;
}

async function get<T>(
  path: string,
  params: Record<string, string | number | undefined | null> = {},
  signal?: AbortSignal
): Promise<T> {
  const { signal: s, done } = withTimeout(signal);
  try {
    const res = await fetch(apiUrl(path, params), {
      signal: s,
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      let body: ApiErrorBody | null = null;
      try {
        body = (await res.json()) as ApiErrorBody;
      } catch {
        /* el cuerpo no era JSON: nos quedamos con el código HTTP */
      }
      throw new ApiError(body?.code ?? "INTERNAL_ERROR", body?.detail ?? res.statusText, res.status);
    }

    const data = (await res.json()) as T & { schema_version?: string };

    // Un esquema distinto puede traer campos renombrados: se avisa en consola
    // en vez de pintar datos mal interpretados en silencio.
    if (data?.schema_version && data.schema_version !== SCHEMA_VERSION) {
      console.warn(
        `[McHanaq] schema_version ${data.schema_version} ≠ ${SCHEMA_VERSION} esperada en ${path}. ` +
          `Revisar contracts/api-contract.md antes de confiar en la pantalla.`
      );
    }
    return data;
  } finally {
    done();
  }
}

/* -------------------------------------------------------------------------- */
/* 1 · /health                                                                */
/* -------------------------------------------------------------------------- */

export type BackendState = "checking" | "online" | "offline";

let backendState: BackendState = "checking";
export function getBackendState(): BackendState {
  return backendState;
}

export interface Health {
  status: string;
  data_loaded: boolean;
  data_dir?: string;
}

/**
 * `data_loaded: false` cuenta como caído: el servicio está en pie pero no
 * tiene datos que servir, y pintar una pantalla vacía sería peor que avisar.
 */
export async function probeBackend(signal?: AbortSignal): Promise<BackendState> {
  try {
    const h = await get<Health>("/health", {}, signal);
    backendState = h.status === "ok" && h.data_loaded ? "online" : "offline";
  } catch (e) {
    if (isAbort(e)) return backendState;
    backendState = "offline";
  }
  return backendState;
}

/* -------------------------------------------------------------------------- */
/* 2 · /metadata                                                              */
/* -------------------------------------------------------------------------- */

export function fetchMetadata(signal?: AbortSignal): Promise<Metadata> {
  return get<Metadata>("/metadata", {}, signal);
}

/* -------------------------------------------------------------------------- */
/* 3 · /territories                                                           */
/* -------------------------------------------------------------------------- */

export function fetchTerritories(type: TerritoryType, signal?: AbortSignal): Promise<TerritoryCollection> {
  return get<TerritoryCollection>("/territories", { type }, signal);
}

/* -------------------------------------------------------------------------- */
/* 4 · /territory-metrics  (coropleta)                                        */
/* -------------------------------------------------------------------------- */

/** `sensor` es obligatorio solo para las métricas de actividad. */
export function metricNeedsSensor(metric: MetricId): boolean {
  return (ACTIVITY_METRICS as string[]).includes(metric);
}

export interface MetricQuery {
  type: TerritoryType;
  metric: MetricId;
  /** Diario por defecto. Si se omite, se usa `period`. */
  date?: string;
  period?: string;
  sensor?: Sensor;
}

export function fetchTerritoryMetrics(q: MetricQuery, signal?: AbortSignal): Promise<MetricResponse> {
  return get<MetricResponse>(
    "/territory-metrics",
    {
      type: q.type,
      metric: q.metric,
      date: q.date,
      period: q.date ? undefined : q.period,
      sensor: metricNeedsSensor(q.metric) ? q.sensor : undefined,
    },
    signal
  );
}

/* -------------------------------------------------------------------------- */
/* 5 · /territories/{type}/{id}/summary                                       */
/* -------------------------------------------------------------------------- */

export interface SummaryQuery {
  type: TerritoryType;
  id: string;
  sensor: Sensor;
  date?: string;
  period?: string;
}

export function fetchSummary(q: SummaryQuery, signal?: AbortSignal): Promise<TerritorySummary> {
  return get<TerritorySummary>(
    `/territories/${encodeURIComponent(q.type)}/${encodeURIComponent(q.id)}/summary`,
    { sensor: q.sensor, date: q.date, period: q.date ? undefined : q.period },
    signal
  );
}

/* -------------------------------------------------------------------------- */
/* 6 · /territories/{type}/{id}/activity  (serie diaria)                      */
/* -------------------------------------------------------------------------- */

export interface ActivityQuery {
  type: TerritoryType;
  id: string;
  sensor: Sensor;
  from?: string;
  to?: string;
  period?: string;
}

export interface ActivityResponse {
  schema_version: string;
  territory: { type: TerritoryType; id: string };
  sensor: Sensor;
  from?: string | null;
  to?: string | null;
  period?: string | null;
  items: import("./types").DailyRow[];
}

export function fetchActivity(q: ActivityQuery, signal?: AbortSignal): Promise<ActivityResponse> {
  const byRange = Boolean(q.from && q.to);
  return get<ActivityResponse>(
    `/territories/${encodeURIComponent(q.type)}/${encodeURIComponent(q.id)}/activity`,
    {
      sensor: q.sensor,
      from: byRange ? q.from : undefined,
      to: byRange ? q.to : undefined,
      period: byRange ? undefined : q.period,
    },
    signal
  );
}

/* -------------------------------------------------------------------------- */
/* 7 · /territories/{type}/{id}/sensor-comparison                             */
/* -------------------------------------------------------------------------- */

/**
 * Lo que antes derivaba el frontend ahora lo entrega la API, que es quien
 * conoce la cobertura mínima y el umbral `robust_z`.
 */
export function fetchSensorComparison(
  q: { type: TerritoryType; id: string; date?: string; period?: string },
  signal?: AbortSignal
): Promise<SensorComparison> {
  return get<SensorComparison>(
    `/territories/${encodeURIComponent(q.type)}/${encodeURIComponent(q.id)}/sensor-comparison`,
    { date: q.date, period: q.date ? undefined : q.period },
    signal
  );
}

/* -------------------------------------------------------------------------- */
/* 8 · /territories/{type}/{id}/export.csv                                    */
/* -------------------------------------------------------------------------- */

/** El navegador descarga directo de la API: no pasa por esta interfaz. */
export function exportCsvUrl(q: {
  type: TerritoryType;
  id: string;
  from: string;
  to: string;
  sensor: Sensor;
}): string {
  return apiUrl(`/territories/${encodeURIComponent(q.type)}/${encodeURIComponent(q.id)}/export.csv`, {
    from: q.from,
    to: q.to,
    sensor: q.sensor,
  });
}

/* -------------------------------------------------------------------------- */
/* 9 · /territories/{type}/{id}/hotspots  (prioridad 3)                       */
/* -------------------------------------------------------------------------- */

/**
 * Puede no existir: solo hay respuesta si el backend tiene `hotspots.geojson`.
 * Un `404` aquí es un estado previsto, no una avería, así que devuelve una
 * colección vacía y la interfaz lo rotula.
 */
export async function fetchHotspots(
  q: { type: TerritoryType; id: string; date: string; sensor: Sensor },
  signal?: AbortSignal
): Promise<HotspotCollection> {
  try {
    return await get<HotspotCollection>(
      `/territories/${encodeURIComponent(q.type)}/${encodeURIComponent(q.id)}/hotspots`,
      { date: q.date, sensor: q.sensor },
      signal
    );
  } catch (e) {
    if (e instanceof ApiError && (e.isNotFound || e.isPeriodUnavailable)) {
      return { type: "FeatureCollection", features: [] };
    }
    throw e;
  }
}

/* -------------------------------------------------------------------------- */
/* Disponibilidad de fechas — la decide `metadata` (§5)                       */
/* -------------------------------------------------------------------------- */

function inRanges(date: string, ranges: DateRange[] | undefined): boolean {
  if (!ranges?.length) return false;
  return ranges.some((r) => date >= r.from && date <= r.to);
}

/** ¿Hay datos de ese sensor ese día? (`activity`, `metrics`, `export.csv`) */
export function isDateAvailable(date: string, sensor: Sensor, meta: Metadata | null): boolean {
  if (!meta) return false;
  return inRanges(date, meta.available_date_ranges_by_sensor?.[sensor]);
}

/** ¿Hay variables ambientales ese día? (métricas sin sensor) */
export function isEnvDateAvailable(date: string, meta: Metadata | null): boolean {
  return meta ? inRanges(date, meta.common_environmental_dates) : false;
}

/** ¿Se puede comparar sensores ese día? */
export function isAnalysisDateAvailable(date: string, meta: Metadata | null): boolean {
  return meta ? inRanges(date, meta.common_analysis_dates) : false;
}

/** La ficha exige las dos cosas a la vez: sensor **y** ambiental. */
export function isSummaryDateAvailable(date: string, sensor: Sensor, meta: Metadata | null): boolean {
  return isDateAvailable(date, sensor, meta) && isEnvDateAvailable(date, meta);
}

/**
 * Último día publicado de un sensor.
 *
 * Sirve para abrir la herramienta en una fecha que exista de verdad. Sin
 * esto, la interfaz arranca en «hoy», el backend contesta
 * `PERIOD_NOT_AVAILABLE` para todo y el primer contacto con la aplicación es
 * una pantalla de avisos.
 */
export function lastAvailableDate(sensor: Sensor, meta: Metadata | null): string | null {
  const r = meta?.available_date_ranges_by_sensor?.[sensor];
  return r?.length ? r[r.length - 1].to : null;
}

/** Sensores que publican algo ese día. */
export function sensorsAvailableOn(date: string, meta: Metadata | null): Sensor[] {
  if (!meta) return [];
  return (Object.keys(meta.available_date_ranges_by_sensor ?? {}) as Sensor[]).filter((s) =>
    inRanges(date, meta.available_date_ranges_by_sensor[s])
  );
}

/* -------------------------------------------------------------------------- */
/* Utilidades de fecha                                                        */
/* -------------------------------------------------------------------------- */

export const pad2 = (n: number) => String(n).padStart(2, "0");

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthRange(year: number, month: number): { from: string; to: string } {
  return {
    from: `${year}-${pad2(month)}-01`,
    to: `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}`,
  };
}

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function splitIso(date: string): { year: number; month: number; day: number } {
  const [y, m, d] = date.split("-").map(Number);
  return { year: y, month: m, day: d };
}

export function periodOf(date: string): string {
  return date.slice(0, 7);
}

/** Pares `[año, mes]` entre dos fechas, ambos extremos incluidos. */
export function monthsBetween(from: string, to: string): [number, number][] {
  const a = splitIso(from);
  const b = splitIso(to);
  const out: [number, number][] = [];
  let y = a.year;
  let m = a.month;
  while (y < b.year || (y === b.year && m <= b.month)) {
    out.push([y, m]);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** Suma días a una fecha ISO sin arrastrar husos horarios. */
export function addDays(date: string, days: number): string {
  const { year, month, day } = splitIso(date);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function clampDate(date: string, from: string, to: string): string {
  return date < from ? from : date > to ? to : date;
}
