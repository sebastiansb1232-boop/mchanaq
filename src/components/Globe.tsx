import { useEffect, useRef } from "react";
import { LAND, PERU_MARK, PULSE_POINTS, WATER } from "../data/landmask";

/**
 * Fondo de la portada: campo de estrellas sobre negro y un globo terráqueo de
 * puntos que gira, con órbitas y un satélite.
 *
 * El globo se puede arrastrar con el ratón o el dedo y conserva inercia.
 * Los pulsos naranjas son adorno, no detecciones de nuestro conjunto de datos.
 * Respeta `prefers-reduced-motion` y se detiene con la pestaña oculta.
 */

interface Props {
  /** Posición horizontal del centro del globo, 0 a 1. */
  anchorX?: number;
}

const POINTS = 9500;
const STARS = 700;
const LIGHT_LEVELS = 14;
/** Resolución de la máscara de tierra, en grados por píxel ÷ 2. */
const MASK_W = 720;
const MASK_H = 360;

type Orbit = { inc: number; roll: number; rr: number; sp: number };

const ORBITS: Orbit[] = [
  { inc: 1.05, roll: -0.55, rr: 1.42, sp: 0.55 },
  { inc: 0.55, roll: 0.75, rr: 1.3, sp: 0 },
  { inc: 1.3, roll: 1.9, rr: 1.52, sp: 0 },
];

function buildPalette(rgb: [number, number, number], aMin: number, aMax: number): string[] {
  const out: string[] = [];
  for (let k = 0; k < LIGHT_LEVELS; k++) {
    const t = k / (LIGHT_LEVELS - 1);
    const a = aMin + (aMax - aMin) * t;
    const s = 0.45 + 0.55 * t;
    out.push(
      `rgba(${Math.round(rgb[0] * s)},${Math.round(rgb[1] * s)},${Math.round(rgb[2] * s)},${a.toFixed(3)})`
    );
  }
  return out;
}

const LAND_PAL = buildPalette([95, 205, 228], 0.25, 1);
const SEA_PAL = buildPalette([40, 95, 150], 0.1, 0.55);

