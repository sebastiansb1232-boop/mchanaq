import { Drawer } from "./Drawer";
import type { DockItem } from "./DockBar";
import type {
  Classification,
  ComparisonStatus,
  DailyRow,
  Metadata,
  SensorComparison,
  TerritorySummary,
} from "../api/types";
import {
  ANOMALY_LABELS,
  CLASSIFICATION_LABELS,
  COMPARISON_LABELS,
  NO_DATA,
  NO_OBSERVATION,
  NOT_ESTIMABLE,
  QUALITY_LABELS,
  SENSORS,
  SENSOR_META,
  isUnobserved,
} from "../api/types";
import type { MonthCell } from "../lib/calendar";

export const ANALYSIS_ITEMS: DockItem[] = [
  { id: "indicadores", label: "Indicadores del período", icon: "gauge" },
  { id: "multisensor", label: "Comparación multisensor", icon: "compare" },
  { id: "arbol", label: "Árbol de susceptibilidad", icon: "tree" },
];

const STATUS_CHIP: Record<ComparisonStatus, string> = {
  concordant_elevated: "chip chip--ember",
  concordant_not_elevated: "chip chip--term",
  discordant: "chip chip--warn",
  single_sensor: "chip",
  insufficient: "chip",
};

const SUSC_CHIP: Record<Classification, string> = {
  high: "chip chip--ember",
  moderate: "chip chip--warn",
  low: "chip chip--term",
  partial: "chip",
  not_evaluable: "chip",
};

/** Lectura en castellano de cada nodo del árbol de decisión. */
const NODE_TEXT: Record<string, string> = {
  "N0:pass": "Compuerta de calidad superada",
  "N0:fail": "Sin datos suficientes para clasificar",
  "N1:yes": "Vegetación combustible sobre el umbral",
  "N1:no": "Poca vegetación combustible",
  "N2:yes": "Señal de sequedad presente",
  "N2:no": "Sin señal de sequedad",
  "N3a:yes": "Viento por encima de su percentil estacional",
  "N3a:no": "Viento sin elevación estacional",
  "N3b:yes": "Pendiente sobre el umbral",
  "N3b:no": "Pendiente por debajo del umbral",
};

/** Nombre legible de cada variable del árbol. */
const VAR_TEXT: Record<string, string> = {
  vegetation_area_pct: "Vegetación combustible",
  precip_30d_mm: "Precipitación 30 d",
  wind_speed_10m_ms: "Viento a 10 m",
  temperature_2m_c: "Temp. del aire",
  slope_pct: "Pendiente",
  soil_moisture_surface: "Humedad del suelo",
  water_area_pct: "Agua y humedales",
  ndvi_median: "NDVI mediano",
};

interface Props {
  section: string;
  onClose: () => void;
  cell: MonthCell | undefined;
  /** Ficha del territorio tal como la devuelve la API. */
  summary: TerritorySummary | null;
  /** Comparación resuelta por el backend; el frontend no la calcula. */
  comparison: SensorComparison | null;
  /** Fila del día seleccionado. La ficha es diaria (contrato §4). */
  dayRow: DailyRow | null;
  dateIso: string;
  areaLabel: string;
  periodLabel: string;
  metadata: Metadata | null;
}

