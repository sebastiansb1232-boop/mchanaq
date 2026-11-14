/**
 * Calendario territorial — capa de **presentación**.
 *
 * El reto pide un calendario de actividad por territorio, pero el contrato
 * v1.2 no tiene un endpoint de serie mensual: tiene la serie diaria
 * (`/activity`) y el resumen de un período dentro de `/summary`. Así que el
 * calendario se arma aquí, agrupando por mes la serie diaria que devuelve la
 * API para **un** territorio y **un** sensor.
 *
 * Qué se agrega y qué no, para no pisar la regla de que el frontend no
 * calcula:
 *
 *  - Sí: sumar píxeles-día y píxeles válidos del **mismo** sensor, contar
 *    días activos y la racha. Son recuentos de lo que ya vino, no un modelo.
 *  - No: la anomalía histórica y los años de línea base. Esos exigen la
 *    distribución de los años anteriores y un umbral (`robust_z`) que vive en
 *    el backend. Aquí llegan como `null` / `not_estimable` y solo se rellenan
 *    cuando `/summary` los entrega para el mes mirado.
 *
 * Nunca se suman conteos entre sensores: cada celda pertenece a un sensor.
 *
 * Pendiente para el equipo: un `GET /territories/{type}/{id}/calendar` con la
 * serie mensual y su anomalía ahorraría traer años de filas diarias y dejaría
 * la anomalía donde corresponde. Anotado en `docs/harness/README.md`.
 */

import type { AnomalyStatus, DailyRow, Sensor } from "../api/types";

/** Una celda del calendario: un mes de un sensor en un territorio. */
export interface MonthCell {
  year: number;
  /** 1 a 12. */
  month: number;
  /** `YYYY-MM`. */
  period: string;
  /** Píxeles-día de confianza nominal/alta (clases 8–9). */
  detections: number;
  /** Píxeles-día de confianza baja (clase 7). Se informan aparte. */
  detections_low: number;
  /** Detectados / válidos. `null` si el mes no tuvo observación válida. */
  activity_rate: number | null;
  /** Válidos / esperados. `null` si no se sabe qué esperar. */
  observation_coverage: number | null;
  active_days: number;
  max_consecutive_active_days: number;
  /** Días del mes en que el satélite no alcanzó a observar. */
  unobserved_days: number;
  /** Días con fila publicada. */
  days_with_data: number;
  /** La entrega el backend; aquí nunca se calcula. */
  historical_anomaly: number | null;
  anomaly_status: AnomalyStatus;
  baseline_years: number;
}

/**
 * Agrupa la serie diaria en celdas mensuales.
 *
 * Las filas tienen que ser de un solo sensor: si llegaran mezcladas se
 * estarían sumando conteos de sensores distintos, que es justamente lo que el
 * documento técnico prohíbe. Por eso el sensor se pasa aparte y se usa para
 * descartar lo que no corresponda.
 */
export function monthlyCells(rows: DailyRow[], sensor: Sensor): MonthCell[] {
  const buckets = new Map<string, DailyRow[]>();

  for (const r of rows) {
    if (r.sensor && r.sensor !== sensor) continue;
    const period = r.date.slice(0, 7);
    const list = buckets.get(period);
    if (list) list.push(r);
    else buckets.set(period, [r]);
  }

  const cells: MonthCell[] = [];

  for (const [period, list] of buckets) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    const [year, month] = period.split("-").map(Number);

    let detections = 0;
    let detectionsLow = 0;
    let valid = 0;
    let expected = 0;
    let activeDays = 0;
    let unobserved = 0;
    let streak = 0;
    let best = 0;

    for (const r of list) {
      const observed = (r.valid_land_pixels ?? 0) > 0;
      if (!observed) {
        unobserved += 1;
        // Un día sin observación corta la racha pero no cuenta como inactivo:
        // no se sabe qué pasó, y rellenarlo con `0` sería inventar.
        streak = 0;
        continue;
      }

      valid += r.valid_land_pixels ?? 0;
      expected += r.expected_land_pixels_per_day ?? 0;
      detections += r.fire_pixels_nominal_high ?? 0;
      detectionsLow += r.fire_pixels_low ?? 0;

      if ((r.fire_pixels_nominal_high ?? 0) > 0) {
        activeDays += 1;
        streak += 1;
        best = Math.max(best, streak);
      } else {
        streak = 0;
      }
    }

    cells.push({
      year,
      month,
      period,
      detections,
      detections_low: detectionsLow,
      activity_rate: valid > 0 ? detections / valid : null,
      observation_coverage: expected > 0 ? valid / expected : null,
      active_days: activeDays,
      max_consecutive_active_days: best,
      unobserved_days: unobserved,
      days_with_data: list.length,
      // La anomalía la pone el backend; `mergeAnomaly` la inyecta si llega.
      historical_anomaly: null,
      anomaly_status: "not_estimable",
      baseline_years: 0,
    });
  }

  return cells.sort((a, b) => a.period.localeCompare(b.period));
}

/**
 * Inyecta en una celda la anomalía que vino de `/summary`.
 *
 * Se aplica solo al mes que el usuario tiene seleccionado, que es el único
 * para el que se pide la ficha. Los demás meses se quedan en
 * `not_estimable`, y el calendario lo refleja en lugar de dar a entender que
 * no hay anomalía.
 */
export function mergeAnomaly(
  cells: MonthCell[],
  period: string,
  anomaly: { value: number | null; status: AnomalyStatus; baseline_years: number } | null
): MonthCell[] {
  if (!anomaly) return cells;
  return cells.map((c) =>
    c.period === period
      ? {
          ...c,
          historical_anomaly: anomaly.value,
          anomaly_status: anomaly.status,
          baseline_years: anomaly.baseline_years,
        }
      : c
  );
}

export function findCell(cells: MonthCell[], year: number, month: number): MonthCell | undefined {
  return cells.find((c) => c.year === year && c.month === month);
}

/** Años presentes en el calendario, de mayor a menor. */
export function yearsOf(cells: MonthCell[]): number[] {
  return [...new Set(cells.map((c) => c.year))].sort((a, b) => b - a);
}

/**
 * Techo para la escala de color: el percentil 95 en vez del máximo, para que
 * un mes excepcional no aplaste el resto de la rampa.
 */
export function scaleTop(cells: MonthCell[], key: "detections" | "activity_rate" = "detections"): number {
  const vals = cells
    .map((c) => (key === "detections" ? c.detections : c.activity_rate))
    .filter((v): v is number => v !== null && v > 0)
    .sort((a, b) => a - b);
  if (!vals.length) return 1;
  return vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.95))] || 1;
}
