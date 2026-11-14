import { useEffect, useState } from "react";

/**
 * Enrutador por hash, sin dependencias.
 *
 * Se usa hash y no History API porque la aplicacion se sirve como archivos
 * estaticos y debe poder abrirse tambien desde `file://` o desde una subcarpeta,
 * donde no hay servidor que reescriba rutas.
 */
export type Route = "inicio" | "mapa";

function parse(hash: string): Route {
  return hash.replace(/^#\/?/, "").split("?")[0] === "mapa" ? "mapa" : "inicio";
}

export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));

  useEffect(() => {
    const onHash = () => setRoute(parse(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (r: Route) => {
    window.location.hash = r === "mapa" ? "#/mapa" : "#/";
  };

  return [route, go];
}
