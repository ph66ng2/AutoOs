import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { AcessoPortalDialog } from "@/components/equipamentos/AcessoPortalDialog";
import { PortalClientePanel } from "@/components/equipamentos/PortalClientePanel";
import {
  SENSITIVE_PERMISSIONS,
  type DecisaoOrcamentoInfo,
  type Equipamento,
  type RespostaOrcamentoInfo,
  type SolicitacaoOrcamentoInfo,
} from "@/types";

export type PortalClienteValor = {
  equipamento: Equipamento;
  info: DecisaoOrcamentoInfo | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  /** Falso até a primeira consulta do equipamento atual terminar. */
  consultado: boolean;
  /** Versão aberta (não encerrada). */
  aberta: boolean;
  /** Resposta final do cliente ainda não aplicada (aprovar/recusar). */
  respostaFinal: RespostaOrcamentoInfo | null;
  /** Dúvidas, negociações e pedidos de ajuste ainda não tratados, do mais recente ao mais antigo. */
  solicitacoesAbertas: SolicitacaoOrcamentoInfo[];
  /** Resposta pendente + mensagens não tratadas: o contador do botão "Portal do Cliente". */
  pendencias: number;
  /** Muda a cada alteração de contatos/acesso, para quem lista contatos recarregar. */
  contatosVersao: number;
  carregar: () => Promise<void>;
  publicar: () => void;
  tratarSolicitacao: (id: number) => void;
  abrirPainel: () => void;
  abrirAcesso: () => void;
};

const PortalClienteContext = createContext<PortalClienteValor | null>(null);

export function usePortalCliente(): PortalClienteValor {
  const valor = useContext(PortalClienteContext);
  if (!valor) throw new Error("usePortalCliente fora do PortalClienteProvider");
  return valor;
}

export function mensagemErro(cause: unknown, fallback: string) {
  return typeof cause === "string" && cause.trim() ? cause : fallback;
}

type Props = {
  equipamento: Equipamento;
  /** Muda quando chega um alerta do portal para este equipamento: recarrega a resposta. */
  sinalPortal?: number;
  children: ReactNode;
};

/**
 * Estado do orçamento no Portal do Cliente para o equipamento aberto. Compartilhado entre o botão
 * "Portal do Cliente" do cabeçalho, a faixa de resumo e o painel com as ações.
 */
export function PortalClienteProvider({ equipamento, sinalPortal, children }: Props) {
  const { ensureSensitiveAccess } = useSensitiveAccess();
  const [info, setInfo] = useState<DecisaoOrcamentoInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consultado, setConsultado] = useState<number | null>(null);
  const [painelAberto, setPainelAberto] = useState(false);
  const [acessoAberto, setAcessoAberto] = useState(false);
  const [contatosVersao, setContatosVersao] = useState(0);
  const equipamentoId = equipamento.id;
  // Troca rápida de equipamento: só a consulta do equipamento atual pode atualizar o estado.
  const atualRef = useRef(equipamentoId);
  atualRef.current = equipamentoId;

  const carregar = useCallback(async () => {
    if (!equipamentoId) return;
    setLoading(true);
    setError(null);
    try {
      const next = await db.obterDecisaoOrcamento(equipamentoId);
      if (atualRef.current !== equipamentoId) return;
      setInfo(next);
    } catch (cause) {
      if (atualRef.current !== equipamentoId) return;
      setError(mensagemErro(cause, "Não foi possível consultar a resposta do cliente."));
    } finally {
      if (atualRef.current === equipamentoId) {
        setLoading(false);
        setConsultado(equipamentoId);
      }
    }
  }, [equipamentoId]);

  useEffect(() => {
    void carregar();
  }, [carregar, equipamento.atualizado_em, sinalPortal]);

  // Outro equipamento: o painel do anterior não deve continuar aberto nem mostrar dados dele.
  useEffect(() => {
    setInfo(null);
    setPainelAberto(false);
    setAcessoAberto(false);
  }, [equipamentoId]);

  const executar = useCallback(
    async (
      permission: (typeof SENSITIVE_PERMISSIONS)[keyof typeof SENSITIVE_PERMISSIONS],
      title: string,
      description: string,
      acao: () => Promise<void>,
    ) => {
      const liberado = await ensureSensitiveAccess({ title, description, permission });
      if (!liberado) return;
      setBusy(true);
      setError(null);
      try {
        await acao();
        await carregar();
      } catch (cause) {
        setError(mensagemErro(cause, "A operação não foi concluída."));
      } finally {
        setBusy(false);
      }
    },
    [carregar, ensureSensitiveAccess],
  );

  const publicar = useCallback(() => {
    if (!equipamentoId) return;
    void executar(
      SENSITIVE_PERMISSIONS.MANAGE_STATUS_LINKS,
      "Publicar orçamento no portal",
      "Confirme o acesso para publicar o orçamento atual no Portal do Cliente. Se ele mudou, a versão anterior deixa de aceitar respostas.",
      async () => {
        const publicado = await db.publicarOrcamentoPortal(equipamentoId);
        toast.success(publicado.nova
          ? `Versão ${publicado.versao} publicada no portal.`
          : `A versão ${publicado.versao} já estava publicada com este conteúdo.`);
      },
    );
  }, [equipamentoId, executar]);

  const tratarSolicitacao = useCallback((id: number) => {
    void executar(
      SENSITIVE_PERMISSIONS.MANAGE_STATUS_LINKS,
      "Mensagem do cliente",
      "Confirme o acesso para marcar a mensagem do cliente como tratada.",
      async () => {
        await db.marcarSolicitacaoOrcamentoTratada(id);
      },
    );
  }, [executar]);

  const valor = useMemo<PortalClienteValor>(() => {
    const vigente = info != null && !info.encerradaMotivo;
    const resposta = vigente ? info?.resposta : null;
    const respostaFinal = resposta && resposta.decisao !== "DESFEITA" && !resposta.aplicadaEm ? resposta : null;
    const solicitacoesAbertas = info?.solicitacoes.filter((item) => !item.tratadaEm) ?? [];
    return {
      equipamento,
      info,
      loading,
      busy,
      error,
      consultado: consultado === equipamentoId,
      aberta: vigente,
      respostaFinal,
      solicitacoesAbertas,
      pendencias: (respostaFinal ? 1 : 0) + solicitacoesAbertas.length,
      contatosVersao,
      carregar,
      publicar,
      tratarSolicitacao,
      abrirPainel: () => setPainelAberto(true),
      abrirAcesso: () => setAcessoAberto(true),
    };
  }, [equipamento, equipamentoId, info, loading, busy, error, consultado, contatosVersao, carregar, publicar, tratarSolicitacao]);

  return (
    <PortalClienteContext.Provider value={valor}>
      {children}
      <PortalClientePanel open={painelAberto} onOpenChange={setPainelAberto} />
      {equipamento.cliente_id ? (
        <AcessoPortalDialog
          open={acessoAberto}
          onOpenChange={setAcessoAberto}
          clienteId={equipamento.cliente_id}
          empresaId={equipamento.empresa_id}
          responsavelContatoId={equipamento.responsavel_contato_id}
          onAlterado={() => setContatosVersao((versao) => versao + 1)}
        />
      ) : null}
    </PortalClienteContext.Provider>
  );
}
