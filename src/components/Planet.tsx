import { useEffect, useRef } from "react";

/**
 * Fondo animado: campo de estrellas y un planeta de puntos que gira.
 *
 * Es una representacion abstracta, no un mapa: no dibuja continentes reales,
 * para no insinuar geografia que no estamos midiendo. Los destellos naranjas
 * son pulsos decorativos, no detecciones.
 *
 * Respeta `prefers-reduced-motion` y se detiene cuando la pestania no esta
 * visible, para no gastar bateria.
 */

interface Props {
  /** Opacidad general del fondo, 0 a 1. */
  intensity?: number;
}

interface Star {
  x: number;
  y: number;
  z: number;
  r: number;
  tw: number;
}

interface Dot {
  /** Coordenadas en la esfera unitaria. */
  x: number;
  y: number;
  z: number;
}

interface Ember {
  lat: number;
  lon: number;
  phase: number;
  speed: number;
}

const DOT_COUNT = 1500;
const STAR_COUNT = 220;
const EMBER_COUNT = 9;

export function Planet({ intensity = 1 }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    let dpr = 1;

    // --- geometria del planeta: red de Fibonacci, reparto casi uniforme ---
    const dots: Dot[] = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < DOT_COUNT; i++) {
      const y = 1 - (i / (DOT_COUNT - 1)) * 2;
      const radius = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * i;
      dots.push({ x: Math.cos(theta) * radius, y, z: Math.sin(theta) * radius });
    }

    const stars: Star[] = [];
    const embers: Ember[] = [];
    for (let i = 0; i < EMBER_COUNT; i++) {
      embers.push({
        lat: (Math.random() - 0.5) * 2.2,
        lon: Math.random() * Math.PI * 2,
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 0.9,
      });
    }

    function resize() {
      const parent = canvas!.parentElement;
      if (!parent) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = parent.clientWidth;
      h = parent.clientHeight;
      canvas!.width = Math.max(1, Math.round(w * dpr));
      canvas!.height = Math.max(1, Math.round(h * dpr));
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      stars.length = 0;
      for (let i = 0; i < STAR_COUNT; i++) {
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          z: 0.3 + Math.random() * 0.7,
          r: Math.random() < 0.86 ? 0.6 : 1.2,
          tw: Math.random() * Math.PI * 2,
        });
      }
    }

    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    let raf = 0;
    let t = 0;
    let last = performance.now();
    let running = true;

    function frame(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!reduced) t += dt;

      ctx!.clearRect(0, 0, w, h);

      // --- estrellas ---------------------------------------------------
      for (const s of stars) {
        s.x -= dt * 3.5 * s.z;
        if (s.x < -2) {
          s.x = w + 2;
          s.y = Math.random() * h;
        }
        const tw = 0.55 + 0.45 * Math.sin(t * 1.4 * s.z + s.tw);
        ctx!.globalAlpha = 0.5 * s.z * tw * intensity;
        ctx!.fillStyle = "#ffffff";
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx!.fill();
      }

      // --- planeta -------------------------------------------------------
      // Ubicado a la derecha y algo hundido, para dejar aire al texto.
      const R = Math.min(w, h) * (w < 760 ? 0.44 : 0.38);
      const cx = w < 760 ? w * 0.5 : w * 0.72;
      const cy = w < 760 ? h * 0.76 : h * 0.54;

      const rot = t * 0.085;
      const tilt = -0.42; // inclinacion del eje, en radianes
      const cosT = Math.cos(tilt);
      const sinT = Math.sin(tilt);

      // halo
      const halo = ctx!.createRadialGradient(cx, cy, R * 0.72, cx, cy, R * 1.5);
      halo.addColorStop(0, "rgba(216,255,51,0.085)");
      halo.addColorStop(0.45, "rgba(255,74,36,0.045)");
      halo.addColorStop(1, "rgba(0,0,0,0)");
      ctx!.globalAlpha = intensity;
      ctx!.fillStyle = halo;
      ctx!.beginPath();
      ctx!.arc(cx, cy, R * 1.5, 0, Math.PI * 2);
      ctx!.fill();

      // Cuerpo del planeta: degradado desplazado hacia la fuente de luz, para
      // que el disco se lea como una esfera y no como un circulo plano.
      const body = ctx!.createRadialGradient(
        cx - R * 0.42,
        cy - R * 0.38,
        R * 0.05,
        cx,
        cy,
        R * 1.02
      );
      body.addColorStop(0, "#16212e");
      body.addColorStop(0.45, "#0b131d");
      body.addColorStop(1, "#03060a");
      ctx!.globalAlpha = intensity;
      ctx!.fillStyle = body;
      ctx!.beginPath();
      ctx!.arc(cx, cy, R, 0, Math.PI * 2);
      ctx!.fill();

      // Direccion de la luz, hacia la camara y arriba a la izquierda.
      const LX = -0.52;
      const LY = 0.46;
      const LZ = 0.72;

      // puntos de la superficie
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      for (const d of dots) {
        // giro sobre el eje vertical
        const x1 = d.x * cosR - d.z * sinR;
        const z1 = d.x * sinR + d.z * cosR;
        // inclinacion del eje
        const y2 = d.y * cosT - z1 * sinT;
        const z2 = d.y * sinT + z1 * cosT;
        if (z2 <= 0.02) continue; // hemisferio trasero

        const px = cx + x1 * R;
        const py = cy - y2 * R;

        // Sombreado por incidencia de la luz sobre la normal del punto, que en
        // una esfera unitaria es el propio punto.
        const lambert = x1 * LX + y2 * LY + z2 * LZ;
        const lit = Math.max(0, lambert);
        // El borde se atenua para que la silueta no quede recortada.
        const rim = Math.min(1, z2 * 3.2);

        const bright = (0.1 + lit * 0.95) * rim;
        if (bright < 0.035) continue;

        ctx!.globalAlpha = Math.min(1, bright * 0.95) * intensity;
        ctx!.fillStyle =
          lit > 0.72 ? "#e8f3ff" : lit > 0.42 ? "#a8c0d8" : lit > 0.16 ? "#5d7793" : "#33455a";
        const size = 0.7 + lit * 1.3;
        ctx!.fillRect(px - size / 2, py - size / 2, size, size);
      }

      // Atmosfera: anillo luminoso pegado al limbo, mas intenso del lado de la luz.
      const atmo = ctx!.createRadialGradient(cx, cy, R * 0.93, cx, cy, R * 1.12);
      atmo.addColorStop(0, "rgba(140,190,235,0)");
      atmo.addColorStop(0.42, "rgba(150,200,240,0.2)");
      atmo.addColorStop(1, "rgba(150,200,240,0)");
      ctx!.globalAlpha = intensity;
      ctx!.fillStyle = atmo;
      ctx!.beginPath();
      ctx!.arc(cx, cy, R * 1.12, 0, Math.PI * 2);
      ctx!.fill();

      // borde
      ctx!.globalAlpha = 0.42 * intensity;
      ctx!.strokeStyle = "rgba(216,255,51,0.42)";
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.arc(cx, cy, R, 0, Math.PI * 2);
      ctx!.stroke();

      // --- pulsos ---------------------------------------------------------
      for (const e of embers) {
        const lon = e.lon + rot;
        const cl = Math.cos(e.lat);
        const ex = Math.sin(lon) * cl;
        const ey = Math.sin(e.lat);
        const ez = Math.cos(lon) * cl;
        const y2 = ey * cosT - ez * sinT;
        const z2 = ey * sinT + ez * cosT;
        if (z2 <= 0.06) continue;

        const px = cx + ex * R;
        const py = cy - y2 * R;
        const pulse = 0.5 + 0.5 * Math.sin(t * e.speed * 2 + e.phase);
        const rad = (2 + pulse * 7) * (0.45 + z2 * 0.55);

        const g = ctx!.createRadialGradient(px, py, 0, px, py, rad);
        g.addColorStop(0, `rgba(255,120,40,${0.75 * z2 * intensity})`);
        g.addColorStop(1, "rgba(255,74,36,0)");
        ctx!.globalAlpha = 1;
        ctx!.fillStyle = g;
        ctx!.beginPath();
        ctx!.arc(px, py, rad, 0, Math.PI * 2);
        ctx!.fill();

        ctx!.globalAlpha = (0.55 + pulse * 0.45) * z2 * intensity;
        ctx!.fillStyle = "#ffd9a0";
        ctx!.fillRect(px - 0.9, py - 0.9, 1.8, 1.8);
      }

      ctx!.globalAlpha = 1;
      if (running) raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);

    const onVis = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [intensity]);

  return <canvas ref={ref} className="planet" aria-hidden="true" />;
}
