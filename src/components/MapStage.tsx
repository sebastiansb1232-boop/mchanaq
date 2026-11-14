import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import type {
  Classification,
  HotspotFeature,
  MetricId,
  MetricItem,
  TerritoryCollection,
} from "../api/types";
import { CLASSIFICATION_LABELS, METRIC_LABELS, SENSOR_META } from "../api/types";
import {
  PERU_BOUNDS,
  PERU_CENTER,
  formatLatLon,
  rectRing,
  ringAreaKm2,
  ringFromGeoJson,
  type LatLon,
} from "../lib/geo";
import { cividisCss } from "../lib/palette";
import { renderSpreadPNG, type SpreadResult } from "../lib/spread";

export type DrawMode = "pan" | "polygon" | "rect" | "ignition";

export interface BaseLayerId {
  id: "dark" | "terrain" | "satellite";
}

interface Props {
  mode: DrawMode;
  onModeChange: (m: DrawMode) => void;
  ring: LatLon[] | null;
  onRingChange: (r: LatLon[] | null) => void;
  ignition: LatLon | null;
  onIgnitionChange: (p: LatLon | null) => void;
  hotspots: HotspotFeature[];
  showHotspots: boolean;

  /** Límites de los territorios del tipo activo. */
  territories: TerritoryCollection | null;
  /** Un valor por territorio. Vacío = coropleta apagada. */
  choropleth: MetricItem[];
  metric: MetricId;
  metricUnit: string | null;
  selectedId: string;
  onSelectTerritory: (id: string) => void;

  spread: SpreadResult | null;
  spreadTime: number;
  spreadHorizon: number;
  baseLayer: "dark" | "relief" | "satellite";
  /** Dirección del viento del día, 0–360°, desde dónde sopla. */
  windDirDeg: number | null;
  windSpeedMs: number | null;
  /** La rosa de viento solo se muestra en la vista de simulación. */
  showWind: boolean;
  /** Cambia cuando el ancho disponible cambia; obliga a Leaflet a reencuadrar. */
  relayoutKey: string;
}

/** Punto de cierre del poligono: tolerancia en pixeles sobre el primer vertice. */
const CLOSE_TOLERANCE_PX = 14;
/** Tope de puntos dibujados, para no bloquear el navegador. */
const MAX_DRAWN_POINTS = 9000;

/**
 * Capas base sin clave de API.
 *
 * Se retiraron las teselas de CARTO porque ahora exigen una clave y el mapa
 * aparecía cubierto de marcas "API KEY REQUIRED". El mapa oscuro se consigue
 * invirtiendo por CSS las teselas estándar de OpenStreetMap, que no piden
 * clave; las otras dos vienen de servicios abiertos de Esri y OpenTopoMap.
 */
const BASE_LAYERS = {
  dark: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
    filtered: true,
  },
  relief: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution:
      'Mapa &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM | Estilo: <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
    maxZoom: 17,
    filtered: false,
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imágenes: Esri, Maxar, Earthstar Geographics",
    maxZoom: 18,
    filtered: false,
  },
} as const;

