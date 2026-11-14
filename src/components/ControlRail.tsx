import { useState } from "react";
import { Drawer } from "./Drawer";
import type { DockItem } from "./DockBar";
import type {
  DailyRow,
  HotspotFeature,
  Metadata,
  MetricId,
  Sensor,
  TerritoryCollection,
  TerritoryType,
} from "../api/types";
import {
  ACTIVITY_METRICS,
  ENV_METRICS,
  METRIC_LABELS,
  SENSORS,
  SENSOR_LABELS,
  TERRITORY_LABELS,
} from "../api/types";
import { FIXTURE_FIRST_YEAR, FIXTURE_LAST_MONTH, FIXTURE_LAST_YEAR } from "../lib/fixtures";
import type { MonthCell } from "../lib/calendar";
import { calendarCsv, dailyCsv, download, hotspotsCsv, ringGeoJson } from "../lib/csv";
import { getBackendState, isDateAvailable, monthRange } from "../api/client";
import { insidePeru, ringAreaKm2, type LatLon } from "../lib/geo";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export const LEFT_ITEMS: DockItem[] = [
  { id: "periodo", label: "Período", icon: "calendar" },
  { id: "sensores", label: "Sensor", icon: "satellite" },
  { id: "area", label: "Territorio", icon: "polygon" },
  { id: "capas", label: "Capas del mapa", icon: "layers" },
  { id: "descargas", label: "Descargas", icon: "download" },
];

interface Props {
  section: string;
  onClose: () => void;
  year: number;
  month: number;
  onPeriod: (y: number, m: number) => void;
  day: number;
  onDay: (d: number) => void;
  dateIso: string;
  granularity: "day" | "month";
  onGranularity: (g: "day" | "month") => void;
  metadata: Metadata | null;
  daily: DailyRow[];

  /** Territorio: la clave de toda consulta del contrato. */
  territoryType: TerritoryType;
  onTerritoryType: (t: TerritoryType) => void;
  territoryId: string;
  onTerritoryId: (id: string) => void;
  territories: TerritoryCollection | null;

  /** Un sensor por consulta: los conteos no se suman entre sensores. */
  sensor: Sensor;
  onSensor: (s: Sensor) => void;

  /** Qué métrica pinta la coropleta. */
  metric: MetricId;
  onMetric: (m: MetricId) => void;

  showHotspots: boolean;
  onShowHotspots: (v: boolean) => void;
  showChoropleth: boolean;
  onShowChoropleth: (v: boolean) => void;
  showCalendar: boolean;
  onShowCalendar: (v: boolean) => void;
  baseLayer: "dark" | "relief" | "satellite";
  onBaseLayer: (v: "dark" | "relief" | "satellite") => void;

  /** Fase 2: recorte opcional para la simulación. */
  ring: LatLon[] | null;
  onRing: (r: LatLon[] | null) => void;

  hotspots: HotspotFeature[];
  calendar: MonthCell[];
  origin: string;
  csvHref: string | null;
  monthSpan: { from: string; to: string };
}

