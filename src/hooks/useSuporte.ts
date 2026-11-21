import { useCallback, useEffect, useRef, useState } from "react";
import { db } from "@/lib/db";
import { useAtualizacaoAoVivo } from "@/hooks/useAtualizacaoAoVivo";
import { marcarEnvioAoSuporte } from "@/lib/suporte-ponte";
import type { AbrirChamadoInput, ChamadoSuporte, ConfigSuporte, MensagemSuporte, ResponderChamadoInput } from "@/types";

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
      // Silencioso = atualização ao vivo: lê em segundo plano, sem renovar a sessão.
      const [cfg, lista] = await Promise.all([db.obterConfigSuporte(), db.listarChamadosSuporte(silencioso)]);
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
    marcarEnvioAoSuporte();
    await carregar(true);
    return chamado;
  }, [carregar]);

  const responder = useCallback(async (input: ResponderChamadoInput) => {
    const chamado = await db.responderChamadoSuporte(input);
    marcarEnvioAoSuporte();
    await carregar(true);
    return chamado;
  }, [carregar]);

  const retorno = useCallback(async (id: number, resolvido: boolean) => {
    const chamado = await db.retornoChamadoSuporte(id, resolvido);
    if (!resolvido) marcarEnvioAoSuporte();
    await carregar(true);
    return chamado;
  }, [carregar]);

  return { config, chamados, loading, error, abrirChamado, responder, retorno, recarregar: carregar };
}

/**
 * Conversa de um chamado; só carrega com `ativo` (chamado aberto na lista). `versao` recarrega.
 * Trocar de chamado volta a "carregando" (null) em vez de mostrar a conversa do anterior; a recarga
 * por `versao` (atualização ao vivo) é de segundo plano e não renova a sessão.
 */
export function useMensagensChamado(id: number, ativo: boolean, versao: string) {
  const [carregadas, setCarregadas] = useState<{ id: number; lista: MensagemSuporte[] } | null>(null);
  const idCarregado = useRef<number | null>(null);
  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    const segundoPlano = idCarregado.current === id;
    db.listarMensagensChamado(id, segundoPlano)
      .then((lista) => { if (vivo) { idCarregado.current = id; setCarregadas({ id, lista }); } })
      .catch(() => { if (vivo) { idCarregado.current = id; setCarregadas({ id, lista: [] }); } });
    return () => { vivo = false; };
  }, [id, ativo, versao]);
  return carregadas?.id === id ? carregadas.lista : null;
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
