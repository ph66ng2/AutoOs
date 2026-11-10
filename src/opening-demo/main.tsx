import { createRoot } from "react-dom/client";
import { OpeningDemo } from "./OpeningDemo";

// Sem StrictMode de propósito: a página controla o tempo das animações quadro a quadro.
createRoot(document.getElementById("root")!).render(<OpeningDemo />);