export function AnalysisRail(p: Props) {
  const minBaseline = p.metadata?.parameters?.min_baseline_years ?? 5;

  switch (p.section) {
    case "indicadores": {
      // El resumen del período viene de la API; la celda del calendario es el
      // respaldo cuando la ficha todavía no llegó.
      const act = p.summary?.activity;
      const rate = act?.activity_rate ?? p.cell?.activity_rate ?? null;
      const cov = act?.observation_coverage ?? p.cell?.observation_coverage ?? null;
      const activeDays = act?.active_days ?? p.cell?.active_days ?? null;
      const streak = act?.max_consecutive_active_days ?? p.cell?.max_consecutive_active_days ?? null;
      const anom = act?.historical_anomaly ?? null;
      const quality = p.summary?.data_quality;
      const unobserved = p.dayRow ? isUnobserved(p.dayRow) : false;

      return (
        <Drawer title="Indicadores" note={p.periodLabel} onClose={p.onClose}>
          {quality && (
            <span className={`chip${quality.status === "usable" ? " chip--term" : " chip--warn"}`}>
              Calidad: {QUALITY_LABELS[quality.status]}
            </span>
          )}

          <div className="metric-grid" style={{ marginTop: quality ? 11 : 0 }}>
            <div className="metric">
              <div className="metric__label">Tasa de actividad</div>
              <div className="metric__value">
                {rate != null ? (
                  <>
                    {(rate * 1000).toFixed(2)}
                    <span className="metric__unit">‰ píxel-día</span>
                  </>
                ) : (
                  <span style={{ fontSize: 15, color: "var(--fg-faint)" }}>{NOT_ESTIMABLE}</span>
                )}
              </div>
            </div>
            <div className="metric">
              <div className="metric__label">Cobertura</div>
              <div className="metric__value">
                {cov != null ? (
                  <>
                    {Math.round(cov * 100)}
                    <span className="metric__unit">%</span>
                  </>
                ) : (
                  <span style={{ fontSize: 15, color: "var(--fg-faint)" }}>{NO_DATA}</span>
                )}
              </div>
            </div>
            <div className="metric">
              <div className="metric__label">Días activos</div>
              <div className="metric__value">{activeDays ?? "—"}</div>
            </div>
            <div className="metric">
              <div className="metric__label">Racha máxima</div>
              <div className="metric__value">
                {streak != null ? (
                  <>
                    {streak}
                    <span className="metric__unit">días</span>
                  </>
                ) : (
                  "—"
                )}
              </div>
            </div>
          </div>

          <div className="legend__title" style={{ marginTop: 15 }}>
            Contexto del día · {p.dateIso}
          </div>

          {unobserved && (
            <div className="note note--warn" style={{ marginBottom: 10 }}>
              <b>{NO_OBSERVATION}.</b> Ese día no hubo píxeles de tierra válidos. No significa que
              no hubiera fuego: significa que el satélite no alcanzó a ver.
            </div>
          )}

          <dl className="kv">
            <dt>Detecciones 8–9</dt>
            <dd data-null={p.dayRow?.fire_pixels_nominal_high == null}>
              {p.dayRow?.fire_pixels_nominal_high != null
                ? p.dayRow.fire_pixels_nominal_high.toLocaleString("es-PE")
                : NO_DATA}
            </dd>
            <dt>Confianza baja (7)</dt>
            <dd data-null={p.dayRow?.fire_pixels_low == null}>
              {p.dayRow?.fire_pixels_low != null
                ? p.dayRow.fire_pixels_low.toLocaleString("es-PE")
                : NO_DATA}
            </dd>
            <dt>Temp. del aire</dt>
            <dd data-null={p.dayRow?.t_amb_c == null}>
              {p.dayRow?.t_amb_c != null ? `${p.dayRow.t_amb_c} °C` : NO_DATA}
            </dd>
            <dt>Temp. de la superficie</dt>
            <dd data-null={p.dayRow?.t_suelo_c == null}>
              {p.dayRow?.t_suelo_c != null
                ? `${p.dayRow.t_suelo_c} °C`
                : p.dayRow
                  ? "Nublado (>30 %)"
                  : NO_DATA}
            </dd>
            <dt>Viento</dt>
            <dd data-null={p.dayRow?.wind_dir_deg == null}>
              {p.dayRow?.wind_dir_deg != null
                ? `${p.dayRow.wind_speed_10m_ms ?? "—"} m/s · ${Math.round(p.dayRow.wind_dir_deg)}° (desde)`
                : NO_DATA}
            </dd>
            <dt>Elevación</dt>
            <dd data-null={p.dayRow?.elevation_m == null}>
              {p.dayRow?.elevation_m != null ? `${p.dayRow.elevation_m} m s.n.m.` : NO_DATA}
            </dd>
            <dt>Modelo DEM</dt>
            <dd data-null={!p.dayRow?.dem_source}>{p.dayRow?.dem_source ?? NO_DATA}</dd>
          </dl>

          <div className="legend__title" style={{ marginTop: 15 }}>Anomalía mensual</div>
          <dl className="kv">
            <dt>Anomalía robusta</dt>
            <dd data-null={anom?.value == null}>
              {anom?.value != null
                ? `z = ${anom.value.toFixed(2)}`
                : anom
                  ? ANOMALY_LABELS[anom.status]
                  : NOT_ESTIMABLE}
            </dd>
            <dt>Años de línea base</dt>
            <dd data-null={!anom?.baseline_years}>
              {anom?.baseline_years
                ? `${anom.baseline_years} (mín. ${minBaseline})`
                : "Historial insuficiente"}
            </dd>
          </dl>

          {p.summary?.provenance && (
            <>
              <div className="legend__title" style={{ marginTop: 15 }}>Procedencia</div>
              <dl className="kv">
                <dt>Productos</dt>
                <dd>{p.summary.provenance.source_products.join(" · ") || NO_DATA}</dd>
                <dt>Versión</dt>
                <dd>{p.summary.provenance.processing_version ?? NO_DATA}</dd>
              </dl>
            </>
          )}

          <p className="mono-sm" style={{ marginTop: 12 }}>
            La tasa normaliza las detecciones por observación válida. No es probabilidad de incendio
            ni superficie quemada. Un <code>0</code> significa «se observó y no hubo detecciones»;
            «{NO_DATA}» significa que no se sabe.
          </p>
        </Drawer>
      );
    }

    case "multisensor": {
      if (!p.comparison) {
        return (
          <Drawer title="Comparación multisensor" note={p.periodLabel} onClose={p.onClose}>
            <div className="note">Sin comparación publicada para esta fecha.</div>
          </Drawer>
        );
      }

      const minCov = p.metadata?.parameters?.min_observation_coverage_for_comparison ?? 0.5;

      return (
        <Drawer title="Comparación multisensor" note={p.periodLabel} onClose={p.onClose}>
          <span className={STATUS_CHIP[p.comparison.status]}>
            {COMPARISON_LABELS[p.comparison.status]}
          </span>

          <table className="cmp" style={{ marginTop: 12 }}>
            <thead>
              <tr><th>Sensor</th><th>Tasa ‰</th><th>z</th><th>Cob.</th></tr>
            </thead>
            <tbody>
              {SENSORS.map((s) => {
                const d = p.comparison?.sensors[s];
                const elevated = d?.signal_status === "elevated";
                return (
                  <tr key={s}>
                    <td>
                      <i className="cmp__dot" style={{ background: SENSOR_META[s].color }} />
                      {SENSOR_META[s].short}
                    </td>
                    <td style={{ color: elevated ? "var(--ember)" : undefined }}>
                      {d?.activity_rate != null ? (d.activity_rate * 1000).toFixed(2) : "—"}
                    </td>
                    <td style={{ color: elevated ? "var(--ember)" : undefined }}>
                      {d?.historical_anomaly != null ? d.historical_anomaly.toFixed(1) : "—"}
                    </td>
                    <td>
                      {d?.observation_coverage != null
                        ? `${Math.round(d.observation_coverage * 100)}%`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Un sensor sin señal declarada no es un sensor «sin elevación»:
              es uno que no alcanzó la cobertura mínima para pronunciarse. */}
          {SENSORS.some((s) => {
            const d = p.comparison?.sensors[s];
            return d?.available && d.signal_status === null;
          }) && (
            <p className="mono-sm" style={{ marginTop: 10 }}>
              Un sensor disponible pero sin señal declarada no llegó a la cobertura mínima
              ({Math.round(minCov * 100)} %): no se puede afirmar nada de él, ni a favor ni en
              contra.
            </p>
          )}

          {p.comparison.interpretation && (
            <div className="note" style={{ marginTop: 12 }}>{p.comparison.interpretation}</div>
          )}

          <p className="mono-sm" style={{ marginTop: 10 }}>
            Cada sensor se clasifica contra su propio umbral estacional antes de compararlos. Nunca
            se suman conteos entre sensores: cambian la hora de sobrevuelo y el instrumento.
          </p>
        </Drawer>
      );
    }

    case "arbol": {
      const cond = p.summary?.environmental_conditions;

      if (!cond) {
        return (
          <Drawer title="Árbol de susceptibilidad" note={p.areaLabel} onClose={p.onClose}>
            <div className="note">Sin evaluación publicada para esta fecha.</div>
          </Drawer>
        );
      }

      return (
        <Drawer title="Árbol de susceptibilidad" note={p.areaLabel} onClose={p.onClose}>
          <span className={SUSC_CHIP[cond.classification]}>
            {CLASSIFICATION_LABELS[cond.classification]}
          </span>

          <ol className="tree" style={{ marginTop: 13 }}>
            {cond.decision_path.map((node) => (
              <li key={node} className="tree__node">
                <code>{node}</code>
                <span>{NODE_TEXT[node] ?? node}</span>
              </li>
            ))}
          </ol>

          {cond.modifiers.length > 0 && (
            <>
              <div className="legend__title" style={{ marginTop: 13 }}>Modificadores informativos</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {cond.modifiers.map((m) => (
                  <span className="chip" key={m}>{m}</span>
                ))}
              </div>
            </>
          )}

          {cond.missing_variables.length > 0 && (
            <div className="note note--warn" style={{ marginTop: 12 }}>
              <b>Faltan variables:</b> {cond.missing_variables.join(", ")}. Por eso la evaluación
              queda parcial en vez de dar un resultado completo.
            </div>
          )}

          {cond.factors.length > 0 && (
            <>
              <div className="legend__title" style={{ marginTop: 14 }}>Evidencia del período</div>
              <dl className="kv">
                {cond.factors.map((f) => (
                  <div key={f.variable} style={{ display: "contents" }}>
                    <dt title={f.source_product ? `Fuente: ${f.source_product}` : undefined}>
                      {VAR_TEXT[f.variable] ?? f.variable}
                    </dt>
                    <dd data-null={f.value == null}>
                      {f.value != null ? `${f.value}${f.unit ? ` ${f.unit}` : ""}` : NO_DATA}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mono-sm">
                Cada variable se compara contra su propio percentil estacional, no contra un valor
                fijo: lo seco en la selva no es lo seco en la costa.
              </p>
            </>
          )}

          <div className="note note--warn" style={{ marginTop: 13 }}>
            <b>Lectura cualitativa.</b> Describe qué tan favorables son las condiciones observadas
            a que un fuego se extienda, si llegara a ocurrir. No estima probabilidad de ignición,
            no predice dónde ni cuándo empezará un incendio, y no está validada contra incendios
            reales.
          </div>
        </Drawer>
      );
    }

    default:
      return null;
  }
}
