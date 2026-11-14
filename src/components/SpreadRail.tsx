import { Drawer } from "./Drawer";
import type { DockItem } from "./DockBar";
import { SPREAD_DISCLAIMER, SPREAD_MODEL_NAME, type SpreadResult } from "../lib/spread";
import { formatLatLon, type LatLon } from "../lib/geo";

export interface SpreadParams {
  windSpeedMs: number;
  windDirDeg: number;
  fuelMoisturePct: number;
  vegetationPct: number;
  slopeMeanDeg: number;
  horizonHours: number;
}

export const SPREAD_ITEMS: DockItem[] = [
  { id: "escenario", label: "Escenario · Fase 2", icon: "flame" },
  { id: "condiciones", label: "Condiciones", icon: "sliders" },
  { id: "resultado", label: "Resultado y reproducción", icon: "play" },
];

const COMPASS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
const cardinal = (deg: number) => COMPASS[Math.round((deg % 360) / 45) % 8];

interface Props {
  section: string;
  onClose: () => void;
  params: SpreadParams;
  onParams: (p: SpreadParams) => void;
  ring: LatLon[] | null;
  ignition: LatLon | null;
  onPickIgnition: () => void;
  result: SpreadResult | null;
  running: boolean;
  time: number;
  onTime: (t: number) => void;
  onRun: () => void;
  onPlayPause: () => void;
  playing: boolean;
  envApplied: boolean;
  onApplyEnv: () => void;
  /** ¿Llegó la ficha del territorio? Sin ella no hay clima que aplicar. */
  hasEnv: boolean;
  /** Centro del territorio activo; orienta al usuario al dibujar el recorte. */
  center: LatLon | null;
}

