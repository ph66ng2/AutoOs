import { useEffect, useState } from "react";
import { db } from "@/lib/db";

/** Nome da empresa da sessão; null enquanto não há sessão ou se a consulta falhar. */
export function useEmpresaAtiva(chaveSessao: unknown) {
  const [nome, setNome] = useState<string | null>(null);
  useEffect(() => {
    let ativo = true;
    Promise.resolve()
      .then(() => db.obterEmpresaAtiva())
      .then((valor) => { if (ativo) setNome(valor?.trim() || null); })
      .catch(() => { if (ativo) setNome(null); });
    return () => { ativo = false; };
  }, [chaveSessao]);
  return nome;
}
