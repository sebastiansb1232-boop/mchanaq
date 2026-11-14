/**
 * Barra de iconos de los laterales de la herramienta.
 *
 * Cada icono abre un único panel a la vez. Con todo cerrado, el mapa ocupa
 * toda la pantalla, que es el estado por defecto: lo importante es el mapa.
 */

export interface DockItem {
  id: string;
  label: string;
  icon: IconName;
  /** Cifra pequeña sobre el icono, por ejemplo cuántos sensores están activos. */
  badge?: string;
}

interface Props {
  items: DockItem[];
  open: string | null;
  onOpen: (id: string | null) => void;
  side: "left" | "right";
}

export function DockBar({ items, open, onOpen, side }: Props) {
  return (
    <nav className={`dockbar dockbar--${side}`} aria-label="Paneles">
      {items.map((it) => {
        const isOpen = open === it.id;
        return (
          <button
            key={it.id}
            className="dockbar__btn"
            aria-pressed={isOpen}
            aria-label={it.label}
            title={it.label}
            onClick={() => onOpen(isOpen ? null : it.id)}
          >
            <Icon name={it.icon} />
            {it.badge && <span className="dockbar__badge">{it.badge}</span>}
            <span className="dockbar__tip">{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/* -------------------------------------------------------------------------- */

export type IconName =
  | "calendar"
  | "satellite"
  | "polygon"
  | "layers"
  | "download"
  | "gauge"
  | "compare"
  | "tree"
  | "flame"
  | "sliders"
  | "play";

function Icon({ name }: { name: IconName }) {
  const common = {
    width: 17,
    height: 17,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "calendar":
      return (
        <svg {...common}>
          <rect x="2.5" y="4" width="15" height="13.5" rx="1" />
          <path d="M2.5 8h15M6.5 2.5v3M13.5 2.5v3" />
          <rect x="5.5" y="10.5" width="2.5" height="2.5" fill="currentColor" stroke="none" />
          <rect x="12" y="10.5" width="2.5" height="2.5" fill="currentColor" stroke="none" />
        </svg>
      );
    case "satellite":
      return (
        <svg {...common}>
          <rect x="7.5" y="7.5" width="5" height="5" transform="rotate(45 10 10)" />
          <path d="M4.2 4.2 1.8 6.6M15.8 4.2l2.4 2.4M4.2 15.8l-2.4-2.4M15.8 15.8l2.4-2.4" />
          <circle cx="10" cy="10" r="1.3" fill="currentColor" stroke="none" />
        </svg>
      );
    case "polygon":
      return (
        <svg {...common}>
          <path d="M3 6.5 10 2.5l7 4v7l-7 4-7-4z" />
          <circle cx="3" cy="6.5" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="17" cy="6.5" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="10" cy="17.5" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      );
    case "layers":
      return (
        <svg {...common}>
          <path d="M10 2.5 2.5 6.5 10 10.5l7.5-4z" />
          <path d="M2.5 10.5 10 14.5l7.5-4" />
          <path d="M2.5 14 10 18l7.5-4" />
        </svg>
      );
    case "download":
      return (
        <svg {...common}>
          <path d="M10 2.5v10M6 9l4 4 4-4M3 15.5v2h14v-2" />
        </svg>
      );
    case "gauge":
      return (
        <svg {...common}>
          <path d="M3 14a7 7 0 1 1 14 0" />
          <path d="M10 14 13 8" />
          <circle cx="10" cy="14" r="1.3" fill="currentColor" stroke="none" />
        </svg>
      );
    case "compare":
      return (
        <svg {...common}>
          <path d="M4 16V8M8 16V4M12 16v-6M16 16V6" />
          <path d="M2 18h16" />
        </svg>
      );
    case "tree":
      return (
        <svg {...common}>
          <path d="M10 17V9M10 9 5 5M10 9l5-4" />
          <circle cx="10" cy="18" r="1.3" fill="currentColor" stroke="none" />
          <rect x="3" y="2.5" width="4" height="3.5" />
          <rect x="13" y="2.5" width="4" height="3.5" />
        </svg>
      );
    case "flame":
      return (
        <svg {...common}>
          <path d="M10 18c3 0 5-2.2 5-5 0-3.4-3-4.6-3-8-2.4 1.4-3 3.2-3 5-1-0.6-1.4-1.6-1.4-2.6C6 8.6 5 10.6 5 13c0 2.8 2 5 5 5Z" />
        </svg>
      );
    case "sliders":
      return (
        <svg {...common}>
          <path d="M3 6h14M3 10h14M3 14h14" />
          <circle cx="7" cy="6" r="1.8" fill="var(--surface-1)" />
          <circle cx="13" cy="10" r="1.8" fill="var(--surface-1)" />
          <circle cx="6" cy="14" r="1.8" fill="var(--surface-1)" />
        </svg>
      );
    case "play":
      return (
        <svg {...common}>
          <path d="M6.5 4.5 15 10l-8.5 5.5z" />
        </svg>
      );
  }
}
