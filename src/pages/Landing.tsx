import { useEffect, useRef, useState } from "react";
import { Globe } from "../components/Globe";
import { TEAM, initials, type Member } from "../data/team";

interface Props {
  onOpenMap: () => void;
}

const BLOCKS = [
  { id: "inicio", label: "Inicio" },
  { id: "proyecto", label: "El proyecto" },
  { id: "equipo", label: "El equipo" },
];

export function Landing({ onOpenMap }: Props) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);

  /**
   * Entrada del contenido.
   *
   * Se observa **cada elemento** con `data-reveal`, no el bloque que los
   * contiene. Observando el bloque, un párrafo del final seguía invisible
   * aunque estuviera en pantalla, porque el bloque todavía no alcanzaba su
   * umbral; eso era lo que parecía texto roto.
   *
   * El margen negativo adelanta el disparo: cuando el elemento asoma ya está
   * entrando, no después. Al terminar se marca `is-done`, que suelta la capa
   * de composición y devuelve el texto a su trazado nítido; y se deja de
   * observar, porque la entrada ocurre una sola vez.
   */
  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const items = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));

    if (reduce) {
      items.forEach((el) => el.classList.add("is-in", "is-done"));
      return;
    }

    const settle = (el: HTMLElement) => {
      const delay = parseFloat(el.style.getPropertyValue("--d")) || 0;
      window.setTimeout(() => el.classList.add("is-done"), delay + 480);
    };

    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          el.classList.add("is-in");
          settle(el);
          obs.unobserve(el);
        }
      },
      { root, rootMargin: "0px 0px -12% 0px", threshold: 0.01 }
    );

    items.forEach((el) => obs.observe(el));

    /**
     * Red de seguridad para los saltos largos.
     *
     * `IntersectionObserver` avisa cuando algo cruza el borde de la pantalla.
     * Si el desplazamiento salta de golpe —la barra lateral, `Fin`, un gesto
     * brusco—, un bloque intermedio pasa de «debajo» a «encima» sin cruzar
     * nada, no se notifica y queda invisible hasta que se vuelva a pasar por
     * él. Eso era parte del texto que «desaparecía». Aquí se da por entrado
     * todo lo que ya quedó por encima del borde inferior.
     */
    const sweep = () => {
      for (const el of items) {
        if (el.classList.contains("is-in")) continue;
        if (el.getBoundingClientRect().top < window.innerHeight) {
          el.classList.add("is-in");
          settle(el);
          obs.unobserve(el);
        }
      }
    };

    let idle: number | undefined;
    const onScroll = () => {
      window.clearTimeout(idle);
      idle = window.setTimeout(sweep, 120);
    };
    root.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      obs.disconnect();
      root.removeEventListener("scroll", onScroll);
      window.clearTimeout(idle);
    };
  }, []);

  /** Marca el bloque activo en la navegación lateral. */
  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;

    const obs = new IntersectionObserver(
      (entries) => {
        // Gana el bloque que ocupa más pantalla, no el primero que se cruza:
        // así el punto activo no va y viene en la frontera entre dos.
        let best = -1;
        let ratio = 0;
        for (const e of entries) {
          if (e.intersectionRatio > ratio) {
            ratio = e.intersectionRatio;
            best = BLOCKS.findIndex((b) => b.id === e.target.id);
          }
        }
        if (best >= 0 && ratio > 0.2) setActive(best);
      },
      { root, threshold: [0.2, 0.4, 0.6, 0.8] }
    );

    BLOCKS.forEach((b) => {
      const el = document.getElementById(b.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  /**
   * Salto suave hasta un bloque.
   *
   * Se calcula sobre el contenedor en vez de usar `scrollIntoView`, porque
   * aquí lo que se desplaza no es la ventana sino un elemento con su propio
   * desbordamiento, y `block: "start"` llegaba a arrastrar la página entera
   * unos píxeles, que es parte del temblor que se veía.
   */
  const goTo = (id: string) => {
    const root = scrollerRef.current;
    const el = document.getElementById(id);
    if (!root || !el) return;
    root.scrollTo({
      top: el.offsetTop,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  };

  return (
    <div className="landing" ref={scrollerRef}>
      <div className="landing__bg">
        <Globe anchorX={0.27} />
      </div>

      <nav className="dots" aria-label="Secciones">
        {BLOCKS.map((b, i) => (
          <button
            key={b.id}
            className="dots__item"
            aria-current={active === i}
            onClick={() => goTo(b.id)}
          >
            <span className="dots__label">{b.label}</span>
            <span className="dots__mark" />
          </button>
        ))}
      </nav>

      {/* ============================================================ 1 === */}
      <section className="block" id="inicio">
        <div className="wrap wrap--right">
          <div className="col">
            <p className="eyebrow" data-reveal style={{ "--d": "0ms" } as React.CSSProperties}>
              NASA Space Apps Challenge 2026 · Los McLovin
            </p>
            <h1 className="hero__title" data-reveal style={{ "--d": "40ms" } as React.CSSProperties}>
              El fuego deja huella.
              <span className="hero__accent">Nosotros la ordenamos.</span>
            </h1>
            <p className="hero__lead" data-reveal style={{ "--d": "80ms" } as React.CSSProperties}>
              Dos décadas de focos térmicos repartidos entre satélites que no se pueden comparar
              directamente. McHanaq los reúne en un calendario territorial del Perú y estima cómo
              podría avanzar el fuego sobre el terreno.
            </p>
            <div className="hero__cta" data-reveal style={{ "--d": "120ms" } as React.CSSProperties}>
              <button className="btn btn--primary btn--lg" onClick={onOpenMap}>
                Abrir el mapa →
              </button>
              <button className="btn btn--lg" onClick={() => goTo("proyecto")}>
                El proyecto
              </button>
            </div>
            <dl className="facts" data-reveal style={{ "--d": "160ms" } as React.CSSProperties}>
              <div>
                <dt>Serie</dt>
                <dd>2000 — hoy</dd>
              </div>
              <div>
                <dt>Sensores</dt>
                <dd>MODIS ×2 · VIIRS</dd>
              </div>
              <div>
                <dt>Escala</dt>
                <dd>Provincias y cuencas</dd>
              </div>
            </dl>
          </div>
        </div>
        <button className="scroll-cue" onClick={() => goTo("proyecto")} aria-label="Bajar">
          <span />
        </button>
      </section>

      {/* ============================================================ 2 === */}
      <section className="block" id="proyecto">
        <div className="wrap wrap--right">
          <div className="col">
            <p className="eyebrow" data-reveal style={{ "--d": "0ms" } as React.CSSProperties}>
              01 · El proyecto
            </p>
            <h2 className="block__title" data-reveal style={{ "--d": "40ms" } as React.CSSProperties}>
              De puntos sueltos a una historia del territorio.
            </h2>
            <p className="block__lead" data-reveal style={{ "--d": "80ms" } as React.CSSProperties}>
              Ver dónde hay focos hoy es el primer paso, no el último. McHanaq responde si lo
              observado es inusual para esta época, cuánto alcanzó a ver el satélite y si las
              fuentes coinciden; y, sobre esa base, describe qué tan favorable es el terreno a que
              un fuego se extienda.
            </p>

            <div className="goal" data-reveal style={{ "--d": "120ms" } as React.CSSProperties}>
              <span className="goal__tag">Objetivo</span>
              <p>
                Convertir observaciones históricas de MODIS y VIIRS en un calendario territorial
                comparable, con anomalías, cobertura y trazabilidad por sensor, para apoyar la
                planificación del monitoreo de incendios en el Perú.
              </p>
            </div>

            <div className="scope" data-reveal style={{ "--d": "160ms" } as React.CSSProperties}>
              <div className="scope__col scope__col--yes">
                <h3>Sí hace</h3>
                <ul>
                  <li>Calendario histórico por provincia y cuenca</li>
                  <li>Comparación entre sensores con su cobertura</li>
                  <li>Anomalías contra el mismo mes de otros años</li>
                  <li>Recorrido simulado desde una ignición hipotética</li>
                </ul>
              </div>
              <div className="scope__col scope__col--no">
                <h3>No hace</h3>
                <ul>
                  <li>Predecir dónde o cuándo se iniciará un incendio</li>
                  <li>Estimar probabilidad de ignición</li>
                  <li>Confundir un foco térmico con un incendio confirmado</li>
                  <li>Servir como sistema de alerta operativa</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ 3 === */}
      <section className="block block--team" id="equipo">
        <div className="wrap">
          <div className="team__head">
            <p className="eyebrow" data-reveal style={{ "--d": "0ms" } as React.CSSProperties}>
              02 · El equipo
            </p>
            <h2 className="block__title" data-reveal style={{ "--d": "40ms" } as React.CSSProperties}>
              Los McLovin
            </h2>
            <p
              className="block__lead block__lead--narrow"
              data-reveal
              style={{ "--d": "80ms" } as React.CSSProperties}
            >
              Cinco frentes de trabajo y una sola ruta de datos. Cada integrante es dueño de su
              carpeta y de su rama.
            </p>
          </div>

          <div className="team">
            {TEAM.map((m, i) => (
              <div
                key={m.slug}
                data-reveal
                style={{ "--d": `${110 + i * 45}ms` } as React.CSSProperties}
              >
                <MemberCard member={m} />
              </div>
            ))}
          </div>

          <footer className="landing__foot" data-reveal style={{ "--d": "340ms" } as React.CSSProperties}>
            <button className="btn btn--primary" onClick={onOpenMap}>
              Abrir el mapa →
            </button>
            <span className="muted">
              Datos: NASA LP DAAC · Copernicus ERA5-Land · SRTM · MapBiomas Perú
            </span>
          </footer>
        </div>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Tarjeta de integrante.
 *
 * La foto se busca en `public/equipo/<slug>.jpg` y, si no está, en `.png`.
 * Si tampoco está, se dibuja un monograma: cada uno solo tiene que dejar su
 * archivo en la carpeta, sin tocar código.
 */
function MemberCard({ member }: { member: Member }) {
  const [attempt, setAttempt] = useState(0);
  const sources = [`./equipo/${member.slug}.jpg`, `./equipo/${member.slug}.png`];
  const src = sources[attempt];

  return (
    <article className="member">
      <div className="member__photo">
        {src ? (
          <img
            src={src}
            alt={`Fotografía de ${member.name}`}
            loading="lazy"
            onError={() => setAttempt((a) => a + 1)}
          />
        ) : (
          <span className="member__mono" aria-hidden="true">
            {initials(member.name)}
          </span>
        )}
        <span className="member__ring" aria-hidden="true" />
      </div>
      <h3 className="member__name">{member.name}</h3>
      <p className="member__role">{member.role}</p>
      <p className="member__blurb">{member.blurb}</p>
      <ul className="member__tags">
        {member.tags.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </article>
  );
}