export function MapStage(props: Props) {
  const {
    mode,
    onModeChange,
    ring,
    onRingChange,
    ignition,
    onIgnitionChange,
    hotspots,
    showHotspots,
    territories,
    choropleth,
    metric,
    metricUnit,
    selectedId,
    onSelectTerritory,
    spread,
    spreadTime,
    spreadHorizon,
    baseLayer,
    windDirDeg,
    windSpeedMs,
    showWind,
    relayoutKey,
  } = props;

  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseRef = useRef<L.TileLayer | null>(null);
  const territoryLayer = useRef<L.LayerGroup | null>(null);
  const hotspotLayer = useRef<L.LayerGroup | null>(null);
  const drawLayer = useRef<L.LayerGroup | null>(null);
  const spreadOverlay = useRef<L.ImageOverlay | null>(null);
  const rendererRef = useRef<L.Canvas | null>(null);

  const [draft, setDraft] = useState<LatLon[]>([]);
  const [cursor, setCursor] = useState<LatLon | null>(null);
  const [zoom, setZoom] = useState(5.4);

  // Los manejadores viven en un ref para no recrear los listeners de Leaflet
  // en cada render.
  const handlers = useRef({ mode, draft, onRingChange, onIgnitionChange, onModeChange });
  handlers.current = { mode, draft, onRingChange, onIgnitionChange, onModeChange };

  /* ---------------------------------------------------------------- mapa -- */
  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;

    const map = L.map(hostRef.current, {
      center: PERU_CENTER,
      zoom: 5.4,
      zoomControl: true,
      attributionControl: true,
      zoomSnap: 0.25,
      wheelPxPerZoomLevel: 110,
      minZoom: 4,
      maxZoom: 18,
      worldCopyJump: false,
    });

    // El trabajo es sobre el Peru: se acota el paneo con un margen generoso.
    map.setMaxBounds(
      L.latLngBounds(
        L.latLng(PERU_BOUNDS.south - 6, PERU_BOUNDS.west - 8),
        L.latLng(PERU_BOUNDS.north + 6, PERU_BOUNDS.east + 8)
      )
    );

    L.control.scale({ imperial: false, position: "bottomright", maxWidth: 160 }).addTo(map);

    rendererRef.current = L.canvas({ padding: 0.4 });
    // El orden de alta fija el orden de pintado: los límites van debajo de
    // los focos, para que un punto nunca quede tapado por su territorio.
    territoryLayer.current = L.layerGroup().addTo(map);
    hotspotLayer.current = L.layerGroup().addTo(map);
    drawLayer.current = L.layerGroup().addTo(map);

    map.on("click", (e: L.LeafletMouseEvent) => {
      const h = handlers.current;
      const p: LatLon = [e.latlng.lat, e.latlng.lng];

      if (h.mode === "ignition") {
        h.onIgnitionChange(p);
        h.onModeChange("pan");
        return;
      }
      if (h.mode === "polygon") {
        setDraft((prev) => {
          if (prev.length >= 3) {
            const first = map.latLngToContainerPoint(L.latLng(prev[0][0], prev[0][1]));
            const here = map.latLngToContainerPoint(e.latlng);
            if (first.distanceTo(here) < CLOSE_TOLERANCE_PX) {
              h.onRingChange(prev);
              h.onModeChange("pan");
              return [];
            }
          }
          return [...prev, p];
        });
        return;
      }
      if (h.mode === "rect") {
        setDraft((prev) => {
          if (prev.length === 0) return [p];
          h.onRingChange(rectRing(prev[0], p));
          h.onModeChange("pan");
          return [];
        });
      }
    });

    map.on("dblclick", (e: L.LeafletMouseEvent) => {
      const h = handlers.current;
      if (h.mode !== "polygon") return;
      L.DomEvent.stop(e as unknown as Event);
      setDraft((prev) => {
        if (prev.length >= 3) {
          h.onRingChange(prev);
          h.onModeChange("pan");
        }
        return [];
      });
    });

    map.on("mousemove", (e: L.LeafletMouseEvent) => setCursor([e.latlng.lat, e.latlng.lng]));
    map.on("mouseout", () => setCursor(null));
    map.on("zoomend", () => setZoom(map.getZoom()));

    mapRef.current = map;
    // El contenedor arranca con tamanio cero en algunos layouts de grilla.
    setTimeout(() => map.invalidateSize(), 60);

    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(hostRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  /* ----------------------- reencuadre cuando cambia el ancho disponible -- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // La transición de ancho dura 220 ms en CSS.
    const id = setTimeout(() => map.invalidateSize({ animate: false }), 260);
    return () => clearTimeout(id);
  }, [relayoutKey]);

  /* -------------------------------------------------------- capa de base -- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (baseRef.current) map.removeLayer(baseRef.current);
    const cfg = BASE_LAYERS[baseLayer];
    baseRef.current = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: cfg.maxZoom,
      maxNativeZoom: cfg.maxZoom,
      crossOrigin: true,
    }).addTo(map);
    baseRef.current.setZIndex(1);
    // El tema oscuro se obtiene invirtiendo las teselas claras por CSS.
    const pane = map.getPane("tilePane");
    if (pane) pane.classList.toggle("tilePane--dark", cfg.filtered);
  }, [baseLayer]);

  /* -------------------------------------------- teclado: Esc y Enter ------ */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDraft([]);
        onModeChange("pan");
      }
      if (e.key === "Enter" && mode === "polygon" && draft.length >= 3) {
        onRingChange(draft);
        setDraft([]);
        onModeChange("pan");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, draft, onRingChange, onModeChange]);

  /* ------------------------------------------------- coropleta y límites -- */

  /** Techo de la escala: percentil 95, para que un valor extremo no la aplaste. */
  const scale = useMemo(() => {
    const vals = choropleth
      .map((it) => it.value)
      .filter((v): v is number => typeof v === "number" && isFinite(v))
      .sort((a, b) => a - b);
    if (!vals.length) return null;
    const lo = vals[0];
    const hi = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.95))];
    return { lo, hi: hi > lo ? hi : lo + 1 };
  }, [choropleth]);

  useEffect(() => {
    const layer = territoryLayer.current;
    if (!layer) return;
    layer.clearLayers();
    if (!territories?.features?.length) return;

    const byId = new Map(choropleth.map((it) => [it.territory_id, it.value]));

    // La clasificación es cualitativa: cuatro escalones de la misma rampa,
    // no una interpolación, porque entre «moderada» y «alta» no hay medios.
    const classStop: Record<Classification, number> = {
      not_evaluable: 0,
      partial: 0.2,
      low: 0.3,
      moderate: 0.62,
      high: 0.95,
    };

    for (const f of territories.features) {
      const id = f.properties.territory_id;
      const raw = byId.get(id);
      const selected = id === selectedId;

      let t: number | null = null;
      if (typeof raw === "number" && scale) {
        t = Math.max(0, Math.min(1, (raw - scale.lo) / (scale.hi - scale.lo)));
      } else if (typeof raw === "string" && raw in classStop) {
        t = classStop[raw as Classification];
      }

      // Sin dato no se pinta un color de la rampa: se deja hueco y se dice
      // «Sin datos». Pintarlo con el extremo bajo sería leerlo como cero.
      const hasValue = t !== null && raw !== null && raw !== undefined;

      const rings =
        f.geometry.type === "Polygon"
          ? [f.geometry.coordinates as number[][][]].map((c) => c[0])
          : (f.geometry.coordinates as number[][][][]).map((poly) => poly[0]);

      for (const r of rings) {
        const latlngs = ringFromGeoJson(r as [number, number][]);
        const poly = L.polygon(latlngs, {
          renderer: rendererRef.current ?? undefined,
          color: selected ? "#d8ff33" : "rgba(255,255,255,0.3)",
          weight: selected ? 2.2 : 0.8,
          fillColor: hasValue ? cividisCss(t as number) : "#2a2f36",
          fillOpacity: choropleth.length === 0 ? 0.04 : hasValue ? 0.72 : 0.22,
        });

        const label = f.properties.territory_name ?? id;
        const shown =
          raw === null || raw === undefined
            ? "Sin datos"
            : typeof raw === "string"
              ? (CLASSIFICATION_LABELS[raw as Classification] ?? raw)
              : `${Number(raw).toLocaleString("es-PE", { maximumFractionDigits: 6 })}${metricUnit ? ` ${metricUnit}` : ""}`;

        poly
          .bindTooltip(`<b>${label}</b><br/>${METRIC_LABELS[metric]}: ${shown}`, {
            direction: "top",
            opacity: 0.95,
          })
          .on("click", () => onSelectTerritory(id))
          .addTo(layer);
      }
    }
  }, [territories, choropleth, metric, metricUnit, selectedId, onSelectTerritory, scale]);

  /* ------------------------------------------------------------ hotspots -- */
  useEffect(() => {
    const layer = hotspotLayer.current;
    if (!layer) return;
    layer.clearLayers();
    if (!showHotspots || hotspots.length === 0) return;

    // Por encima de cierto volumen se muestra una fraccion uniforme, para que
    // el mapa siga respondiendo. La cifra real sigue en el panel de metricas.
    const step = Math.max(1, Math.ceil(hotspots.length / MAX_DRAWN_POINTS));
    const radius = zoom < 6 ? 1.6 : zoom < 8 ? 2.4 : zoom < 10 ? 3.4 : 4.6;

    for (let i = 0; i < hotspots.length; i += step) {
      const f = hotspots[i];
      const [lon, lat] = f.geometry.coordinates;
      const pr = f.properties;
      const conf = pr.confidence;

      // La clase 7 es confianza baja y se dibuja apagada: va aparte del
      // indicador principal, que usa 8–9.
      const low = conf === 7 || conf === "low";
      const high = conf === 9 || conf === "high";

      L.circleMarker([lat, lon], {
        renderer: rendererRef.current ?? undefined,
        radius,
        stroke: false,
        fillColor: SENSOR_META[pr.sensor]?.color ?? "#f8850c",
        fillOpacity: low ? 0.32 : high ? 0.95 : 0.7,
        interactive: zoom >= 8,
      })
        .bindTooltip(
          `<b>${SENSOR_META[pr.sensor]?.short ?? pr.sensor}</b> · ${pr.date}<br/>` +
            `${pr.frp_mw !== null && pr.frp_mw !== undefined ? `FRP ${pr.frp_mw} MW · ` : ""}` +
            `confianza ${conf ?? "—"}<br/>${lat.toFixed(4)}, ${lon.toFixed(4)}`,
          { direction: "top", opacity: 0.95 }
        )
        .addTo(layer);
    }
  }, [hotspots, showHotspots, zoom]);

  /* ------------------------------------------- poligono, borrador, ignicion */
  useEffect(() => {
    const layer = drawLayer.current;
    if (!layer) return;
    layer.clearLayers();

    if (ring && ring.length >= 3) {
      L.polygon(ring, {
        color: "#d8ff33",
        weight: 1.6,
        fillColor: "#d8ff33",
        fillOpacity: 0.045,
        dashArray: "5 4",
      }).addTo(layer);
      for (const v of ring) {
        L.circleMarker(v, {
          radius: 3,
          color: "#d8ff33",
          weight: 1.4,
          fillColor: "#000",
          fillOpacity: 1,
        }).addTo(layer);
      }
    }

    if (draft.length > 0) {
      const path: LatLon[] = cursor && mode === "polygon" ? [...draft, cursor] : draft;
      if (mode === "rect" && cursor && draft.length === 1) {
        L.polygon(rectRing(draft[0], cursor), {
          color: "#d8ff33",
          weight: 1.4,
          dashArray: "3 4",
          fillColor: "#d8ff33",
          fillOpacity: 0.05,
        }).addTo(layer);
      } else if (path.length >= 2) {
        L.polyline(path, { color: "#d8ff33", weight: 1.4, dashArray: "3 4" }).addTo(layer);
      }
      for (const [i, v] of draft.entries()) {
        L.circleMarker(v, {
          radius: i === 0 ? 5 : 3,
          color: "#d8ff33",
          weight: 1.6,
          fillColor: i === 0 ? "#d8ff33" : "#000",
          fillOpacity: 1,
        }).addTo(layer);
      }
    }

    if (ignition) {
      L.circleMarker(ignition, {
        radius: 7,
        color: "#ff4a24",
        weight: 2,
        fillColor: "#ff4a24",
        fillOpacity: 0.45,
      })
        .bindTooltip("Punto de ignicion hipotetico", { direction: "top" })
        .addTo(layer);
      L.circleMarker(ignition, {
        radius: 2,
        color: "#fff",
        weight: 0,
        fillColor: "#fff",
        fillOpacity: 1,
      }).addTo(layer);
    }
  }, [ring, draft, cursor, mode, ignition]);

  /* ------------------------------------------------- superposicion de fuego */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (spreadOverlay.current) {
      map.removeLayer(spreadOverlay.current);
      spreadOverlay.current = null;
    }
    if (!spread) return;

    const url = renderSpreadPNG(spread, spreadTime, spreadHorizon);
    if (!url) return;
    const b = L.latLngBounds(
      L.latLng(spread.bounds.south, spread.bounds.west),
      L.latLng(spread.bounds.north, spread.bounds.east)
    );
    spreadOverlay.current = L.imageOverlay(url, b, {
      opacity: 0.78,
      interactive: false,
      className: "spread-overlay",
    }).addTo(map);
    spreadOverlay.current.setZIndex(350);
  }, [spread, spreadTime, spreadHorizon]);

  /* ----------------------------------- encuadrar el frente recien calculado */
  // Un frente de pocos miles de hectareas es invisible dentro de un area de
  // interes grande, asi que al terminar la simulacion el mapa se acerca a el.
  const framedRef = useRef<SpreadResult | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !spread || framedRef.current === spread) return;
    framedRef.current = spread;
    const rb = spread.reachedBounds;
    if (!rb) return;
    map.flyToBounds(
      L.latLngBounds(L.latLng(rb.south, rb.west), L.latLng(rb.north, rb.east)).pad(1.1),
      { duration: 0.8, maxZoom: 14 }
    );
  }, [spread]);

  /* --------------------------------------------- encuadrar el area nueva -- */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ring || ring.length < 3) return;
    map.flyToBounds(L.latLngBounds(ring.map((p) => L.latLng(p[0], p[1]))), {
      padding: [70, 70],
      duration: 0.7,
      maxZoom: 11,
    });
  }, [ring]);

  const areaKm2 = useMemo(() => (ring ? ringAreaKm2(ring) : 0), [ring]);

  const hint =
    mode === "polygon"
      ? draft.length === 0
        ? "Clic para el primer vertice"
        : draft.length < 3
        ? `${draft.length} vertice(s) · faltan ${3 - draft.length}`
        : "Clic en el primer vertice, doble clic o Enter para cerrar"
      : mode === "rect"
      ? draft.length === 0
        ? "Clic en una esquina"
        : "Clic en la esquina opuesta"
      : mode === "ignition"
      ? "Clic para situar la ignicion hipotetica"
      : null;

  return (
    <div className="stage">
      <div
        ref={hostRef}
        className={`map${mode !== "pan" ? " map--drawing" : ""}`}
        role="application"
        aria-label="Mapa del Peru con focos termicos"
      />

      <div className="ov ov--tl">
        <div className="toolbar" role="toolbar" aria-label="Herramientas del mapa">
          <button
            className={`btn${mode === "pan" ? " btn--on" : ""}`}
            onClick={() => {
              setDraft([]);
              onModeChange("pan");
            }}
            title="Mover el mapa"
          >
            Mover
          </button>
          <button
            className={`btn${mode === "polygon" ? " btn--on" : ""}`}
            onClick={() => {
              setDraft([]);
              onModeChange(mode === "polygon" ? "pan" : "polygon");
            }}
            title="Dibujar un area poligonal"
          >
            Poligono
          </button>
          <button
            className={`btn${mode === "rect" ? " btn--on" : ""}`}
            onClick={() => {
              setDraft([]);
              onModeChange(mode === "rect" ? "pan" : "rect");
            }}
            title="Dibujar un rectangulo"
          >
            Rect
          </button>
          <button
            className={`btn${mode === "ignition" ? " btn--on" : ""}`}
            onClick={() => {
              setDraft([]);
              onModeChange(mode === "ignition" ? "pan" : "ignition");
            }}
            title="Situar el punto de ignicion de la simulacion"
          >
            Ignicion
          </button>
          <button
            className="btn"
            disabled={!ring && !ignition && draft.length === 0}
            onClick={() => {
              setDraft([]);
              onRingChange(null);
              onIgnitionChange(null);
              onModeChange("pan");
            }}
            title="Borrar el area y la ignicion"
          >
            Limpiar
          </button>
        </div>
      </div>

      <div className="ov ov--tr">
        <div className="hud">
          <div className="hud__row">
            <span>Cursor</span>
            <b>{cursor ? formatLatLon(cursor) : "—"}</b>
          </div>
          <div className="hud__row">
            <span>Zoom</span>
            <b>{zoom.toFixed(2)}</b>
          </div>
          <div className="hud__row">
            <span>Area</span>
            <b>{ring ? `${Math.round(areaKm2).toLocaleString("es-PE")} km²` : "Perú completo"}</b>
          </div>
          <div className="hud__row">
            <span>Focos en vista</span>
            <b>{hotspots.length.toLocaleString("es-PE")}</b>
          </div>
          {hotspots.length > MAX_DRAWN_POINTS && (
            <div className="hud__row">
              <span className="muted">Dibujados</span>
              <b className="muted">1 de cada {Math.ceil(hotspots.length / MAX_DRAWN_POINTS)}</b>
            </div>
          )}
          {hint && <div className="hud__hint">{hint} · Esc cancela</div>}
        </div>
      </div>

      <div className="ov ov--bl">
        <div className="legend">
          <div className="legend__title">Sensor</div>
          <div className="legend__items" style={{ marginTop: 0, borderTop: 0, paddingTop: 0 }}>
            {(Object.keys(SENSOR_META) as (keyof typeof SENSOR_META)[]).map((s) => (
              <div className="legend__item" key={s}>
                <i className="legend__swatch" style={{ background: SENSOR_META[s].color }} />
                <span>
                  {SENSOR_META[s].label} · {SENSOR_META[s].resolution}
                </span>
              </div>
            ))}
            {showWind && windDirDeg !== null && (
              <div className="legend__item" style={{ marginTop: 2 }}>
                <i
                  className="legend__swatch"
                  style={{
                    background: "transparent",
                    borderLeft: "5px solid transparent",
                    borderRight: "5px solid transparent",
                    borderBottom: "9px solid var(--ember)",
                    width: 0,
                    height: 0,
                    transform: `rotate(${windDirDeg + 180}deg)`,
                  }}
                />
                <span>
                  Viento {windSpeedMs?.toFixed(1) ?? "—"} m/s · desde{" "}
                  {Math.round(windDirDeg)}°
                </span>
              </div>
            )}
            {spread && (
              <div className="legend__item">
                <i
                  className="legend__swatch"
                  style={{ background: "linear-gradient(90deg,#f3e55c,#e65c2f,#480f62)" }}
                />
                <span>Frente simulado · Fase 2 · +6/12/24 h</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
