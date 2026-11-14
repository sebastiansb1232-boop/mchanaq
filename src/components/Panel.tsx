import { useId, useState, type ReactNode } from "react";

interface Props {
  index: string;
  title: string;
  note?: ReactNode;
  /** Si el panel arranca abierto. Por defecto sí. */
  defaultOpen?: boolean;
  /** Un panel fijo no se puede plegar. */
  pinned?: boolean;
  children: ReactNode;
}

/**
 * Panel plegable de los raíles laterales.
 *
 * Los paneles se pliegan para que el mapa siga siendo lo más grande de la
 * pantalla: quien solo quiere mirar el mapa puede cerrar todo lo demás.
 */
export function Panel({ index, title, note, defaultOpen = true, pinned = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const isOpen = pinned || open;

  return (
    <section className="panel" data-open={isOpen}>
      <h2 className="panel__head">
        {pinned ? (
          <span className="panel__btn panel__btn--static">
            <span className="panel__idx">{index}</span>
            <span className="panel__title">{title}</span>
            {note ? <span className="panel__note">{note}</span> : null}
          </span>
        ) : (
          <button
            type="button"
            className="panel__btn"
            aria-expanded={isOpen}
            aria-controls={bodyId}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="panel__idx">{index}</span>
            <span className="panel__title">{title}</span>
            {note ? <span className="panel__note">{note}</span> : null}
            <span className="panel__chev" aria-hidden="true" />
          </button>
        )}
      </h2>
      <div className="panel__body" id={bodyId} hidden={!isOpen}>
        {children}
      </div>
    </section>
  );
}
