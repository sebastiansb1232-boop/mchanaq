import { Logo } from "./Logo";
import type { BackendState } from "../api/client";
import type { Route } from "../lib/router";

export type ToolTab = "calendario" | "simulacion";

interface Props {
  route: Route;
  onRoute: (r: Route) => void;
  /** Pestañas de la herramienta. Solo en la página del mapa. */
  tab?: ToolTab;
  onTab?: (t: ToolTab) => void;
  backend?: BackendState;
}

const STATE: Record<BackendState, { dot: string; text: string; title: string }> = {
  checking: { dot: "dot", text: "Sondeando", title: "Comprobando si el backend responde" },
  online: { dot: "dot dot--live", text: "Conectado", title: "Los datos vienen de /api/v1" },
  offline: {
    dot: "dot dot--fixture",
    text: "Datos de muestra",
    title: "El backend no responde: la interfaz usa su juego de muestra",
  },
};

export function SiteNav({ route, onRoute, tab, onTab, backend }: Props) {
  const s = backend ? STATE[backend] : null;

  return (
    <header className={`hdr${route === "inicio" ? " hdr--over" : ""}`}>
      <button className="brand" onClick={() => onRoute("inicio")} title="Ir al inicio">
        {/* Blanco: las dos pantallas tienen cabecera oscura, y la marca
            monocroma se lee mejor sobre negro que cualquier versión con
            color. `tone="dark"` queda disponible para fondos claros. */}
        <Logo size={36} tone="light" />
        <span className="brand__text">
          <span className="brand__name">McHanaq</span>
          <span className="brand__tag">Actividad térmica · Perú</span>
        </span>
      </button>

      <nav className="hdr__nav" aria-label="Secciones del sitio">
        <button className="tab" aria-selected={route === "inicio"} onClick={() => onRoute("inicio")}>
          Inicio
        </button>
        <button className="tab" aria-selected={route === "mapa"} onClick={() => onRoute("mapa")}>
          Mapa
        </button>
      </nav>

      {route === "mapa" && tab && onTab && (
        <>
          <span className="hdr__sep" aria-hidden="true" />
          <nav className="hdr__nav" role="tablist" aria-label="Vistas de la herramienta">
            <button
              role="tab"
              className="tab tab--sub"
              aria-selected={tab === "calendario"}
              onClick={() => onTab("calendario")}
            >
              Calendario
            </button>
            <button
              role="tab"
              className="tab tab--sub"
              aria-selected={tab === "simulacion"}
              onClick={() => onTab("simulacion")}
            >
              Simulación
            </button>
          </nav>
        </>
      )}

      <div className="hdr__spacer" />

      {route === "inicio" ? (
        <button className="btn btn--primary" onClick={() => onRoute("mapa")}>
          Abrir el mapa →
        </button>
      ) : (
        s && (
          <div className="hdr__conn" title={s.title}>
            <i className={s.dot} />
            <span>{s.text}</span>
          </div>
        )
      )}
    </header>
  );
}
