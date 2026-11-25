import { useCallback, useEffect, useRef, useState } from "react";
import { db } from "@/lib/db";
import { useAtualizacaoAoVivo } from "@/hooks/useAtualizacaoAoVivo";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { marcarEnvioAoSuporte } from "@/lib/suporte-ponte";
import type { AbrirChamadoInput, ChamadoSuporte, ConfigSuporte, MensagemSuporte, ResponderChamadoInput } from "@/types";

/** Suporte pelo Slack: configuração deste computador e os chamados do perfil da sessão. */
export function useSuporte() {
  const [config, setConfig] = useState<ConfigSuporte | null>(null);
  const [chamados, setChamados] = useState<ChamadoSuporte[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Só a leitura mais nova é aplicada: uma recarga ao vivo que responde depois da recarga de uma
  // ação local (ex.: "Resolveu") não pode trazer de volta a lista antiga.
  const pedidoRef = useRef(0);
  const carregar = useCallback(async (silencioso = false) => {
    const pedido = ++pedidoRef.current;
    const atual = () => pedido === pedidoRef.current;
    if (!silencioso) setLoading(true);
    setError(null);
    try {
      // Silencioso = atualização ao vivo: lê em segundo plano, sem renovar a sessão.
      const [cfg, lista] = await Promise.all([db.obterConfigSuporte(), db.listarChamadosSuporte(silencioso)]);
      if (!atual()) return;
      setConfig(cfg);
      setChamados(lista);
    } catch (causa) {
      if (!atual()) return;
      setError(causa instanceof Error ? causa.message : String(causa));
    } finally {
      if (atual()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Recarga automática (ao vivo, foco da janela): de segundo plano, e nenhuma com a sessão
  // bloqueada (não renova a sessão nem tenta ler o que é do perfil).
  const { status } = useSensitiveAccess();
  const desbloqueadaRef = useRef(Boolean(status?.unlocked));
  desbloqueadaRef.current = Boolean(status?.unlocked);
  useAtualizacaoAoVivo(["suporte_chamados", "suporte_mensagens"], () => {
    if (desbloqueadaRef.current) void carregar(true);
  });

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
 * Uma releitura que falha (banco fora por um instante) mantém a conversa já na tela e marca
 * `falhou`; a próxima mudança, a volta do foco ou a reconexão tentam de novo em segundo plano, e
 * `tentarDeNovo` (botão da tela) relê na hora. Falha não vira conversa vazia.
 */
export function useMensagensChamado(id: number, ativo: boolean, versao: string) {
  const [carregadas, setCarregadas] = useState<{ id: number; lista: MensagemSuporte[] } | null>(null);
  const [falhouEm, setFalhouEm] = useState<number | null>(null);
  const [tentativa, setTentativa] = useState<{ id: number; n: number; segundoPlano: boolean } | null>(null);
  const idCarregado = useRef<number | null>(null);
  const falhouRef = useRef<number | null>(null);
  const idAtual = useRef(id);
  idAtual.current = id;
  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    // Releitura do chamado já na tela, ou nova tentativa automática: segundo plano (não renova a sessão).
    const segundoPlano = idCarregado.current === id || (tentativa?.id === id && tentativa.segundoPlano);
    db.listarMensagensChamado(id, segundoPlano)
      .then((lista) => {
        if (!vivo) return;
        idCarregado.current = id;
        falhouRef.current = null;
        setFalhouEm(null);
        setCarregadas({ id, lista });
      })
      .catch(() => {
        if (!vivo) return;
        falhouRef.current = id;
        setFalhouEm(id);
      });
    return () => { vivo = false; };
  }, [id, ativo, versao, tentativa]);
  const tentar = useCallback((segundoPlano: boolean) => {
    setTentativa((atual) => ({ id: idAtual.current, n: (atual?.n ?? 0) + 1, segundoPlano }));
  }, []);
  const tentarDeNovo = useCallback(() => tentar(false), [tentar]);
  useAtualizacaoAoVivo(["suporte_chamados", "suporte_mensagens"], () => {
    if (falhouRef.current === idAtual.current) tentar(true);
  });
  return {
    mensagens: carregadas?.id === id ? carregadas.lista : null,
    falhou: falhouEm === id,
    tentarDeNovo,
  };
}

/** Chamado escolhido que não veio na lista (encerrado antigo): lido pelo id. `null` enquanto não chega. */
export function useChamadoForaDaLista(id: number | null) {
  const [achado, setAchado] = useState<ChamadoSuporte | null>(null);
  useEffect(() => {
    if (id == null) return;
    let vivo = true;
    db.buscarChamadoSuporte(id)
      .then((chamado) => { if (vivo) setAchado(chamado); })
      .catch(() => undefined);
    return () => { vivo = false; };
  }, [id]);
  return id != null && achado?.id === id ? achado : null;
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