export function SpreadRail(p: Props) {
  const v = p.params;
  const set = <K extends keyof SpreadParams>(k: K, value: SpreadParams[K]) =>
    p.onParams({ ...v, [k]: value });
  const ready = p.ring !== null && p.ignition !== null;

  switch (p.section) {
    case "escenario":
      return (
        <Drawer title="Escenario" onClose={p.onClose}>
          <span className="chip chip--warn">Fase 2 · opcional</span>
          <div className="note note--ember" style={{ marginTop: 10 }}>
            <b>Modelo exploratorio, no validado.</b> Estima hasta dónde podría avanzar un frente
            desde una ignición <i>hipotética</i>, con las condiciones que fijes. No predice si habrá
            un incendio, ni dónde, ni cuándo. No usar para decisiones operativas ni de evacuación.
          </div>
          <p className="mono-sm" style={{ marginTop: 9 }}>
            Esta capa está desacoplada de la Fase 1: no altera el calendario, la comparación
            multisensor ni ningún endpoint del contrato.
          </p>
          <dl className="kv" style={{ marginTop: 13 }}>
            <dt>Área de interés</dt>
            <dd data-null={!p.ring}>{p.ring ? `${p.ring.length} vértices` : "Sin definir"}</dd>
            <dt>Ignición</dt>
            <dd data-null={!p.ignition}>{p.ignition ? formatLatLon(p.ignition, 3) : "Sin definir"}</dd>
            <dt>Centro del territorio</dt>
            <dd data-null={!p.center}>{p.center ? formatLatLon(p.center, 3) : "Sin definir"}</dd>
          </dl>
          <div className="btn-row" style={{ marginTop: 11 }}>
            <button className="btn" onClick={p.onPickIgnition}>Situar ignición</button>
            <button
              className="btn"
              onClick={p.onApplyEnv}
              disabled={p.envApplied || !p.hasEnv}
              title={
                p.hasEnv
                  ? "Toma el viento del día y los factores del árbol de decisión"
                  : "Aún no llegó la ficha del territorio"
              }
            >
              {p.envApplied ? "Clima aplicado" : "Usar clima del día"}
            </button>
          </div>
          {!p.ring && (
            <div className="note note--warn" style={{ marginTop: 11 }}>
              Dibuja primero un área en el mapa: define el dominio de la simulación.
            </div>
          )}
          <button
            className="btn btn--ember btn--block"
            disabled={!ready || p.running}
            onClick={p.onRun}
            style={{ marginTop: 13 }}
          >
            {p.running ? "Calculando…" : "Ejecutar simulación"}
          </button>
        </Drawer>
      );

    case "condiciones":
      return (
        <Drawer title="Condiciones" onClose={p.onClose}>
          <div className="field">
            <label className="field__label" htmlFor="sp-wind">
              Viento a 10 m <span className="field__value">{v.windSpeedMs.toFixed(1)} m/s</span>
            </label>
            <input id="sp-wind" type="range" min={0} max={18} step={0.5}
              value={v.windSpeedMs} onChange={(e) => set("windSpeedMs", Number(e.target.value))} />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="sp-dir">
              Viento desde <span className="field__value">{Math.round(v.windDirDeg)}° {cardinal(v.windDirDeg)}</span>
            </label>
            <input id="sp-dir" type="range" min={0} max={359} step={5}
              value={v.windDirDeg} onChange={(e) => set("windDirDeg", Number(e.target.value))} />
            <div className="compass" aria-hidden="true">
              <i style={{ transform: `rotate(${v.windDirDeg + 180}deg)` }} />
              <span>avance</span>
            </div>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="sp-fm">
              Humedad del combustible <span className="field__value">{v.fuelMoisturePct.toFixed(0)} %</span>
            </label>
            <input id="sp-fm" type="range" min={2} max={30} step={1}
              value={v.fuelMoisturePct} onChange={(e) => set("fuelMoisturePct", Number(e.target.value))} />
            <p className="mono-sm">A 30 % el frente se apaga: es el contenido de extinción.</p>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="sp-veg">
              Cobertura vegetal <span className="field__value">{v.vegetationPct.toFixed(0)} %</span>
            </label>
            <input id="sp-veg" type="range" min={5} max={100} step={1}
              value={v.vegetationPct} onChange={(e) => set("vegetationPct", Number(e.target.value))} />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="sp-slope">
              Pendiente media <span className="field__value">{v.slopeMeanDeg.toFixed(0)}°</span>
            </label>
            <input id="sp-slope" type="range" min={0} max={35} step={1}
              value={v.slopeMeanDeg} onChange={(e) => set("slopeMeanDeg", Number(e.target.value))} />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="sp-h">
              Horizonte <span className="field__value">{v.horizonHours} h</span>
            </label>
            <input id="sp-h" type="range" min={3} max={48} step={1}
              value={v.horizonHours} onChange={(e) => set("horizonHours", Number(e.target.value))} />
          </div>

          <button className="btn btn--ember btn--block" disabled={!ready || p.running} onClick={p.onRun}>
            {p.running ? "Calculando…" : "Ejecutar simulación"}
          </button>
          {!ready && (
            <p className="mono-sm" style={{ marginTop: 9 }}>
              Faltan {!p.ring ? "el área" : ""}{!p.ring && !p.ignition ? " y " : ""}
              {!p.ignition ? "el punto de ignición" : ""}.
            </p>
          )}
        </Drawer>
      );

    case "resultado":
      if (!p.result) {
        return (
          <Drawer title="Resultado" onClose={p.onClose}>
            <div className="note">
              Todavía no hay simulación. Define un área y un punto de ignición, ajusta las
              condiciones y pulsa <b>Ejecutar simulación</b>.
            </div>
          </Drawer>
        );
      }
      return (
        <Drawer title="Resultado" note={`t = ${p.time.toFixed(1)} h`} onClose={p.onClose}>
          <div className="transport">
            <button className="btn" onClick={p.onPlayPause} style={{ minWidth: 62 }}>
              {p.playing ? "Pausa" : "Reproducir"}
            </button>
            <input type="range" min={0} max={v.horizonHours} step={0.25}
              value={p.time} onChange={(e) => p.onTime(Number(e.target.value))}
              aria-label="Instante de la simulación" />
          </div>
          <div className="legend__scale" style={{ marginTop: 2, marginBottom: 14 }}>
            <span>0 h</span><span>{v.horizonHours} h</span>
          </div>

          <div className="metric-grid">
            <div className="metric">
              <div className="metric__label">Superficie alcanzada</div>
              <div className="metric__value">
                {areaAt(p.result, p.time).toLocaleString("es-PE")}
                <span className="metric__unit">ha</span>
              </div>
            </div>
            <div className="metric">
              <div className="metric__label">Avance de cabeza</div>
              <div className="metric__value">
                {p.result.headRosMMin.toFixed(1)}
                <span className="metric__unit">m/min</span>
              </div>
            </div>
          </div>

          <div className="legend__title" style={{ marginTop: 14 }}>
            Isócronas · superficie acumulada
          </div>
          <dl className="kv">
            {p.result.bands.map((b) => (
              <div key={b.hours} style={{ display: "contents" }}>
                <dt>{b.hours} h</dt>
                <dd>{b.areaHa.toLocaleString("es-PE")} ha</dd>
              </div>
            ))}
          </dl>

          <hr className="hr" />
          <dl className="kv">
            <dt>Relación largo/ancho</dt><dd>{p.result.lengthToBreadth.toFixed(2)} : 1</dd>
            <dt>Resolución de celda</dt><dd>{Math.round(p.result.cellSizeM)} m</dd>
            <dt>Grilla</dt><dd>{p.result.cols} × {p.result.rows}</dd>
          </dl>

          <div className="legend__title" style={{ marginTop: 14 }}>Supuestos activos</div>
          <ul className="assume">
            {p.result.assumptions.map((a) => <li key={a}>{a}</li>)}
          </ul>
          <dl className="kv" style={{ marginTop: 13 }}>
            <dt>Modelo</dt>
            <dd style={{ fontSize: 10 }}>{SPREAD_MODEL_NAME}</dd>
          </dl>
          <div className="note note--ember" style={{ marginTop: 10 }}>
            {SPREAD_DISCLAIMER}
          </div>
          <p className="mono-sm" style={{ marginTop: 9 }}>
            Forma elíptica de Anderson (1983), pendiente con la regla de duplicar la velocidad cada
            10° y amortiguamiento por humedad de Rothermel. Cuando el backend publique el DEM por
            época y la cobertura reales, se reemplazan el relieve y el combustible sintéticos.
          </p>
        </Drawer>
      );

    default:
      return null;
  }
}

function areaAt(r: SpreadResult, t: number): number {
  const cellHa = (r.cellSizeM * r.cellSizeM) / 10_000;
  let n = 0;
  for (let i = 0; i < r.arrival.length; i++) if (r.arrival[i] <= t) n++;
  return Math.round(n * cellHa);
}