export function ControlRail(p: Props) {
  const [lat, setLat] = useState("-8.90");
  const [lon, setLon] = useState("-73.92");
  const [radius, setRadius] = useState("60");
  const [coordError, setCoordError] = useState<string | null>(null);

  const lastDay = Number(monthRange(p.year, p.month).to.slice(8));
  const years: number[] = [];
  for (let y = FIXTURE_LAST_YEAR; y >= FIXTURE_FIRST_YEAR; y--) years.push(y);
  const monthDisabled = (m: number) => p.year === FIXTURE_LAST_YEAR && m > FIXTURE_LAST_MONTH;

  const features = p.territories?.features ?? [];
  const stamp = `${p.year}${String(p.month).padStart(2, "0")}`;

  function applyCoords() {
    const la = Number(lat);
    const lo = Number(lon);
    const r = Number(radius);
    if (!isFinite(la) || !isFinite(lo) || !isFinite(r) || r <= 0) {
      setCoordError("Revisa los valores: deben ser números y el radio mayor que cero.");
      return;
    }
    if (!insidePeru([la, lo])) {
      setCoordError("Ese punto cae fuera del Perú. La herramienta solo cubre territorio peruano.");
      return;
    }
    setCoordError(null);
    const dLat = r / 110.574;
    const dLon = r / (111.32 * Math.cos((la * Math.PI) / 180));
    p.onRing([
      [la + dLat, lo - dLon],
      [la + dLat, lo + dLon],
      [la - dLat, lo + dLon],
      [la - dLat, lo - dLon],
    ]);
  }

  switch (p.section) {
    case "periodo":
      return (
        <Drawer title="Período" note={`${MONTHS[p.month - 1]} ${p.year}`} onClose={p.onClose}>
          <div className="field">
            <label className="field__label" htmlFor="sel-year">Año</label>
            <select
              id="sel-year"
              value={p.year}
              onChange={(e) => {
                const y = Number(e.target.value);
                const m = y === FIXTURE_LAST_YEAR && p.month > FIXTURE_LAST_MONTH ? FIXTURE_LAST_MONTH : p.month;
                p.onPeriod(y, m);
              }}
            >
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="sel-month">Mes</label>
            <select id="sel-month" value={p.month} onChange={(e) => p.onPeriod(p.year, Number(e.target.value))}>
              {MONTHS.map((name, i) => (
                <option key={name} value={i + 1} disabled={monthDisabled(i + 1)}>
                  {name}{monthDisabled(i + 1) ? " — sin datos" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="sel-day">
              Día <span className="field__value">{p.dateIso}</span>
            </label>
            <input
              id="sel-day"
              type="range"
              min={1}
              max={lastDay}
              step={1}
              value={Math.min(p.day, lastDay)}
              onChange={(e) => {
                p.onDay(Number(e.target.value));
                p.onGranularity("day");
              }}
            />
            <div className="legend__scale">
              <span>01</span>
              <span>{String(lastDay).padStart(2, "0")}</span>
            </div>
          </div>

          {p.metadata && !isDateAvailable(p.dateIso, p.sensor, p.metadata) && (
            <div className="note note--warn">
              {SENSOR_LABELS[p.sensor].long} no publica datos del {p.dateIso}. La API responde
              <code> PERIOD_NOT_AVAILABLE</code> y no se rellena con ceros.
            </div>
          )}

          <div className="field">
            <span className="field__label">Qué pinta el mapa</span>
            <div className="btn-row">
              <button
                className={`btn${p.granularity === "day" ? " btn--on" : ""}`}
                onClick={() => p.onGranularity("day")}
              >
                Ese día
              </button>
              <button
                className={`btn${p.granularity === "month" ? " btn--on" : ""}`}
                onClick={() => p.onGranularity("month")}
              >
                Mes completo
              </button>
            </div>
          </div>

          <button
            className="toggle"
            aria-pressed={p.showCalendar}
            onClick={() => p.onShowCalendar(!p.showCalendar)}
          >
            <i className="toggle__box" style={{ background: p.showCalendar ? "var(--acid)" : "transparent" }} />
            <span>Mostrar el calendario</span>
          </button>

          <p className="mono-sm">
            La API sirve en resolución diaria; el mes solo aporta contexto y anomalía. Las fechas
            disponibles las publica el backend en <code>metadata</code>
            {p.metadata?.parameters?.min_baseline_years
              ? ` (línea base mínima: ${p.metadata.parameters.min_baseline_years} años).`
              : "."}
          </p>
        </Drawer>
      );

    case "sensores":
      return (
        <Drawer title="Sensor" note={SENSOR_LABELS[p.sensor].short} onClose={p.onClose}>
          {SENSORS.map((s) => {
            const on = p.sensor === s;
            const meta = SENSOR_LABELS[s];
            const avail = p.metadata ? isDateAvailable(p.dateIso, s, p.metadata) : true;
            return (
              <button
                key={s}
                className="toggle"
                aria-pressed={on}
                onClick={() => p.onSensor(s)}
                title={`${meta.product} · ${avail ? "publica" : "sin datos"} el ${p.dateIso}`}
              >
                <i className="toggle__box" style={{ background: on ? "var(--acid)" : "transparent" }} />
                <span>{meta.long}</span>
                <span className="toggle__meta">{avail ? meta.product : "sin datos"}</span>
              </button>
            );
          })}
          <hr className="hr" />
          <p className="mono-sm">
            Una consulta de actividad es de <strong>un</strong> sensor: los conteos nunca se suman
            entre MODIS Terra, MODIS Aqua y VIIRS, porque cambian la hora de sobrevuelo y el
            instrumento. El contraste entre los tres se ve en «Comparación», que lo resuelve el
            backend.
          </p>
          <p className="mono-sm">
            El indicador principal usa las clases 8–9 (nominal y alta). La clase 7 se informa
            aparte, nunca sumada.
          </p>
        </Drawer>
      );

    case "area":
      return (
        <Drawer
          title="Territorio"
          note={TERRITORY_LABELS[p.territoryType].one}
          onClose={p.onClose}
        >
          <div className="field">
            <span className="field__label">Tipo</span>
            <div className="btn-row">
              <button
                className={`btn${p.territoryType === "province" ? " btn--on" : ""}`}
                onClick={() => p.onTerritoryType("province")}
              >
                Provincias
              </button>
              <button
                className={`btn${p.territoryType === "hydro_unit" ? " btn--on" : ""}`}
                onClick={() => p.onTerritoryType("hydro_unit")}
              >
                Cuencas
              </button>
            </div>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="sel-terr">
              {TERRITORY_LABELS[p.territoryType].one}{" "}
              <span className="field__value">{features.length} disponibles</span>
            </label>
            <select
              id="sel-terr"
              value={p.territoryId}
              onChange={(e) => p.onTerritoryId(e.target.value)}
            >
              {features.map((f) => (
                <option key={f.properties.territory_id} value={f.properties.territory_id}>
                  {f.properties.territory_name ?? f.properties.territory_id}
                </option>
              ))}
            </select>
          </div>

          <p className="mono-sm">
            Provincias y cuencas no se mezclan en un mismo ranking: son recortes distintos del
            territorio y compararlos entre sí no significa nada. También se puede elegir haciendo
            clic en el mapa.
          </p>

          <hr className="hr" />

          <p className="mono-sm" style={{ marginTop: 0 }}>
            <strong>Fase 2 (opcional).</strong> El recorte de abajo solo alimenta el recorrido
            simulado; no cambia ninguna consulta de la Fase 1.
          </p>
          <div className="field">
            <label className="field__label">Latitud <span className="field__value">°S/N</span></label>
            <input type="text" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} />
          </div>
          <div className="field">
            <label className="field__label">Longitud <span className="field__value">°E/W</span></label>
            <input type="text" inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} />
          </div>
          <div className="field">
            <label className="field__label">Radio <span className="field__value">{radius} km</span></label>
            <input type="text" inputMode="numeric" value={radius} onChange={(e) => setRadius(e.target.value)} />
          </div>
          <div className="btn-row">
            <button className="btn btn--primary" onClick={applyCoords}>Aplicar</button>
            <button className="btn" disabled={!p.ring} onClick={() => p.onRing(null)}>Quitar</button>
          </div>
          {coordError && <div className="note note--warn" style={{ marginTop: 10 }}>{coordError}</div>}
          {p.ring && (
            <dl className="kv" style={{ marginTop: 12 }}>
              <dt>Vértices</dt>
              <dd>{p.ring.length}</dd>
              <dt>Superficie</dt>
              <dd>{Math.round(ringAreaKm2(p.ring)).toLocaleString("es-PE")} km²</dd>
            </dl>
          )}
        </Drawer>
      );

    case "capas":
      return (
        <Drawer title="Capas del mapa" onClose={p.onClose}>
          <div className="field">
            <label className="field__label" htmlFor="sel-base">Mapa base</label>
            <select
              id="sel-base"
              value={p.baseLayer}
              onChange={(e) => p.onBaseLayer(e.target.value as Props["baseLayer"])}
            >
              <option value="dark">Oscuro</option>
              <option value="relief">Relieve</option>
              <option value="satellite">Satelital</option>
            </select>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="sel-metric">Métrica de la coropleta</label>
            <select
              id="sel-metric"
              value={p.metric}
              onChange={(e) => p.onMetric(e.target.value as MetricId)}
            >
              <optgroup label="Actividad (por sensor)">
                {ACTIVITY_METRICS.map((m) => (
                  <option key={m} value={m}>{METRIC_LABELS[m]}</option>
                ))}
              </optgroup>
              <optgroup label="Ambiental (sin sensor)">
                {ENV_METRICS.map((m) => (
                  <option key={m} value={m}>{METRIC_LABELS[m]}</option>
                ))}
              </optgroup>
              <optgroup label="Clasificación">
                <option value="conditions_classification">
                  {METRIC_LABELS.conditions_classification}
                </option>
              </optgroup>
            </select>
          </div>

          <button className="toggle" aria-pressed={p.showChoropleth} onClick={() => p.onShowChoropleth(!p.showChoropleth)}>
            <i className="toggle__box" style={{ background: p.showChoropleth ? "var(--acid)" : "transparent" }} />
            <span>Coropleta por territorio</span>
          </button>
          <button className="toggle" aria-pressed={p.showHotspots} onClick={() => p.onShowHotspots(!p.showHotspots)}>
            <i className="toggle__box" style={{ background: p.showHotspots ? "var(--acid)" : "transparent" }} />
            <span>Focos térmicos</span>
          </button>
          <button className="toggle" aria-pressed={p.showCalendar} onClick={() => p.onShowCalendar(!p.showCalendar)}>
            <i className="toggle__box" style={{ background: p.showCalendar ? "var(--acid)" : "transparent" }} />
            <span>Calendario</span>
          </button>

          <p className="mono-sm">
            Mapas base sin clave de API: OpenStreetMap con filtro oscuro, OpenTopoMap para relieve
            e hidrografía, y Esri World Imagery para satelital.
          </p>
        </Drawer>
      );

    case "descargas":
      return (
        <Drawer title="Descargas" onClose={p.onClose}>
          <div className="btn-row" style={{ flexDirection: "column" }}>
            {p.csvHref && getBackendState() === "online" && (
              <a
                className="btn btn--block btn--primary"
                style={{ display: "block", textAlign: "center", textDecoration: "none" }}
                href={p.csvHref}
              >
                Serie diaria del backend (CSV)
              </a>
            )}
            <button
              className="btn btn--block"
              disabled={p.daily.length === 0}
              onClick={() =>
                download(
                  `mchanaq_diario_${p.dateIso.slice(0, 7)}_${p.sensor}.csv`,
                  dailyCsv(p.daily, p.sensor, p.territoryId, p.territoryType, p.origin)
                )
              }
            >
              Serie diaria CSV ({p.daily.length} días)
            </button>
            <button
              className="btn btn--block"
              disabled={p.hotspots.length === 0}
              onClick={() => download(`mchanaq_focos_${stamp}.csv`, hotspotsCsv(p.hotspots, p.origin))}
            >
              Focos CSV ({p.hotspots.length.toLocaleString("es-PE")})
            </button>
            <button
              className="btn btn--block"
              disabled={p.calendar.length === 0}
              onClick={() =>
                download(`mchanaq_calendario_${p.sensor}.csv`, calendarCsv(p.calendar, p.sensor, p.origin))
              }
            >
              Calendario CSV
            </button>
            <button
              className="btn btn--block"
              disabled={!p.ring}
              onClick={() =>
                p.ring &&
                download(`mchanaq_area_${stamp}.geojson`, ringGeoJson(p.ring, ringAreaKm2(p.ring)), "application/geo+json")
              }
            >
              Área GeoJSON (Fase 2)
            </button>
          </div>
          <p className="mono-sm" style={{ marginTop: 12 }}>
            El CSV del backend es la fuente a citar: trae <code>source_product</code> y{" "}
            <code>processing_version</code>. Los valores desconocidos van como celda vacía, nunca
            como <code>0</code>. Cada archivo generado aquí incluye <code>data_origin</code>, que
            dice si la fila viene de la API o del juego de muestra.
          </p>
        </Drawer>
      );

    default:
      return null;
  }
}
