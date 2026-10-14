import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import PublicStatusPage from "./PublicStatusPage";
import OrcamentoDecisaoPage from "./OrcamentoDecisaoPage";
import "./public-status.css";

const isDecisionRoute = () => window.location.hash.startsWith("#/o/");

/** `#/c/<token>` acompanha o atendimento; `#/o/<token>` responde ao orçamento. */
function App() {
  const [decision, setDecision] = useState(isDecisionRoute);
  useEffect(() => {
    const sync = () => setDecision(isDecisionRoute());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  return decision ? <OrcamentoDecisaoPage /> : <PublicStatusPage />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
