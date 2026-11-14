/**
 * Capa de origen de datos.
 *
 * La herramienta pide aquí y no le importa de dónde salga: si `/api/v1`
 * responde, se usa; si no, se sirve el juego de muestra con la misma forma.
 * Cada respuesta viene etiquetada con su `origin`, y la interfaz lo muestra:
 * nadie debería confundir un número de muestra con una observación.
 *
 * Por qué vive separado del cliente: el cliente habla el contrato y nada más;
 * la decisión de «qué hago si no hay servicio» es de producto, no de
 * transporte. Teniéndola en un solo sitio, el día que el backend esté estable
 * se borra este archivo y no se toca ninguna pantalla.
 */

import {
  ApiError,
  fetchActivity,
  fetchHotspots,
  fetchMetadata,
  fetchSensorComparison,
  fetchSummary,
  fetchTerritories,
  fetchTerritoryMetrics,
  isAbort,
  metricNeedsSensor,
  type ActivityResponse,
} from "./client";
import type {
  DailyRow,
  HotspotCollection,
  Metadata,
  MetricId,
  MetricResponse,
  Sensor,
  SensorComparison,
  TerritoryCollection,
  TerritorySummary,
  TerritoryType,
} from "./types";
import {
  fixtureActivity,
  fixtureHotspots,
  fixtureMetadata,
  fixtureSensorComparison,
  fixtureSummary,
  fixtureTerritories,
  fixtureTerritoryMetrics,
} from "../lib/fixtures";

export type Origin = "api" | "fixture";

export interface Sourced<T> {
  data: T;
  origin: Origin;
  /** Presente cuando la API contestó con un código del contrato. */
  error?: ApiError;
}

/**
 * Intenta la API y cae a la muestra.
 *
 * Una cancelación se vuelve a lanzar: el llamador la ignora a propósito y
 * convertirla en datos de muestra haría parpadear la pantalla cada vez que el
 * usuario mueve el control de días.
 *
 * `PERIOD_NOT_AVAILABLE` también se propaga: significa que la fecha es válida
 * pero no está publicada, y eso hay que decirlo, no taparlo con un relleno.
 */
async function sourced<T>(
  live: () => Promise<T>,
  sample: () => T,
  skipApi = false
): Promise<Sourced<T>> {
  // `metadata` ya dijo que esa fecha no está publicada: pedirla sería gastar
  // una llamada para recibir `PERIOD_NOT_AVAILABLE` y descartarla. Se sirve
  // la muestra directamente, siempre rotulada.
  if (skipApi) return { data: sample(), origin: "fixture" };

  try {
    return { data: await live(), origin: "api" };
  } catch (e) {
    if (isAbort(e)) throw e;
    if (e instanceof ApiError && e.isPeriodUnavailable) {
      return { data: sample(), origin: "fixture", error: e };
    }
    return { data: sample(), origin: "fixture", error: e instanceof ApiError ? e : undefined };
  }
}

/* -------------------------------------------------------------------------- */

export function getMetadata(signal?: AbortSignal): Promise<Sourced<Metadata>> {
  return sourced(() => fetchMetadata(signal), fixtureMetadata);
}

export function getTerritories(
  type: TerritoryType,
  signal?: AbortSignal
): Promise<Sourced<TerritoryCollection>> {
  return sourced(
    async () => {
      const c = await fetchTerritories(type, signal);
      // Un backend en pie pero sin geometrías dejaría el mapa en blanco; se
      // prefiere la muestra, rotulada, a una pantalla vacía sin explicación.
      if (!c.features?.length) throw new ApiError("NOT_FOUND", "Sin territorios publicados", 404);
      return c;
    },
    () => fixtureTerritories(type)
  );
}

export function getTerritoryMetrics(
  q: { type: TerritoryType; metric: MetricId; date: string; sensor?: Sensor },
  signal?: AbortSignal,
  skipApi = false
): Promise<Sourced<MetricResponse>> {
  return sourced(
    () =>
      fetchTerritoryMetrics(
        { type: q.type, metric: q.metric, date: q.date, sensor: metricNeedsSensor(q.metric) ? q.sensor : undefined },
        signal
      ),
    () => fixtureTerritoryMetrics(q),
    skipApi
  );
}

export function getSummary(
  q: { type: TerritoryType; id: string; sensor: Sensor; date: string },
  signal?: AbortSignal,
  skipApi = false
): Promise<Sourced<TerritorySummary>> {
  return sourced(() => fetchSummary(q, signal), () => fixtureSummary(q), skipApi);
}

export function getActivity(
  q: { type: TerritoryType; id: string; sensor: Sensor; from: string; to: string },
  signal?: AbortSignal,
  skipApi = false
): Promise<Sourced<{ items: DailyRow[] }>> {
  return sourced<ActivityResponse | { items: DailyRow[] }>(
    () => fetchActivity(q, signal),
    () => fixtureActivity(q),
    skipApi
  );
}

export function getSensorComparison(
  q: { type: TerritoryType; id: string; date: string },
  signal?: AbortSignal,
  skipApi = false
): Promise<Sourced<SensorComparison>> {
  return sourced(() => fetchSensorComparison(q, signal), () => fixtureSensorComparison(q), skipApi);
}

export function getHotspots(
  q: { type: TerritoryType; id: string; date: string; sensor: Sensor },
  signal?: AbortSignal,
  skipApi = false
): Promise<Sourced<HotspotCollection>> {
  return sourced(
    async () => {
      const c = await fetchHotspots(q, signal);
      // `/hotspots` es prioridad 3 y puede no existir: el cliente ya devuelve
      // una colección vacía en ese caso. Vacío de verdad y «no publicado» se
      // ven igual desde aquí, así que se cae a la muestra para que el mapa
      // tenga algo que dibujar, siempre rotulado como muestra.
      if (!c.features?.length) throw new ApiError("NOT_FOUND", "Sin focos publicados", 404);
      return c;
    },
    () => fixtureHotspots(q),
    skipApi
  );
}
