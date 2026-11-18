/**
 * Estado e ações do orçamento de insumos (OI-n): carga, formulário, salvar, PDF, envio,
 * aprovação e confirmações. Saiu de OrcamentoInsumosDialog sem mudar a lógica, para a
 * janela e as páginas /vendas/novo e /vendas/:id/editar usarem a mesma regra.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNotification } from "@/hooks/useNotification";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { db } from "@/lib/db";
import {
  acoesOrcamentoInsumos,
  calcularTotaisOrcamentoInsumos,
  linhasSemSaldo,
  orcamentoInsumosVencido,
  validadePadraoOrcamentoInsumos,
  type LinhaOrcamentoInsumos,
} from "@/lib/orcamento-insumos";
import { OrcamentoInsumosService } from "@/lib/orcamento-insumos-service";
import { PdfService, type PdfArtifact } from "@/lib/pdf-service";
import {
  SENSITIVE_PERMISSIONS,
  type Cliente,
  type ClienteContato,
  type FormaPagamento,
  type OrcamentoInsumosDetalhe,
} from "@/types";

export type AcaoInicialOrcamentoInsumos =
  | "pdf"
  | "email"
  | "whatsapp"
  | "aprovar"
  | "renovar"
  | "editar"
  | "reprovar"
  | "cancelar"
  | "entregar"
  | "excluir";

export type AcaoConfirmada = "reprovar" | "cancelar" | "entregar" | "excluir";

function linhasDoDetalhe(detalhe: OrcamentoInsumosDetalhe): LinhaOrcamentoInsumos[] {
  return detalhe.itens.map((item) => ({
    produto_id: item.produto_id,
    descricao: item.descricao,
    categoria: item.categoria,
    quantidade: item.quantidade,
    valor_unitario: item.valor_unitario,
    saldo: item.saldo_estoque ?? null,
  }));
}

function contatoDoDetalhe(detalhe: OrcamentoInsumosDetalhe): ClienteContato | null {
  if (!detalhe.contato_id) return null;
  return {
    id: detalhe.contato_id,
    empresa_id: detalhe.empresa_id,
    cliente_id: detalhe.cliente_id,
    nome: detalhe.contato_nome ?? "",
    email: detalhe.contato_email ?? undefined,
    telefone: detalhe.contato_telefone ?? undefined,
    ativo: true,
  };
}

export interface ParametrosEditorOrcamentoInsumos {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Vazio = novo orçamento. */
  orcamentoId?: number | null;
  onChanged?: () => void;
  acaoInicial?: AcaoInicialOrcamentoInsumos | null;
}

