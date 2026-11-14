/**
 * Exportaciones del lado del navegador.
 *
 * Cuando el backend responde, lo que se cita es su `export.csv`: ese archivo
 * lleva `source_product` y `processing_version`, y es el que se puede
 * reproducir. Lo de aquí sirve para trabajar con lo que hay en pantalla,
 * incluso sin servicio, y por eso cada fila arrastra `data_origin`.
 *
 * Dos reglas que se respetan en todos los archivos:
 *
 *  - Un valor desconocido se escribe como **celda vacía**, nunca como `0`.
 *  - Las columnas de la serie diaria van en el mismo orden que el
 *    `export.csv` del contrato, para que los dos archivos sean comparables
 *    columna a columna.
 */

import type { DailyRow, HotspotFeature, Sensor, TerritoryType } from "../api/types";
import type { MonthCell } from "./calendar";

/** Dispara la descarga de un texto como archivo. */
export function download(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Se libera en el siguiente turno: revocarlo de inmediato cancela la
  // descarga en algunos navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Una celda CSV.
 *
 * `null` y `undefined` salen vacíos, que es lo que pide el contrato. Se
 * entrecomilla solo cuando hace falta, y las comillas internas se duplican.
 */
function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(header: string[], rows: unknown[][]): string {
  return [header.join(","), ...rows.map((r) => r.map(cell).join(","))].join("\n");
}

/* -------------------------------------------------------------------------- */
/* Serie diaria                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Mismo orden de columnas que `GET /territories/{type}/{id}/export.csv`
 * (contrato §3.5), más `data_origin` al final para no confundir una fila de
 * muestra con una observación.
 */
const DAILY_HEADER = [
  "date",
  "territory_type",
  "territory_id",
  "sensor",
  "fire_pixels_low",
  "fire_pixels_nominal_high",
  "valid_land_pixels",
  "expected_land_pixels_per_day",
  "observation_coverage",
  "activity_rate",
  "t_amb_c",
  "t_suelo_c",
  "wind_dir_deg",
  "wind_speed_10m_ms",
  "elevation_m",
  "dem_source",
  "source_product",
  "processing_version",
  "data_origin",
];

export function dailyCsv(
  rows: DailyRow[],
  sensor: Sensor,
  territoryId: string,
  territoryType: TerritoryType,
  origin: string
): string {
  return toCsv(
    DAILY_HEADER,
    rows.map((r) => [
      r.date,
      r.territory_type ?? territoryType,
      r.territory_id ?? territoryId,
      r.sensor ?? sensor,
      r.fire_pixels_low,
      r.fire_pixels_nominal_high,
      r.valid_land_pixels,
      r.expected_land_pixels_per_day,
      r.observation_coverage,
      r.activity_rate,
      r.t_amb_c,
      r.t_suelo_c,
      r.wind_dir_deg,
      r.wind_speed_10m_ms,
      r.elevation_m,
      r.dem_source,
      r.source_product,
      r.processing_version,
      origin,
    ])
  );
}

/* -------------------------------------------------------------------------- */
/* Focos                                                                      */
/* -------------------------------------------------------------------------- */

export function hotspotsCsv(features: HotspotFeature[], origin: string): string {
  return toCsv(
    [
      "date",
      "sensor",
      "territory_type",
      "territory_id",
      "latitude",
      "longitude",
      "confidence",
      "frp_mw",
      "data_origin",
    ],
    features.map((f) => {
      // GeoJSON guarda [lon, lat]; en el CSV se escribe latitud primero,
      // que es como se lee en cualquier hoja de cálculo.
      const [lon, latitude] = f.geometry.coordinates;
      return [
        f.properties.date,
        f.properties.sensor,
        f.properties.territory_type,
        f.properties.territory_id,
        latitude,
        lon,
        f.properties.confidence,
        f.properties.frp_mw,
        origin,
      ];
    })
  );
}

/* -------------------------------------------------------------------------- */
/* Calendario                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `anomaly_status` viaja junto a la anomalía a propósito: una celda vacía
 * puede significar «no estimable» o «historial insuficiente», y son cosas
 * distintas a la hora de interpretar el calendario.
 */
export function calendarCsv(cells: MonthCell[], sensor: Sensor, origin: string): string {
  return toCsv(
    [
      "period",
      "year",
      "month",
      "sensor",
      "fire_pixel_days_8_9",
      "fire_pixel_days_7",
      "activity_rate",
      "observation_coverage",
      "active_days",
      "max_consecutive_active_days",
      "unobserved_days",
      "days_with_data",
      "historical_anomaly",
      "anomaly_status",
      "baseline_years",
      "data_origin",
    ],
    cells.map((c) => [
      c.period,
      c.year,
      c.month,
      sensor,
      c.detections,
      c.detections_low,
      c.activity_rate,
      c.observation_coverage,
      c.active_days,
      c.max_consecutive_active_days,
      c.unobserved_days,
      c.days_with_data,
      c.historical_anomaly,
      c.anomaly_status,
      c.baseline_years,
      origin,
    ])
  );
}

/* -------------------------------------------------------------------------- */
/* Área de la Fase 2                                                          */
/* -------------------------------------------------------------------------- */

/** El recorte dibujado, en GeoJSON. Solo alimenta el recorrido simulado. */
export function ringGeoJson(ring: [number, number][], areaKm2: number): string {
  const closed = [...ring];
  const [a, b] = [closed[0], closed[closed.length - 1]];
  if (a[0] !== b[0] || a[1] !== b[1]) closed.push(a);

  return JSON.stringify(
    {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            name: "Área de interés (McHanaq)",
            area_km2: Math.round(areaKm2),
            phase: "phase_2_optional",
            note: "Recorte para el recorrido simulado. No es un límite administrativo.",
          },
          // GeoJSON exige [lon, lat] y el anillo cerrado.
          geometry: { type: "Polygon", coordinates: [closed.map(([lat, lon]) => [lon, lat])] },
        },
      ],
    },
    null,
    2
  );
}
