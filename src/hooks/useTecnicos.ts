import { useEffect, useState } from "react";
import { aoMudarPerfis, tecnicosAtivos, type Tecnico } from "@/lib/tecnicos";

/** Técnicos da OS (perfis ativos com "faz atendimento técnico"); atualiza quando os perfis mudam. */
export function useTecnicos(): Tecnico[] {
  const [tecnicos, setTecnicos] = useState<Tecnico[]>(tecnicosAtivos);
  useEffect(() => aoMudarPerfis(() => setTecnicos(tecnicosAtivos())), []);
  return tecnicos;
}
