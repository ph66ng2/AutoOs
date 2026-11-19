import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/db";
import { aoMudarPerfis, tecnicosAtivos, type Tecnico } from "@/lib/tecnicos";

/** Técnicos da OS (perfis ativos com "faz atendimento técnico"); atualiza quando os perfis mudam. */
export function useTecnicos(): Tecnico[] {
  const [tecnicos, setTecnicos] = useState<Tecnico[]>(tecnicosAtivos);
  useEffect(() => aoMudarPerfis(() => setTecnicos(tecnicosAtivos())), []);
  return tecnicos;
}

/**
 * Nomes para o filtro de técnico: os técnicos de hoje mais os nomes já gravados
 * nas verificações, para OS antigas (ou de quem deixou de ser técnico) continuarem filtráveis.
 */
export function useNomesFiltroTecnico(): string[] {
  const tecnicos = useTecnicos();
  const [historicos, setHistoricos] = useState<string[]>([]);
  // A sessão atualiza os perfis ao destravar ou trocar de perfil: é a deixa para
  // buscar de novo (antes do PIN o comando falha por falta de sessão).
  const [sessao, setSessao] = useState(0);
  useEffect(() => aoMudarPerfis(() => setSessao((n) => n + 1)), []);
  useEffect(() => {
    let ativo = true;
    Promise.resolve()
      .then(() => db.listarNomesTecnicosVerificacoes())
      .then((nomes) => { if (ativo) setHistoricos(Array.isArray(nomes) ? nomes : []); })
      .catch(() => undefined);
    return () => { ativo = false; };
  }, [sessao]);
  return useMemo(
    () => [...new Set([...tecnicos.map((t) => t.nome), ...historicos])].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [tecnicos, historicos],
  );
}
