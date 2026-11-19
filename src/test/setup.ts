import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

// Filtros lembrados (useEstadoLembrado) não vazam de um teste para o outro.
afterEach(() => {
  try { sessionStorage.clear(); } catch { /* sem armazenamento */ }
});
