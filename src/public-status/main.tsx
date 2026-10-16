import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import PublicStatusPage from "./PublicStatusPage";
import PortalApp from "./PortalApp";
import { areaFromHash, type Area } from "./portal-session";
import "./public-status.css";

/** `#/c/` (link de acompanhamento) continua como antes; o resto do endereço é o Portal do Cliente. */
function App() {
  const [area, setArea] = useState<Area>(() => areaFromHash());
  useEffect(() => {
    const sync = () => setArea(areaFromHash());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  if (area === "status") return <PublicStatusPage />;
  return <PortalApp />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
