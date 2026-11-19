import { useCallback, useState } from "react";
import { db } from "@/lib/db";

/** Liga e desliga tipos de aviso do perfil da sessão (salva na hora; a sessão recarrega o perfil). */
export function useAvisosDesligados(iniciais: string[], aoSalvar: () => Promise<unknown> | void) {
  const [desligados, setDesligados] = useState<string[]>(iniciais);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const alternar = useCallback(async (tipo: string, ligado: boolean) => {
    const anterior = desligados;
    const proximo = ligado ? anterior.filter((t) => t !== tipo) : [...new Set([...anterior, tipo])];
    setDesligados(proximo);
    setSalvando(true);
    setErro(null);
    try {
      setDesligados(await db.salvarAvisosDesligados(proximo));
      await aoSalvar();
    } catch (causa) {
      setDesligados(anterior);
      setErro(causa instanceof Error ? causa.message : String(causa));
    } finally {
      setSalvando(false);
    }
  }, [desligados, aoSalvar]);

  return { desligados, alternar, salvando, erro };
}