export function useOrcamentoInsumosEditor({
  open,
  onOpenChange,
  orcamentoId = null,
  onChanged,
  acaoInicial = null,
}: ParametrosEditorOrcamentoInsumos) {
  const { success, warning, error: showError } = useNotification();
  const { ensureSensitiveAccess, hasPermission } = useSensitiveAccess();
  // Decisão 23 (1A): sem Ações financeiras, a prévia do PDF abre, mas não há "Baixar",
  // porque salvar o PDF de um rascunho o marca como enviado.
  const podeSalvarPdf = hasPermission(SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS);

  const [detalhe, setDetalhe] = useState<OrcamentoInsumosDetalhe | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [contato, setContato] = useState<ClienteContato | null>(null);
  const [linhas, setLinhas] = useState<LinhaOrcamentoInsumos[]>([]);
  const [desconto, setDesconto] = useState("");
  const [validade, setValidade] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [alterado, setAlterado] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pdf, setPdf] = useState<PdfArtifact | null>(null);
  const [pagamentoAberto, setPagamentoAberto] = useState(false);
  const [erroAprovacao, setErroAprovacao] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<AcaoConfirmada | null>(null);
  const acaoInicialFeita = useRef(false);
  /** Número desta abertura; a carga só libera a ação inicial se ainda for a abertura atual. */
  const aberturaAtual = useRef(0);
  /** Abertura cuja carga terminou com sucesso (o `detalhe` retido de uma abertura anterior não conta). */
  const [aberturaCarregada, setAberturaCarregada] = useState<number | null>(null);

  const aplicarDetalhe = useCallback((novo: OrcamentoInsumosDetalhe) => {
    setDetalhe(novo);
    setLinhas(linhasDoDetalhe(novo));
    setDesconto(novo.desconto > 0 ? String(novo.desconto) : "");
    setValidade(novo.validade ?? "");
    setObservacoes(novo.observacoes ?? "");
    setContato(contatoDoDetalhe(novo));
    setAlterado(false);
  }, []);

  // Abre em branco (novo) ou carrega o orçamento e o cliente (existente).
  useEffect(() => {
    if (!open) return;
    acaoInicialFeita.current = false;
    const abertura = ++aberturaAtual.current;
    let ativo = true;
    setErro(null);
    setErroAprovacao(null);
    setPdf(null);
    setConfirmando(null);
    setPagamentoAberto(false);
    if (orcamentoId == null) {
      // Uma abertura anterior pode ter sido fechada com a carga pendente (o `finally` dela não
      // roda quando `ativo` já é falso); sem isto o "Novo" ficava preso em "Carregando...".
      setCarregando(false);
      setDetalhe(null);
      setCliente(null);
      setContato(null);
      setLinhas([]);
      setDesconto("");
      setValidade(validadePadraoOrcamentoInsumos());
      setObservacoes("");
      setAlterado(false);
      return;
    }
    setCarregando(true);
    db.obterOrcamentoInsumos(orcamentoId)
      .then(async (carregado) => {
        const clienteCarregado = await db.buscarCliente(carregado.cliente_id).catch(() => null);
        if (!ativo) return;
        setCliente(clienteCarregado);
        aplicarDetalhe(carregado);
        setAberturaCarregada(abertura);
      })
      .catch((causa) => {
        if (ativo) setErro(String(causa));
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [open, orcamentoId, aplicarDetalhe]);

  const status = detalhe?.status ?? null;
  const acoes = acoesOrcamentoInsumos(status);
  const descontoNumero = Number(desconto) || 0;
  const totais = useMemo(
    () => calcularTotaisOrcamentoInsumos(linhas, descontoNumero),
    [linhas, descontoNumero],
  );
  const faltas = useMemo(() => linhasSemSaldo(linhas), [linhas]);
  const quantidadesValidas = linhas.every((linha) => Number.isInteger(linha.quantidade) && linha.quantidade > 0);
  const podeSalvar =
    acoes.salvar
    && !ocupado
    && cliente?.id != null
    && linhas.length > 0
    && quantidadesValidas
    && !totais.descontoExcedido
    && Boolean(validade);
  const bloqueadoPorEdicao = alterado || !detalhe;
  const vencido = detalhe ? orcamentoInsumosVencido(detalhe) : false;
  /** Explica por que o Salvar está desabilitado (o aviso de desconto já aparece junto ao campo). */
  const motivoSemSalvar = (() => {
    if (!acoes.salvar || ocupado || podeSalvar) return null;
    if (cliente?.id == null) return "Escolha o cliente para salvar.";
    if (linhas.length === 0) return "Inclua ao menos um item para salvar.";
    if (!quantidadesValidas) return "Informe uma quantidade maior que zero em todos os itens.";
    if (!validade) return "Informe a validade do orçamento.";
    return null;
  })();

  // A ação pedida na lista roda uma vez, quando a carga desta abertura terminou com sucesso.
  // Não basta o `detalhe` ter o mesmo id: ao reabrir, ele ainda é o da abertura anterior (talvez
  // com edição não salva) até a carga nova chegar.
  useEffect(() => {
    if (
      !open
      || !acaoInicial
      || acaoInicialFeita.current
      || carregando
      || aberturaCarregada !== aberturaAtual.current
      || !detalhe
      || detalhe.id !== orcamentoId
    ) return;
    acaoInicialFeita.current = true;
    switch (acaoInicial) {
      case "pdf":
        void gerarPdf();
        break;
      case "email":
        if (acoes.enviar) void enviar("EMAIL");
        break;
      case "whatsapp":
        if (acoes.enviar) void enviar("WHATSAPP");
        break;
      case "aprovar":
        if (acoes.aprovar) void iniciarAprovacao();
        break;
      case "renovar":
        // Renovar validade é editar a data: o campo já está na janela.
        window.setTimeout(() => document.getElementById("oi-validade")?.focus(), 0);
        break;
      case "editar":
        // A janela já abre editável.
        break;
      case "reprovar":
        if (acoes.reprovar) setConfirmando("reprovar");
        break;
      case "cancelar":
        if (acoes.cancelar) setConfirmando("cancelar");
        break;
      case "entregar":
        if (acoes.entregar) setConfirmando("entregar");
        break;
      case "excluir":
        if (acoes.excluir) setConfirmando("excluir");
        break;
    }
    // As funções chamadas leem o estado atual; rodar de novo a cada render repetiria a ação.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, acaoInicial, carregando, aberturaCarregada, detalhe, orcamentoId]);

  function editar<T>(definir: (valor: T) => void) {
    return (valor: T) => {
      definir(valor);
      setAlterado(true);
      setErro(null);
    };
  }

  async function liberar(titulo: string, descricao: string): Promise<boolean> {
    return ensureSensitiveAccess({
      title: titulo,
      description: descricao,
      permission: SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS,
    });
  }

  /** Roda uma ação do backend, aplica o orçamento devolvido e avisa a lista. Devolve a mensagem de erro, se houver. */
  async function executar(
    acao: () => Promise<OrcamentoInsumosDetalhe>,
    mensagem: string,
    contexto: string,
  ): Promise<string | null> {
    setOcupado(true);
    setErro(null);
    try {
      const novo = await acao();
      aplicarDetalhe(novo);
      onChanged?.();
      success("Orçamento de insumos", mensagem);
      return null;
    } catch (causa) {
      const texto = typeof causa === "string" ? causa : String((causa as Error)?.message ?? causa);
      setErro(texto);
      showError("Orçamento de insumos", contexto, causa);
      return texto;
    } finally {
      setOcupado(false);
    }
  }

  /** Devolve o orçamento salvo, ou null se não salvou (sem permissão, PIN recusado ou erro). */
  async function salvar(): Promise<OrcamentoInsumosDetalhe | null> {
    if (!podeSalvar || cliente?.id == null) return null;
    if (!(await liberar("Salvar orçamento de insumos", "Informe o PIN para salvar valores do orçamento."))) return null;
    const entrada = {
      cliente_id: cliente.id,
      contato_id: contato?.id ?? null,
      validade,
      observacoes: observacoes.trim() || null,
      desconto: totais.desconto,
      itens: linhas.map((linha) => ({
        produto_id: linha.produto_id,
        quantidade: linha.quantidade,
        valor_unitario: linha.valor_unitario,
      })),
    };
    const salvo: { orcamento: OrcamentoInsumosDetalhe | null } = { orcamento: null };
    const falha = await executar(
      async () => {
        salvo.orcamento = detalhe
          ? await db.atualizarOrcamentoInsumos(detalhe.id, { ...entrada, atualizado_em: detalhe.atualizado_em })
          : await db.criarOrcamentoInsumos(entrada);
        return salvo.orcamento;
      },
      "Orçamento salvo.",
      "Salvar orçamento",
    );
    return falha ? null : salvo.orcamento;
  }

  async function gerarPdf() {
    if (!detalhe || bloqueadoPorEdicao) return;
    try {
      setPdf(await PdfService.construirOrcamentoInsumos(detalhe));
    } catch (causa) {
      showError("Orçamento de insumos", "Gerar PDF", causa);
    }
  }

  /** Baixar/salvar o PDF é o momento em que o orçamento sai da empresa: marca como enviado. */
  async function salvarPdf(artifact: PdfArtifact) {
    if (!detalhe) return;
    await PdfService.salvarOrcamentoInsumos(artifact, detalhe);
    if (detalhe.status === "RASCUNHO" && (await liberar("Marcar como enviado", "Informe o PIN para marcar o orçamento como enviado."))) {
      await executar(
        () => db.marcarOrcamentoInsumosEnviado(detalhe.id, detalhe.atualizado_em, "PDF"),
        "PDF salvo e orçamento marcado como enviado.",
        "Marcar como enviado",
      );
    }
  }

  async function enviar(canal: "EMAIL" | "WHATSAPP") {
    if (!detalhe || bloqueadoPorEdicao) return;
    if (!(await liberar("Enviar orçamento", "Informe o PIN para enviar o orçamento ao cliente."))) return;
    setOcupado(true);
    setErro(null);
    const resultado =
      canal === "EMAIL"
        ? await OrcamentoInsumosService.enviarEmail(detalhe)
        : await OrcamentoInsumosService.enviarWhatsapp(detalhe);
    setOcupado(false);
    if (!resultado.sucesso) {
      setErro(resultado.erro ?? "Não foi possível enviar o orçamento.");
      return;
    }
    const falha = await executar(
      () => db.marcarOrcamentoInsumosEnviado(detalhe.id, detalhe.atualizado_em, canal),
      canal === "EMAIL" ? "Orçamento enviado por e-mail." : "Orçamento enviado por WhatsApp.",
      "Marcar como enviado",
    );
    if (falha) {
      warning("Orçamento de insumos", "A mensagem foi enviada, mas o status não foi atualizado. Recarregue o orçamento.");
    }
  }

  async function iniciarAprovacao() {
    if (!detalhe || bloqueadoPorEdicao) return;
    if (!(await liberar("Aprovar orçamento de insumos", "Informe o PIN para aprovar e baixar o estoque."))) return;
    setErroAprovacao(null);
    setPagamentoAberto(true);
  }

  async function aprovar(pagamento: FormaPagamento): Promise<boolean> {
    if (!detalhe) return false;
    setErroAprovacao(null);
    const falha = await executar(
      () => db.aprovarOrcamentoInsumos(detalhe.id, detalhe.atualizado_em, pagamento),
      "Orçamento aprovado e estoque baixado.",
      "Aprovar orçamento",
    );
    if (falha) {
      setErroAprovacao(falha);
      return false;
    }
    return true;
  }

  async function excluir() {
    if (!detalhe) return;
    setOcupado(true);
    setErro(null);
    try {
      await db.excluirOrcamentoInsumos(detalhe.id, detalhe.atualizado_em);
      onChanged?.();
      success("Orçamento de insumos", `Orçamento ${detalhe.numero_exibicao} excluído.`);
      onOpenChange(false);
    } catch (causa) {
      const texto = typeof causa === "string" ? causa : String((causa as Error)?.message ?? causa);
      setErro(texto);
      showError("Orçamento de insumos", "Excluir orçamento", causa);
    } finally {
      setOcupado(false);
    }
  }

  async function confirmar() {
    const acao = confirmando;
    setConfirmando(null);
    if (!detalhe || !acao) return;
    if (!(await liberar("Confirmar ação financeira", "Informe o PIN para continuar com o orçamento de insumos."))) return;
    if (acao === "reprovar") {
      await executar(() => db.reprovarOrcamentoInsumos(detalhe.id, detalhe.atualizado_em), "Orçamento reprovado.", "Reprovar orçamento");
    } else if (acao === "cancelar") {
      await executar(
        () => db.cancelarOrcamentoInsumos(detalhe.id, detalhe.atualizado_em, acoes.cancelarDevolveEstoque),
        acoes.cancelarDevolveEstoque ? "Orçamento cancelado e estoque devolvido." : "Orçamento cancelado.",
        "Cancelar orçamento",
      );
    } else if (acao === "excluir") {
      await excluir();
    } else {
      await executar(() => db.marcarOrcamentoInsumosEntregue(detalhe.id, detalhe.atualizado_em), "Entrega registrada.", "Marcar como entregue");
    }
  }

  const titulo = detalhe ? `Orçamento de insumos ${detalhe.numero_exibicao}` : "Novo orçamento de insumos";
  const editavel = acoes.editar;
  const textoConfirmacao: Record<AcaoConfirmada, { titulo: string; descricao: string; botao: string }> = {
    reprovar: {
      titulo: "Reprovar orçamento?",
      descricao: "O orçamento fica como reprovado e não poderá mais ser aprovado.",
      botao: "Reprovar",
    },
    cancelar: {
      titulo: "Cancelar orçamento?",
      descricao: acoes.cancelarDevolveEstoque
        ? "Este orçamento já foi aprovado e baixou o estoque. Ao cancelar, todos os itens voltam para o estoque."
        : "O orçamento fica como cancelado e não poderá mais ser aprovado.",
      botao: acoes.cancelarDevolveEstoque ? "Cancelar e devolver ao estoque" : "Cancelar orçamento",
    },
    entregar: {
      titulo: "Marcar como entregue?",
      descricao: "Confirma que os itens foram entregues ao cliente. Depois disso o orçamento não pode mais ser cancelado.",
      botao: "Marcar entregue",
    },
    excluir: {
      titulo: "Excluir orçamento?",
      descricao: `O orçamento ${detalhe?.numero_exibicao ?? ""} e seus itens serão apagados definitivamente. O estoque não é alterado e o número não será reaproveitado. Esta ação não pode ser desfeita.`,
      botao: "Excluir",
    },
  };


  return {
    detalhe,
    setDetalhe,
    cliente,
    setCliente,
    contato,
    setContato,
    linhas,
    setLinhas,
    desconto,
    setDesconto,
    validade,
    setValidade,
    observacoes,
    setObservacoes,
    alterado,
    setAlterado,
    carregando,
    setCarregando,
    ocupado,
    setOcupado,
    erro,
    setErro,
    pdf,
    setPdf,
    pagamentoAberto,
    setPagamentoAberto,
    erroAprovacao,
    setErroAprovacao,
    confirmando,
    setConfirmando,
    aberturaCarregada,
    setAberturaCarregada,
    podeSalvarPdf,
    acaoInicialFeita,
    aberturaAtual,
    aplicarDetalhe,
    status,
    acoes,
    descontoNumero,
    totais,
    faltas,
    quantidadesValidas,
    podeSalvar,
    bloqueadoPorEdicao,
    vencido,
    motivoSemSalvar,
    titulo,
    editavel,
    textoConfirmacao,
    editar,
    liberar,
    executar,
    salvar,
    gerarPdf,
    salvarPdf,
    enviar,
    iniciarAprovacao,
    aprovar,
    excluir,
    confirmar,
  };
}
