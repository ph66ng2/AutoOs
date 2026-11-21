import { useCallback, useEffect, useState } from "react";
import { db } from "@/lib/db";
import { useAtualizacaoAoVivo } from "@/hooks/useAtualizacaoAoVivo";
import type { AbrirChamadoInput, ChamadoSuporte, ConfigSuporte, MensagemSuporte } from "@/types";

/** Suporte pelo Slack: configuração deste computador e os chamados do perfil da sessão. */
export function useSuporte() {
  const [config, setConfig] = useState<ConfigSuporte | null>(null);
  const [chamados, setChamados] = useState<ChamadoSuporte[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    setError(null);
    try {
      const [cfg, lista] = await Promise.all([db.obterConfigSuporte(), db.listarChamadosSuporte()]);
      setConfig(cfg);
      setChamados(lista);
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : String(causa));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useAtualizacaoAoVivo(["suporte_chamados", "suporte_mensagens"], () => void carregar(true));

  const abrirChamado = useCallback(async (input: AbrirChamadoInput) => {
    const chamado = await db.abrirChamadoSuporte(input);
    await carregar(true);
    return chamado;
  }, [carregar]);

  return { config, chamados, loading, error, abrirChamado, recarregar: carregar };
}

/** Conversa de um chamado; só carrega com `ativo` (chamado aberto na lista). `versao` recarrega. */
export function useMensagensChamado(id: number, ativo: boolean, versao: string) {
  const [mensagens, setMensagens] = useState<MensagemSuporte[] | null>(null);
  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    db.listarMensagensChamado(id)
      .then((lista) => { if (vivo) setMensagens(lista); })
      .catch(() => { if (vivo) setMensagens([]); });
    return () => { vivo = false; };
  }, [id, ativo, versao]);
  return mensagens;
}

/** Configuração do suporte (Configurações › Integrações). */
export function useConfigSuporte() {
  const [config, setConfig] = useState<ConfigSuporte | null>(null);
  const [error, setError] = useState<string | null>(null);
  const carregar = useCallback(async () => {
    try {
      setConfig(await db.obterConfigSuporte());
      setError(null);
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : String(causa));
    }
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);
  const salvar = useCallback(async (canal: string, token?: string | null) => {
    const salvo = await db.salvarConfigSuporte(canal, token);
    setConfig(salvo);
    return salvo;
  }, []);
  return { config, error, salvar, recarregar: carregar };
}
