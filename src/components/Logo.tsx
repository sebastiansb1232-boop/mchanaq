/**
 * Marca de McHanaq: globo de meridianos con dos órbitas y un satélite.
 *
 * Monocroma a propósito. Un solo tono —negro o blanco— y el volumen se
 * construye con grosores y opacidades, no con color. Así la marca se lee
 * igual sobre el negro de la portada, sobre un mapa satelital y en un
 * impreso a una tinta, y nunca compite con el dato, que sí usa color.
 *
 * El dibujo toma `currentColor`, de modo que el tono lo decide el CSS del
 * sitio donde se coloque: basta cambiar `color`.
 */

interface Props {
  size?: number;
  /**
   * `light`: marca blanca, para fondos oscuros (el caso normal).
   * `dark`: marca negra, para fondos claros.
   * `auto`: hereda el `color` del contenedor.
   */
  tone?: "light" | "dark" | "auto";
  /** Disco de contraste detrás, cuando el fondo es una imagen. */
  plate?: boolean;
}

export function Logo({ size = 34, tone = "light", plate = false }: Props) {
  const color = tone === "light" ? "#fff" : tone === "dark" ? "#000" : "currentColor";
  const plateFill = tone === "light" ? "#000" : "#fff";

  return (
    <svg
      className={`logo logo--${tone}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="McHanaq"
      fill="none"
      style={{ color }}
    >
      {plate && <circle cx="32" cy="32" r="32" fill={plateFill} opacity="0.62" />}

      <defs>
        {/* Recorta meridianos y masas al disco del planeta. */}
        <clipPath id="mcq-globe">
          <circle cx="31" cy="33" r="17.5" />
        </clipPath>
      </defs>

      <g stroke="currentColor" fill="none" strokeLinecap="round">
        {/* Órbita trasera: tenue, pasa por detrás del planeta. */}
        <ellipse
          cx="31"
          cy="33"
          rx="27.5"
          ry="11"
          strokeWidth="1.2"
          transform="rotate(-28 31 33)"
          opacity="0.3"
        />

        {/* Borde del planeta. */}
        <circle cx="31" cy="33" r="17.5" strokeWidth="1.9" opacity="0.95" />

        {/* Meridianos y paralelos. */}
        <g clipPath="url(#mcq-globe)" strokeWidth="1.1" opacity="0.5">
          <ellipse cx="31" cy="33" rx="6" ry="17.5" />
          <ellipse cx="31" cy="33" rx="12.4" ry="17.5" opacity="0.72" />
          <path d="M13.5 26h35M13.5 33h35M13.5 40h35" opacity="0.6" />
        </g>

        {/* Órbita delantera: trazo firme, cruza por delante. */}
        <ellipse
          cx="31"
          cy="33"
          rx="27.5"
          ry="11"
          strokeWidth="1.7"
          transform="rotate(-28 31 33)"
          strokeDasharray="0 88 62 0"
          opacity="0.9"
        />
      </g>

      {/* Masas de tierra sugeridas: formas propias, no un continente real. */}
      <g clipPath="url(#mcq-globe)" fill="currentColor" opacity="0.26">
        <path d="M18.5 25.5c3.2-2.1 7.4-1 9.4 1.2s.9 5.2-2.2 6.2-6.3 0-8.3-2.2-1-4.2 1.1-5.2Z" />
        <path d="M32 38.5c4.1-2 8.2 0 9.1 3.1s-2.1 6.1-5.2 6.1-6.2-2-6.2-5.1c0-2 1.1-3.1 2.3-4.1Z" />
        <path d="M39.5 22.5c2-1 5 0 5 2s-2 4-4 4-4-2-3-4c0-1 1-2 2-2Z" />
      </g>

      {/* La brasa: lo que la plataforma observa. Relleno pleno para que sea
          el punto más denso de la marca y se encuentre de inmediato. */}
      <circle cx="36.5" cy="42.5" r="3.6" fill="currentColor" />
      <circle cx="36.5" cy="42.5" r="1.4" fill={plate ? plateFill : tone === "light" ? "#000" : "#fff"} />

      {/* Satélite sobre la órbita delantera. */}
      <g transform="translate(51 17.5) rotate(-28)" stroke="currentColor" strokeWidth="1.2" fill="none">
        <rect x="-3" y="-3" width="6" height="6" fill="currentColor" />
        <rect x="-11" y="-2.6" width="6" height="5.2" opacity="0.8" />
        <rect x="5" y="-2.6" width="6" height="5.2" opacity="0.8" />
        <path d="M0-3.2v-3.6" />
      </g>
    </svg>
  );
}
