/**
 * Paletas ordinales.
 *
 * La arquitectura v1.2 §5 (regla 6) exige paletas aptas para daltonismo —
 * Viridis, Cividis o ColorBrewer — tanto en la coropleta diaria como en el
 * mapa de calor del calendario. Se usa **Cividis**: es perceptualmente
 * uniforme, está diseñada específicamente para deuteranopía y protanopía, y
 * su recorrido azul oscuro → amarillo funciona sobre fondo negro.
 *
 * La rampa cálida queda reservada para el frente simulado de la Fase 2, donde
 * el color no codifica una magnitud sino el paso del tiempo.
 */

type RGB = [number, number, number];

/** Cividis, 10 pasos. */
export const CIVIDIS: RGB[] = [
  [0, 32, 76],
  [0, 42, 102],
  [0, 52, 110],
  [39, 63, 108],
  [60, 74, 107],
  [87, 92, 109],
  [120, 112, 110],
  [158, 134, 103],
  [200, 160, 83],
  [254, 232, 56],
];

/** Rampa cálida (inferno), solo para el frente simulado. */
export const INFERNO: RGB[] = [
  [11, 7, 24],
  [34, 9, 63],
  [72, 15, 98],
  [113, 31, 109],
  [155, 47, 102],
  [197, 63, 81],
  [230, 92, 47],
  [248, 133, 12],
  [252, 180, 22],
  [243, 229, 92],
];

function sample(ramp: RGB[], t: number): RGB {
  const x = Math.max(0, Math.min(1, t)) * (ramp.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = ramp[i];
  const b = ramp[Math.min(ramp.length - 1, i + 1)];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

export function cividis(t: number): RGB {
  return sample(CIVIDIS, t);
}

export function cividisCss(t: number): string {
  const [r, g, b] = cividis(t);
  return `rgb(${r},${g},${b})`;
}

export function inferno(t: number): RGB {
  return sample(INFERNO, t);
}

export function infernoCss(t: number): string {
  const [r, g, b] = inferno(t);
  return `rgb(${r},${g},${b})`;
}

/** Color legible para texto sobre un fondo de la rampa. */
export function contrastInk(t: number): string {
  return t > 0.68 ? "#06131f" : "#e8edf5";
}
