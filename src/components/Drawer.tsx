import type { ReactNode } from "react";

interface Props {
  title: string;
  note?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

/** Cajón lateral: muestra una sola sección a la vez, elegida en la barra de iconos. */
export function Drawer({ title, note, onClose, children }: Props) {
  return (
    <div className="drawer">
      <header className="drawer__head">
        <h2 className="drawer__title">{title}</h2>
        {note ? <span className="drawer__note">{note}</span> : null}
        <button className="drawer__close" onClick={onClose} aria-label="Cerrar panel">
          ×
        </button>
      </header>
      <div className="drawer__body">{children}</div>
    </div>
  );
}
