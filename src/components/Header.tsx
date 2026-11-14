import type { BackendState } from "../api/client";

export type ViewTab = "calendario" | "simulacion";

interface Props {
  tab: ViewTab;
  onTab: (t: ViewTab) => void;
  backend: BackendState;
}

/** Marca propia: triangulo de cumbre con brasa. Sin referencias institucionales. */
function Glyph() {
  return (
    <svg className="hdr__glyph" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M2 28 L13 7 L19 18 L23 12 L30 28 Z" fill="none" stroke="#ededed" strokeWidth="1.6" />
      <path d="M13 7 L19 18 L23 12 L30 28 Z" fill="#d8ff33" opacity="0.14" />
      <circle cx="13" cy="21.5" r="3.2" fill="#ff4a24" />
      <circle cx="13" cy="21.5" r="1.3" fill="#d8ff33" />
    </svg>
  );
}

const STATE: Record<BackendState, { dot: string; text: string }> = {
  checking: { dot: "dot", text: "Sondeando backend" },
  online: { dot: "dot dot--live", text: "Backend conectado" },
  offline: { dot: "dot dot--fixture", text: "Datos de muestra" },
};

export function Header({ tab, onTab, backend }: Props) {
  const s = STATE[backend];
  return (
    <header className="hdr">
      <div className="hdr__mark">
        <Glyph />
        <div>
          <div className="hdr__name">McHanaq</div>
          <div className="hdr__tag">Actividad térmica · Perú</div>
        </div>
      </div>

      <nav className="hdr__nav" role="tablist" aria-label="Vistas">
        <button
          role="tab"
          className="tab"
          aria-selected={tab === "calendario"}
          onClick={() => onTab("calendario")}
        >
          Calendario
        </button>
        <button
          role="tab"
          className="tab"
          aria-selected={tab === "simulacion"}
          onClick={() => onTab("simulacion")}
        >
          Simulación
        </button>
      </nav>

      <div className="hdr__spacer" />

      <div className="hdr__conn" title={
        backend === "online"
          ? "Los datos vienen de /api/v1"
          : "El backend no responde: la interfaz usa su juego de muestra"
      }>
        <i className={s.dot} />
        <span>{s.text}</span>
      </div>
    </header>
  );
}
