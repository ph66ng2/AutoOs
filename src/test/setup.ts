import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

// Filtros lembrados (useEstadoLembrado) e rascunhos não vazam de um teste para o outro.
afterEach(() => {
  try { sessionStorage.clear(); } catch { /* sem armazenamento */ }
  // Rascunhos automáticos (useRascunho) também.
  try {
    Object.keys(localStorage).filter((chave) => chave.startsWith("autoos:rascunho:")).forEach((chave) => localStorage.removeItem(chave));
  } catch { /* sem armazenamento */ }
});