export function Globe({ anchorX = 0.3 }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ---------------------------------------- máscara de tierra ---------- */
    const mc = document.createElement("canvas");
    mc.width = MASK_W;
    mc.height = MASK_H;
    const mx = mc.getContext("2d");
    if (!mx) return;
    mx.fillStyle = "#000";
    mx.fillRect(0, 0, MASK_W, MASK_H);
    const paint = (rings: [number, number][][], color: string) => {
      mx.fillStyle = color;
      for (const ring of rings) {
        mx.beginPath();
        ring.forEach(([lon, lat], i) => {
          const x = (lon + 180) * 2;
          const y = (90 - lat) * 2;
          if (i === 0) mx.moveTo(x, y);
          else mx.lineTo(x, y);
        });
        mx.closePath();
        mx.fill();
      }
    };
    paint(LAND, "#fff");
    paint(WATER, "#000");
    const mask = mx.getImageData(0, 0, MASK_W, MASK_H).data;
    const isLand = (lon: number, lat: number) => {
      const ix = Math.min(MASK_W - 1, Math.max(0, Math.floor((lon + 180) * 2)));
      const iy = Math.min(MASK_H - 1, Math.max(0, Math.floor((90 - lat) * 2)));
      return mask[(iy * MASK_W + ix) * 4] > 127;
    };

    /* ------------------------------- puntos sobre la esfera -------------- */
    const PX = new Float32Array(POINTS);
    const PY = new Float32Array(POINTS);
    const PZ = new Float32Array(POINTS);
    const PL = new Uint8Array(POINTS);
    const GA = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < POINTS; i++) {
      const y = 1 - (2 * (i + 0.5)) / POINTS;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const th = GA * i;
      const x = Math.cos(th) * r;
      const z = Math.sin(th) * r;
      PX[i] = x;
      PY[i] = y;
      PZ[i] = z;
      PL[i] = isLand((Math.atan2(x, z) * 180) / Math.PI, (Math.asin(y) * 180) / Math.PI) ? 1 : 0;
    }

    const toVec = ([lon, lat]: [number, number]) => {
      const la = (lat * Math.PI) / 180;
      const lo = (lon * Math.PI) / 180;
      return { x: Math.cos(la) * Math.sin(lo), y: Math.sin(la), z: Math.cos(la) * Math.cos(lo) };
    };
    const pulses = PULSE_POINTS.map((p) => ({ ...toVec(p), ph: Math.random() * 6.28 }));
    const peru = toVec(PERU_MARK);

    /* ------------------------------------------------ estrellas ---------- */
    let stars: { x: number; y: number; z: number; r: number; tw: number }[] = [];

    /* -------------------------------------------------- estado ----------- */
    let W = 0;
    let H = 0;
    let R = 0;
    let dpr = 1;
    let viewLon = 2.1;
    let tilt = 0.34;
    let vel = 0;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let satA = 0.6;
    const AUTO = reduced ? 0 : 0.085;

    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = host!.clientWidth;
      H = host!.clientHeight;
      canvas!.width = Math.max(1, Math.round(W * dpr));
      canvas!.height = Math.max(1, Math.round(H * dpr));
      canvas!.style.width = `${W}px`;
      canvas!.style.height = `${H}px`;
      R = Math.min(W * 0.27, H * 0.385);

      stars = [];
      for (let i = 0; i < STARS; i++) {
        stars.push({
          x: Math.random() * W,
          y: Math.random() * H,
          z: 0.25 + Math.random() * 0.75,
          r: Math.random() < 0.82 ? 0.7 : 1.5,
          tw: Math.random() * Math.PI * 2,
        });
      }
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const cxOf = () => (W < 820 ? W * 0.5 : W * anchorX);
    const cyOf = () => (W < 820 ? H * 0.38 : H * 0.52);

    function orbPt(o: Orbit, a: number) {
      const c = Math.cos(a);
      const s = Math.sin(a);
      const x = o.rr * c;
      const y = o.rr * s * Math.cos(o.inc);
      const z = o.rr * s * Math.sin(o.inc);
      const cr = Math.cos(o.roll);
      const sr = Math.sin(o.roll);
      return { x: x * cr - y * sr, y: x * sr + y * cr, z };
    }

    function drawOrbit(o: Orbit, front: boolean) {
      const cx = cxOf();
      const cy = cyOf();
      const SEG = 140;
      let prev: { sx: number; sy: number } | null = null;
      ctx!.lineWidth = 1;
      for (let k = 0; k <= SEG; k++) {
        const a = (k / SEG) * Math.PI * 2;
        const p = orbPt(o, a);
        const sx = cx + R * p.x;
        const sy = cy - R * p.y;
        if (prev && p.z >= 0 === front) {
          ctx!.strokeStyle = front ? "rgba(170,210,235,.42)" : "rgba(170,210,235,.15)";
          ctx!.beginPath();
          ctx!.moveTo(prev.sx, prev.sy);
          ctx!.lineTo(sx, sy);
          ctx!.stroke();
        }
        prev = { sx, sy };
      }
    }

    function drawSat(front: boolean) {
      const o = ORBITS[0];
      const p = orbPt(o, satA);
      if (p.z >= 0 !== front) return;
      const cx = cxOf();
      const cy = cyOf();
      const sx = cx + R * p.x;
      const sy = cy - R * p.y;
      const q = orbPt(o, satA + 0.02);
      const ang = Math.atan2(-(q.y - p.y), q.x - p.x);
      const u = R / 260;
      ctx!.save();
      ctx!.translate(sx, sy);
      ctx!.rotate(ang + Math.PI / 4);
      ctx!.globalAlpha = front ? 1 : 0.4;
      ctx!.strokeStyle = "#cfe6f7";
      ctx!.fillStyle = "#06101c";
      ctx!.lineWidth = 1.2;
      ctx!.fillRect(-4 * u, -4 * u, 8 * u, 8 * u);
      ctx!.strokeRect(-4 * u, -4 * u, 8 * u, 8 * u);
      ctx!.strokeRect(-20 * u, -4 * u, 13 * u, 8 * u);
      ctx!.strokeRect(7 * u, -4 * u, 13 * u, 8 * u);
      ctx!.beginPath();
      ctx!.moveTo(-13.5 * u, -4 * u);
      ctx!.lineTo(-13.5 * u, 4 * u);
      ctx!.moveTo(13.5 * u, -4 * u);
      ctx!.lineTo(13.5 * u, 4 * u);
      ctx!.moveTo(0, -4 * u);
      ctx!.lineTo(0, -10 * u);
      ctx!.stroke();
      ctx!.restore();
      ctx!.globalAlpha = 1;
    }

    let raf = 0;
    let running = true;
    let prevT = 0;
    let t = 0;

    function frame(now: number) {
      const dt = Math.min(0.05, (now - (prevT || now)) / 1000);
      prevT = now;
      t += dt;

      if (!dragging) {
        const target = -AUTO;
        vel += (target - vel) * Math.min(1, dt * 2.2);
        viewLon += vel * dt;
      }
      satA += ORBITS[0].sp * dt * (reduced ? 0.25 : 1);

      const cx = cxOf();
      const cy = cyOf();
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, W, H);

      /* --- estrellas --- */
      for (const s of stars) {
        s.x -= dt * 2.6 * s.z;
        if (s.x < -2) {
          s.x = W + 2;
          s.y = Math.random() * H;
        }
        const tw = 0.42 + 0.58 * Math.sin(t * 1.5 * s.z + s.tw);
        ctx!.globalAlpha = Math.min(1, 0.95 * s.z * tw);
        ctx!.fillStyle = "#ffffff";
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, s.r, 0, 7);
        ctx!.fill();
        // Destello en las más brillantes.
        if (s.r > 1 && tw > 0.82) {
          ctx!.globalAlpha = (tw - 0.82) * 1.6 * s.z;
          ctx!.fillRect(s.x - s.r * 3.4, s.y - 0.4, s.r * 6.8, 0.8);
          ctx!.fillRect(s.x - 0.4, s.y - s.r * 3.4, 0.8, s.r * 6.8);
        }
      }
      ctx!.globalAlpha = 1;

      /* --- halo --- */
      const g = ctx!.createRadialGradient(cx, cy, R * 0.95, cx, cy, R * 1.4);
      g.addColorStop(0, "rgba(60,150,200,.22)");
      g.addColorStop(1, "rgba(60,150,200,0)");
      ctx!.fillStyle = g;
      ctx!.beginPath();
      ctx!.arc(cx, cy, R * 1.4, 0, 7);
      ctx!.fill();

      ORBITS.forEach((o) => drawOrbit(o, false));
      drawSat(false);

      /* --- disco --- */
      const d = ctx!.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
      d.addColorStop(0, "#0e2c48");
      d.addColorStop(0.6, "#081a30");
      d.addColorStop(1, "#02070e");
      ctx!.fillStyle = d;
      ctx!.beginPath();
      ctx!.arc(cx, cy, R, 0, 7);
      ctx!.fill();
      ctx!.strokeStyle = "rgba(120,200,230,.3)";
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.arc(cx, cy, R, 0, 7);
      ctx!.stroke();

      /* --- superficie --- */
      const cl = Math.cos(viewLon);
      const sl = Math.sin(viewLon);
      const ct = Math.cos(tilt);
      const st = Math.sin(tilt);
      const u = R / 260;
      const sizeL = 2.0 * u;
      const sizeS = 1.15 * u;
      for (let i = 0; i < POINTS; i++) {
        const x0 = PX[i];
        const z0 = PZ[i];
        const x = x0 * cl - z0 * sl;
        const z = x0 * sl + z0 * cl;
        const y0 = PY[i];
        const y = y0 * ct - z * st;
        const z2 = y0 * st + z * ct;
        if (z2 <= 0.02) continue;
        const lit = Math.max(0, Math.min(1, 0.55 * z2 + 0.25 * (-x * 0.6 + y * 0.5) + 0.25));
        const lv = Math.max(0, Math.min(LIGHT_LEVELS - 1, Math.round(lit * (LIGHT_LEVELS - 1))));
        const sx = cx + R * x;
        const sy = cy - R * y;
        if (PL[i]) {
          ctx!.fillStyle = LAND_PAL[lv];
          const s = sizeL * (0.55 + 0.45 * z2);
          ctx!.fillRect(sx - s / 2, sy - s / 2, s, s);
        } else {
          ctx!.fillStyle = SEA_PAL[lv];
          const s = sizeS * (0.6 + 0.4 * z2);
          ctx!.fillRect(sx - s / 2, sy - s / 2, s, s);
        }
      }

      /* --- pulsos --- */
      for (const v of pulses) {
        const hx = v.x * cl - v.z * sl;
        const hz = v.x * sl + v.z * cl;
        const hy = v.y * ct - hz * st;
        const hz2 = v.y * st + hz * ct;
        if (hz2 <= 0.05) continue;
        const sx = cx + R * hx;
        const sy = cy - R * hy;
        const pulse = (Math.sin(t * 2.2 + v.ph) + 1) / 2;
        ctx!.globalAlpha = Math.min(1, hz2 * 2.2);
        ctx!.fillStyle = `rgba(255,138,76,${(0.18 + 0.2 * pulse).toFixed(2)})`;
        ctx!.beginPath();
        ctx!.arc(sx, sy, (5 + 7 * pulse) * u * 1.2, 0, 7);
        ctx!.fill();
        ctx!.fillStyle = "#ff9a5c";
        ctx!.beginPath();
        ctx!.arc(sx, sy, 2.6 * u * 1.2, 0, 7);
        ctx!.fill();
        ctx!.globalAlpha = 1;
      }

      /* --- marca del Perú --- */
      {
        const hx = peru.x * cl - peru.z * sl;
        const hz = peru.x * sl + peru.z * cl;
        const hy = peru.y * ct - hz * st;
        const hz2 = peru.y * st + hz * ct;
        if (hz2 > 0.08) {
          const sx = cx + R * hx;
          const sy = cy - R * hy;
          const ring = 9 + 5 * ((Math.sin(t * 1.5) + 1) / 2);
          ctx!.globalAlpha = Math.min(1, hz2 * 2);
          ctx!.strokeStyle = "rgba(216,255,51,.85)";
          ctx!.lineWidth = 1.3;
          ctx!.beginPath();
          ctx!.arc(sx, sy, ring * u * 1.2, 0, 7);
          ctx!.stroke();
          ctx!.fillStyle = "#d8ff33";
          ctx!.beginPath();
          ctx!.arc(sx, sy, 2.4 * u * 1.2, 0, 7);
          ctx!.fill();
          ctx!.globalAlpha = 1;
        }
      }

      ORBITS.forEach((o) => drawOrbit(o, true));
      drawSat(true);

      if (running) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    /* --------------------------------------------- interacción ---------- */
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      vel = 0;
      host.classList.add("globe--drag");
      try {
        host.setPointerCapture(e.pointerId);
      } catch {
        /* algunos navegadores lo rechazan; el arrastre sigue funcionando */
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      const k = 2.2 / (R * 2);
      viewLon -= dx * k * 1.6;
      vel = -dx * k * 1.6 * 60;
      tilt = Math.max(-0.9, Math.min(0.9, tilt + dy * 0.005));
    };
    const onUp = () => {
      dragging = false;
      host.classList.remove("globe--drag");
    };
    host.addEventListener("pointerdown", onDown);
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerup", onUp);
    host.addEventListener("pointercancel", onUp);

    const onVis = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        prevT = 0;
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      host.removeEventListener("pointerdown", onDown);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerup", onUp);
      host.removeEventListener("pointercancel", onUp);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [anchorX]);

  return (
    <div className="globe" ref={hostRef}>
      <canvas ref={canvasRef} aria-hidden="true" />
    </div>
  );
}
