import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { IS_SAAS_BUILD } from "@/lib/runtime-mode";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { AcessoPortalDialog } from "@/components/equipamentos/AcessoPortalDialog";
import { PortalClientePanel } from "@/components/equipamentos/PortalClientePanel";
import { EnvioManualOrcamentoDialog } from "@/components/equipamentos/EnvioManualOrcamentoDialog";
import { ProrrogarPrazoDialog } from "@/components/equipamentos/ProrrogarPrazoDialog";
import { gerarNovaSenhaEnvioManual } from "@/lib/envio-orcamento";
import { ehErroPrazoVencido } from "@/lib/orcamento-prazo";
import {
  SENSITIVE_PERMISSIONS,
  type DecisaoOrcamentoInfo,
  type EnvioManualOrcamento,
  type ClienteId,
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

type PermissaoSensivel = (typeof SENSITIVE_PERMISSIONS)[keyof typeof SENSITIVE_PERMISSIONS];

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
  const { ensureSensitiveAccess, hasAnyPermission } = useSensitiveAccess();
  const [info, setInfo] = useState<DecisaoOrcamentoInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consultado, setConsultado] = useState<ClienteId | null>(null);
  const [painelAberto, setPainelAberto] = useState(false);
  const [acessoAberto, setAcessoAberto] = useState(false);
  const [prorrogarAberto, setProrrogarAberto] = useState(false);
  const [envioManual, setEnvioManual] = useState<EnvioManualOrcamento | null>(null);
  const [contatosVersao, setContatosVersao] = useState(0);
  const equipamentoId = equipamento.id;
  // Troca rápida de equipamento: só a consulta do equipamento atual pode atualizar o estado.
  const atualRef = useRef(equipamentoId);
  atualRef.current = equipamentoId;

  const carregar = useCallback(async () => {
    if (!equipamentoId) return;
    if (IS_SAAS_BUILD) {
      setInfo(null);
      setError(null);
      setLoading(false);
      setConsultado(equipamentoId);
      return;
    }
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
    setProrrogarAberto(false);
    setEnvioManual(null);
  }, [equipamentoId]);

  const gerarNovaSenha = useCallback(async () => {
    if (!equipamentoId) return null;
    if (IS_SAAS_BUILD) return null;
    const verificacao = await db.buscarVerificacao(equipamentoId);
    if (!verificacao) throw new Error("Verificação não encontrada.");
    return gerarNovaSenhaEnvioManual(equipamento, verificacao);
  }, [equipamento, equipamentoId]);
  const fecharEnvioManual = useCallback(() => setEnvioManual(null), []);

  const executar = useCallback(
    async (
      permission: PermissaoSensivel | PermissaoSensivel[],
      title: string,
      description: string,
      acao: () => Promise<void>,
    ) => {
      const liberado = await ensureSensitiveAccess({
        title,
        description,
        ...(Array.isArray(permission) ? { anyPermission: permission } : { permission }),
      });
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
    if (!equipamentoId || IS_SAAS_BUILD) return;
    void executar(
      [SENSITIVE_PERMISSIONS.MANAGE_STATUS_LINKS, SENSITIVE_PERMISSIONS.PREPARE_QUOTES],
      "Publicar orçamento no portal",
      "Confirme o acesso para publicar o orçamento atual no Portal do Cliente. Se ele mudou, a versão anterior deixa de aceitar respostas.",
      async () => {
        try {
          const publicado = await db.publicarOrcamentoPortal(equipamentoId);
          toast.success(publicado.nova
            ? `Versão ${publicado.versao} publicada no portal.`
            : `A versão ${publicado.versao} já estava publicada com este conteúdo.`);
        } catch (cause) {
          // Prazo vencido tem saída própria: o diálogo prorroga e publica. Sem erro solto na tela.
          if (typeof cause === "string" && ehErroPrazoVencido(cause)) {
            // Prorrogar o prazo é da permissão financeira ou da de elaborar orçamentos: sem elas, o botão não funcionaria.
            if (!hasAnyPermission([SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS, SENSITIVE_PERMISSIONS.PREPARE_QUOTES])) {
              throw "O prazo de aprovação do orçamento já terminou. Peça a quem pode prorrogar o prazo para atualizá-lo antes de publicar.";
            }
            setProrrogarAberto(true);
            return;
          }
          throw cause;
        }
      },
    );
  }, [equipamentoId, executar, hasAnyPermission]);

  const tratarSolicitacao = useCallback((id: number) => {
    if (IS_SAAS_BUILD) return;
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
      {equipamentoId ? (
        <ProrrogarPrazoDialog
          open={prorrogarAberto}
          onOpenChange={setProrrogarAberto}
          equipamentoId={equipamentoId}
          onConcluido={carregar}
          onEnvioManual={setEnvioManual}
        />
      ) : null}
      <EnvioManualOrcamentoDialog envio={envioManual} onFechar={fecharEnvioManual} onGerarNovaSenha={gerarNovaSenha} />
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
