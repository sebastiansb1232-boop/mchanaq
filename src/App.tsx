import { useCallback, useEffect, useState } from "react";
import { SiteNav, type ToolTab } from "./components/SiteNav";
import { Landing } from "./pages/Landing";
import { MapTool } from "./pages/MapTool";
import { useRoute } from "./lib/router";
import type { BackendState } from "./api/client";

export default function App() {
  const [route, go] = useRoute();
  const [tab, setTab] = useState<ToolTab>("calendario");
  const [backend, setBackend] = useState<BackendState>("checking");

  // `onBackend` se pasa a un efecto de MapTool: debe ser estable para no
  // reinstalar el sondeo en cada render.
  const onBackend = useCallback((s: BackendState) => setBackend(s), []);

  // La portada se desplaza dentro de su propio contenedor; la herramienta ocupa
  // la ventana entera. El atributo deja que el CSS trate cada caso.
  useEffect(() => {
    document.documentElement.dataset.route = route;
  }, [route]);

  return (
    <div className={`app app--${route}`}>
      <SiteNav
        route={route}
        onRoute={go}
        tab={route === "mapa" ? tab : undefined}
        onTab={route === "mapa" ? setTab : undefined}
        backend={route === "mapa" ? backend : undefined}
      />

      {route === "inicio" ? (
        <Landing onOpenMap={() => go("mapa")} />
      ) : (
        <MapTool tab={tab} onBackend={onBackend} />
      )}
    </div>
  );
}
