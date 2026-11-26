import { definirCopiaGerencia } from "@/lib/copia-gerencia";
import { definirTecnicosDaEmpresa } from "@/lib/tecnicos";
import type { SecurityProfile } from "@/types";

/**
 * Técnicos de teste no lugar da antiga lista fixa (agora vêm dos perfis com "faz atendimento técnico"),
 * numa instalação de empresa única (BMITAG): a cópia da gerência vale (lib/copia-gerencia).
 */
export function semearTecnicosPadrao() {
  const base = { role: "TECNICO", permissions: [], pin_configured: true, is_default: false, ativo: true, atende_tecnico: true };
  definirTecnicosDaEmpresa([
    { ...base, id: 901, nome: "Ivan", email_profissional: "ivan@bmitag.com.br" },
    { ...base, id: 902, nome: "Isaias", email_profissional: "isaias@bmitag.com.br" },
  ] as SecurityProfile[]);
  definirCopiaGerencia(true);
}
