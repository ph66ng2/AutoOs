/**
 * Formulário do orçamento de insumos (OI-n) das páginas /vendas/novo e /vendas/:id/editar:
 * carga, campos, totais, validação e salvar. As outras ações (enviar, aprovar, cancelar…)
 * ficam em useAcoesOrcamentoInsumos e abrem como modais (AcaoVendaDialog).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAcoesOrcamentoInsumos } from "@/hooks/useAcoesOrcamentoInsumos";
import { db } from "@/lib/db";
import {
  acoesOrcamentoInsumos,
  calcularTotaisOrcamentoInsumos,
  linhasSemSaldo,
  validadePadraoOrcamentoInsumos,
  type LinhaOrcamentoInsumos,
} from "@/lib/orcamento-insumos";
import {
  type Cliente,
  type ClienteContato,
  type OrcamentoInsumosDetalhe,
} from "@/types";

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
  /** Vazio = novo orçamento. */
  orcamentoId?: number | null;
  onChanged?: () => void;
}

export function useOrcamentoInsumosEditor({ orcamentoId = null, onChanged }: ParametrosEditorOrcamentoInsumos) {
  const [detalhe, setDetalhe] = useState<OrcamentoInsumosDetalhe | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [contato, setContato] = useState<ClienteContato | null>(null);
  const [linhas, setLinhas] = useState<LinhaOrcamentoInsumos[]>([]);
  const [desconto, setDesconto] = useState("");
  const [validade, setValidade] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [alterado, setAlterado] = useState(false);
  const [carregando, setCarregando] = useState(false);

  const aplicarDetalhe = useCallback((novo: OrcamentoInsumosDetalhe) => {
    setDetalhe(novo);
    setLinhas(linhasDoDetalhe(novo));
    setDesconto(novo.desconto > 0 ? String(novo.desconto) : "");
    setValidade(novo.validade ?? "");
    setObservacoes(novo.observacoes ?? "");
    setContato(contatoDoDetalhe(novo));
    setAlterado(false);
  }, []);

  const { ocupado, erro, setErro, liberar, executar } = useAcoesOrcamentoInsumos({ detalhe, aplicarDetalhe, onChanged });

  // Abre em branco (novo) ou carrega o orçamento e o cliente (existente).
  useEffect(() => {
    let ativo = true;
    setErro(null);
    if (orcamentoId == null) {
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
    // setErro é estável (useState).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orcamentoId, aplicarDetalhe]);

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
  /** Explica por que o Salvar está desabilitado (o aviso de desconto já aparece junto ao campo). */
  const motivoSemSalvar = (() => {
    if (!acoes.salvar || ocupado || podeSalvar) return null;
    if (cliente?.id == null) return "Escolha o cliente para salvar.";
    if (linhas.length === 0) return "Inclua ao menos um item para salvar.";
    if (!quantidadesValidas) return "Informe uma quantidade maior que zero em todos os itens.";
    if (!validade) return "Informe a validade do orçamento.";
    return null;
  })();

  function editar<T>(definir: (valor: T) => void) {
    return (valor: T) => {
      definir(valor);
      setAlterado(true);
      setErro(null);
    };
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

  return {
    detalhe,
    cliente,
    setCliente,
    contato,
    setContato,
    linhas,
    setLinhas,
    validade,
    setValidade,
    observacoes,
    setObservacoes,
    descontoNumero,
    setDesconto,
    alterado,
    setAlterado,
    carregando,
    ocupado,
    erro,
    status,
    totais,
    faltas,
    editavel: acoes.editar,
    podeSalvar,
    motivoSemSalvar,
    salvar,
    editar,
  };
}
