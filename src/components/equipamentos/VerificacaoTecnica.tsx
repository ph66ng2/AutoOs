/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  VerificacaoTecnica.tsx — Página de Verificação Técnica      ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  Página (/equipamentos/:id/verificacao) onde o técnico faz a ║
 * ║  verificação completa (decisão 24 do redesign), incluindo:   ║
 * ║  - Técnico responsável e problema relatado                   ║
 * ║  - Checklist de 7 itens padrão (CHECKLIST_PADRAO)           ║
 * ║  - Diagnóstico técnico                                       ║
 * ║  - Lista dinâmica de serviços necessários (com valores)     ║
 * ║  - Lista dinâmica de peças necessárias (qtd × valor)        ║
 * ║  - Custos ao vivo (serviços + peças = total)                ║
 * ║                                                              ║
 * ║  DEPENDE DE:                                                 ║
 * ║  - types/index.ts (CHECKLIST_PADRAO, Equipamento, etc.)     ║
 * ║  - shadcn/ui (Input, Textarea, Checkbox, Select, etc.)      ║
 * ║                                                              ║
 * ║  USADO POR:                                                  ║
 * ║  - pages/Equipamentos.tsx (abrirVerificacao → onConcluir)   ║
 * ║                                                              ║
 * ║  EXPORTA:                                                    ║
 * ║  - DadosVerificacao (tipo) — usado por useStatusEquipamento ║
 * ║  - VerificacaoTecnica (componente)                           ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
import { Fragment, useEffect, useState } from "react";
import { Camera, ChevronLeft, Lock, Plus, Search, Trash2 } from "lucide-react";
import { LinhaServicoCelular } from "@/components/equipamentos/LinhaServicoCelular";
import { useLarguraMinima } from "@/hooks/useLarguraMinima";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ValorDecimalInput } from "@/components/ui/valor-decimal-input";
import { formatCurrency, formatCurrencyOrMissing } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/pages/equipamentos/EquipamentosStatusBadge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CHECKLIST_PADRAO,
  type Equipamento,
  type ItemVerificacao,
  type ServicoCatalogo,
  type ServicoNecessario,
  type Verificacao,
} from "@/types";
import { db } from "@/lib/db";
import { PecasDoServico } from "@/components/equipamentos/PecasDoServico";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LABEL_CONFIRMAR_OS_GARANTIA, MENSAGEM_CONFIRMAR_OS_GARANTIA, MENSAGEM_TOTAL_ZERO_SEM_GARANTIA, osSomenteGarantia, pecasParaOrcamento, TITULO_CONFIRMAR_OS_GARANTIA, vaiAutoAprovarOsGarantia, validarPecas } from "@/lib/orcamento-estoque";
import { useNotification } from "@/hooks/useNotification";
import { PhotoUploadDialog } from "@/components/equipamentos/PhotoUploadDialog";
import { imagemPersistidaParaDraft, type EquipamentoImagemDraft } from "@/lib/equipamento-imagem-utils";

const TECNICOS_DISPONIVEIS = ["Ivan", "Isaias"] as const;
export type TecnicoDisponivel = (typeof TECNICOS_DISPONIVEIS)[number];

/** Dados de verificação sem ID (para criação). Usado por useStatusEquipamento.finalizarVerificacao */
export interface DadosVerificacao extends Omit<Verificacao, "id"> {}

/** Props da página de verificação técnica (`open` = página visível) */
interface VerificacaoTecnicaProps {
  equipamento: Equipamento | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConcluir: (dados: DadosVerificacao) => Promise<boolean | void>;
  salvando?: boolean;
  tecnicoInicial?: TecnicoDisponivel;
  /** Sem Ações financeiras nem Elaborar e enviar orçamentos, a página abre, mas finalizar pede o PIN de quem tem. */
  podeFinalizar?: boolean;
}

export function VerificacaoTecnica({
  equipamento,
  open,
  onOpenChange,
  onConcluir,
  salvando = false,
  tecnicoInicial = "Ivan",
  podeFinalizar = true,
}: VerificacaoTecnicaProps) {
  // ─── State ──────────────────────────────────────────
  const [diagnostico, setDiagnostico] = useState("");
  const telaLarga = useLarguraMinima(768);
  /** No celular, só o serviço tocado (ou o recém-adicionado) fica aberto para edição. */
  const [servicoAberto, setServicoAberto] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<ItemVerificacao[]>(() => CHECKLIST_PADRAO.map((item) => ({ ...item })));
  const [servicos, setServicos] = useState<ServicoNecessario[]>([]);
  const [observacoesVerif, setObservacoesVerif] = useState("");
  const [tecnicoNome, setTecnicoNome] = useState<TecnicoDisponivel>(tecnicoInicial);
  const [catalogoServicos, setCatalogoServicos] = useState<ServicoCatalogo[]>([]);
  const [carregandoCatalogo, setCarregandoCatalogo] = useState(false);
  const [linhaSugestaoAberta, setLinhaSugestaoAberta] = useState<string | null>(null);
  const [photoVerifOpen, setPhotoVerifOpen] = useState(false);
  const [imagensVerificacao, setImagensVerificacao] = useState<EquipamentoImagemDraft[]>([]);
  const [valoresServicoInvalidos, setValoresServicoInvalidos] = useState<Record<string, boolean>>({});
  const [confirmGarantiaOpen, setConfirmGarantiaOpen] = useState(false);
  const [dadosGarantiaPendentes, setDadosGarantiaPendentes] = useState<DadosVerificacao | null>(null);
  const { warning } = useNotification();

  useEffect(() => {
    if (!open) return;
    setCarregandoCatalogo(true);
    void db.listarServicos(undefined, true)
      .then((servicosDoCatalogo) => setCatalogoServicos(servicosDoCatalogo))
      .catch((err) => {
        console.error("Erro ao carregar catálogo de serviços:", err);
        setCatalogoServicos([]);
      })
      .finally(() => setCarregandoCatalogo(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setTecnicoNome(tecnicoInicial);
  }, [open, tecnicoInicial]);

  useEffect(() => {
    if (!open || !equipamento?.id) {
      setImagensVerificacao([]);
      return;
    }
    void db.listarImagensEquipamento(equipamento.id)
      .then((imagens) => Promise.all(imagens.map(imagemPersistidaParaDraft)))
      .then((drafts) => setImagensVerificacao(drafts.filter((d) => d.categoria === "VERIFICACAO")))
      .catch((err) => {
        console.error("Erro ao carregar imagens de verificação:", err);
        setImagensVerificacao([]);
      });
  }, [open, equipamento?.id]);

  // ─── Helpers ────────────────────────────────────────
  /** Limpa todos os campos do formulário para valores iniciais */
  function resetForm() {
    setDiagnostico("");
    setChecklist(CHECKLIST_PADRAO.map((item) => ({ ...item })));
    setServicos([]);
    setObservacoesVerif("");
    setTecnicoNome(tecnicoInicial);
    setImagensVerificacao([]);
    setValoresServicoInvalidos({});
    setConfirmGarantiaOpen(false);
    setDadosGarantiaPendentes(null);
  }

  // Parent pode fechar com setOpen(false) sem passar por handleOpenChange (ex.: Quem recebe).
  // Troca de equipamento também precisa nascer limpa. Enquanto open permanece true
  // (Quem recebe / confirmação de garantia), a digitação é preservada.
  const equipamentoId = equipamento?.id ?? null;
  useEffect(() => {
    resetForm();
    // resetForm lê tecnicoInicial do render atual; não resetar quando só o técnico sugerido muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, equipamentoId]);

  /** Adiciona um novo serviço vazio à lista; no celular ele já abre para edição. */
  function adicionarServico() {
    const id = crypto.randomUUID();
    setServicos([...servicos, { id, descricao: "", valor: 0, catalogo_id: undefined }]);
    setServicoAberto(id);
  }
  /** Remove serviço da lista pelo ID */
  function removerServico(id: string) {
    setServicos(servicos.filter((s) => s.id !== id));
    setValoresServicoInvalidos((atual) => {
      const proximo = { ...atual };
      delete proximo[id];
      return proximo;
    });
  }

  function atualizarServico(id: string, patch: Partial<ServicoNecessario>) {
    setServicos((estadoAtual) =>
      estadoAtual.map((servico) =>
        servico.id === id ? { ...servico, ...patch } : servico,
      ),
    );
  }

  function selecionarServicoCatalogo(linhaId: string, servicoCatalogo: ServicoCatalogo) {
    atualizarServico(linhaId, {
      catalogo_id: servicoCatalogo.id,
      descricao: servicoCatalogo.nome,
      valor: Number(servicoCatalogo.preco_padrao || 0),
      pecas: servicoCatalogo.pecas_sugeridas ?? [],
    });
    setLinhaSugestaoAberta(null);
  }
  /**
   * Monta o objeto DadosVerificacao com todos os dados preenchidos
   * (checklist, serviços, peças como JSON strings) e chama onConcluir do parent.
   * O parent (Equipamentos.tsx) repassa para useStatusEquipamento.finalizarVerificacao.
   */
  async function handleConcluir() {
    if (!equipamento) return;
    const servicosInvalidos = servicos.some(
      (servico) =>
        !servico.descricao.trim()
        || Number(servico.valor) < 0
        || Number.isNaN(Number(servico.valor))
        || valoresServicoInvalidos[servico.id],
    );
    if (servicosInvalidos || servicos.some((s) => !validarPecas(s.pecas ?? []))) {
      warning("Verificação", "Cada serviço precisa ter descrição e valor igual ou maior que zero (0,00 para garantia).");
      return;
    }

    const servicosNormalizados = servicos
      .filter((servico) => servico.descricao.trim())
      .map((servico) => ({
        ...servico,
        descricao: servico.descricao.trim(),
        valor: Number(servico.valor),
      }));
    const custoTotalServicos = servicosNormalizados.reduce((acum, servico) => acum + servico.valor, 0);
    const pecasOrcamento = pecasParaOrcamento(servicosNormalizados);
    const custoTotalPecas = pecasOrcamento.reduce((acum, peca) => acum + peca.valorTotal, 0);
    const custoTotal = custoTotalServicos + custoTotalPecas;
    if (custoTotal === 0 && !osSomenteGarantia(servicosNormalizados)) {
      warning("Verificação", MENSAGEM_TOTAL_ZERO_SEM_GARANTIA);
      return;
    }

    const dados: DadosVerificacao = {
      equipamento_id: equipamento.id!,
      tecnico_nome: tecnicoNome,
      problema_relatado: equipamento.defeito_relatado || "Não informado",
      diagnostico,
      itens_verificados: JSON.stringify(checklist),
      servicos_necessarios: JSON.stringify(servicosNormalizados),
      pecas_necessarias: JSON.stringify(pecasOrcamento),
      custo_estimado_mao_obra: custoTotalServicos,
      custo_estimado_pecas: custoTotalPecas,
      custo_total: custoTotal,
      tempo_estimado: 0,
      concluida: true,
      observacoes: observacoesVerif,
    };

    if (vaiAutoAprovarOsGarantia(equipamento.status, osSomenteGarantia(servicosNormalizados), custoTotal)) {
      setDadosGarantiaPendentes(dados);
      setConfirmGarantiaOpen(true);
      return;
    }

    const concluida = await onConcluir(dados);
    if (concluida === false) return;
    onOpenChange(false);
    resetForm();
  }

  async function confirmarOsGarantia() {
    if (!dadosGarantiaPendentes) return;
    const dados = { ...dadosGarantiaPendentes, confirmar_garantia: true };
    setConfirmGarantiaOpen(false);
    setDadosGarantiaPendentes(null);
    const concluida = await onConcluir(dados);
    if (concluida === false) return;
    onOpenChange(false);
    resetForm();
  }

  /** Reseta o formulário ao sair da página */
  function handleOpenChange(value: boolean) {
    if (!value) resetForm();
    onOpenChange(value);
  }
  const servicosComDescricao = servicos.filter((servico) => servico.descricao.trim());
  const custoServicos = servicosComDescricao.reduce((soma, servico) => soma + (Number(servico.valor) || 0), 0);
  const custoPecas = pecasParaOrcamento(servicosComDescricao).reduce((soma, peca) => soma + peca.valorTotal, 0);
  const custoTotalAoVivo = custoServicos + custoPecas;
  const marcados = checklist.filter((item) => item.verificado).length;
  const soGarantia = custoTotalAoVivo === 0 && osSomenteGarantia(servicosComDescricao);

  // ─── Render ─────────────────────────────────────────
  if (!open || !equipamento) return null;
  return (
    <>
    <section aria-labelledby="verificacao-titulo" className="-mb-4 flex min-h-[calc(100vh-8rem)] flex-col gap-4 lg:-mb-8">
      <div>
        <button
          type="button"
          onClick={() => handleOpenChange(false)}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors duration-rapida hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          <span className="[overflow-wrap:anywhere]">{equipamento.marca} {equipamento.modelo} · {equipamento.serial_number}</span>
        </button>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 id="verificacao-titulo" className="text-[26px] font-bold leading-tight tracking-tight">Verificação técnica</h1>
          <StatusBadge status={equipamento.status} completo />
        </div>
      </div>

      {!podeFinalizar && (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-muted px-4 py-3 text-sm">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Finalizar pede o PIN de quem tem <strong>Ações financeiras</strong> ou <strong>Elaborar e enviar orçamentos</strong>.
          </span>
        </p>
      )}

      <dl className="flex flex-wrap gap-x-8 gap-y-2 rounded-2xl border bg-card px-5 py-4 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Equipamento</dt>
          <dd className="font-semibold">{equipamento.marca} {equipamento.modelo}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">SN</dt>
          <dd className="font-mono font-semibold [overflow-wrap:anywhere]">{equipamento.serial_number}</dd>
        </div>
        {equipamento.cliente_nome && (
          <div>
            <dt className="text-xs text-muted-foreground">Cliente</dt>
            <dd className="font-semibold">{equipamento.cliente_nome}</dd>
          </div>
        )}
        {equipamento.defeito_relatado && (
          <div className="min-w-0 basis-full sm:basis-auto">
            <dt className="text-xs text-muted-foreground">Defeito relatado</dt>
            <dd className="font-semibold [overflow-wrap:anywhere]">{equipamento.defeito_relatado}</dd>
          </div>
        )}
      </dl>

      <section className="rounded-2xl border bg-card p-5">
        <h2 className="mb-3 text-base font-bold">Verificação inicial</h2>
        <div className="grid gap-4 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
          <div className="space-y-2">
            <label htmlFor="verificacao-tecnico" className="text-sm font-medium">Técnico responsável</label>
            <Select value={tecnicoNome} onValueChange={(value: (typeof TECNICOS_DISPONIVEIS)[number]) => setTecnicoNome(value)}>
              <SelectTrigger id="verificacao-tecnico" className="w-full">
                <SelectValue placeholder="Selecione o técnico" />
              </SelectTrigger>
              <SelectContent>
                {TECNICOS_DISPONIVEIS.map((tecnico) => (
                  <SelectItem key={tecnico} value={tecnico}>
                    {tecnico}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label htmlFor="verificacao-diagnostico" className="text-sm font-medium">Diagnóstico técnico</label>
            <Textarea
              id="verificacao-diagnostico"
              value={diagnostico}
              onChange={(e) => setDiagnostico(e.target.value)}
              placeholder="Descreva o diagnóstico detalhado e os problemas encontrados..."
              rows={3}
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="verificacao-checklist" className="text-base font-bold">Checklist</h2>
          <span className="text-xs tabular-nums text-muted-foreground">{marcados} de {checklist.length}</span>
        </div>
        <div role="group" aria-labelledby="verificacao-checklist" className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {checklist.map((item) => (
            <label key={item.id} className="flex min-h-10 cursor-pointer items-center gap-3 text-sm">
              <Checkbox
                checked={item.verificado}
                onCheckedChange={(marcado) =>
                  setChecklist((atual) => atual.map((it) => (it.id === item.id ? { ...it, verificado: marcado === true } : it)))
                }
              />
              {item.nome}
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-bold">Serviços necessários</h2>
          <Button onClick={adicionarServico} variant="outline" size="sm">
            <Plus className="mr-1 h-4 w-4" />
            Adicionar serviço
          </Button>
        </div>
        <div className="space-y-3">
          {servicos.map((s) => {
            // No celular o serviço fechado vira linha; a edição continua montada (escondida) para não perder valor nem erro.
            const recolhido = !telaLarga && servicoAberto !== s.id;
            return (
            <Fragment key={s.id}>
            {recolhido && <LinhaServicoCelular servico={s} onAbrir={() => setServicoAberto(s.id)} />}
            <div hidden={recolhido} className="rounded-xl border p-3">
            <div className="flex flex-wrap items-start gap-3 md:flex-nowrap">
              <div className="relative min-w-full flex-1 md:min-w-0">
                <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Nome do serviço"
                  value={s.descricao}
                  onFocus={() => setLinhaSugestaoAberta(s.id)}
                  onBlur={() => window.setTimeout(() => setLinhaSugestaoAberta(null), 120)}
                  onChange={(e) => {
                    atualizarServico(s.id, {
                      descricao: e.target.value,
                      catalogo_id: undefined,
                    });
                    setLinhaSugestaoAberta(s.id);
                  }}
                  className="pl-8"
                />
                {linhaSugestaoAberta === s.id && (
                  <div className="absolute z-20 mt-1 max-h-44 w-full overflow-auto rounded-md border bg-popover shadow">
                    {(catalogoServicos
                      .filter((item) =>
                        item.nome.toLowerCase().includes((s.descricao || "").toLowerCase()),
                      )
                      .slice(0, 8)).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selecionarServicoCatalogo(s.id, item)}
                      >
                        <span className="font-medium">{item.nome}</span>
                        <span className="text-muted-foreground"> — {formatCurrencyOrMissing(Number(item.preco_padrao))}</span>
                      </button>
                    ))}
                    {!carregandoCatalogo && catalogoServicos.filter((item) =>
                      item.nome.toLowerCase().includes((s.descricao || "").toLowerCase()),
                    ).length === 0 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        Nenhum serviço pré-cadastrado encontrado.
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="w-36">
                {/* "R$" colado ao campo, como na prancheta da verificação. */}
                <div className="flex items-stretch overflow-hidden rounded-md border border-input focus-within:ring-2 focus-within:ring-ring">
                  <span aria-hidden="true" className="flex items-center bg-muted px-2.5 text-sm text-muted-foreground">R$</span>
                  <ValorDecimalInput
                    min={0}
                    placeholder="Valor"
                    aria-label="Valor do serviço"
                    value={Number(s.valor) || 0}
                    onValueChange={(valor) => atualizarServico(s.id, { valor })}
                    onValidityChange={(valido) => setValoresServicoInvalidos((atual) => ({ ...atual, [s.id]: !valido }))}
                    className="min-w-0 flex-1 rounded-none border-0 text-right tabular-nums focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
                {s.descricao.trim() && Number(s.valor) === 0 && !valoresServicoInvalidos[s.id] && (
                  <p className="mt-1 text-xs text-status-ok">Garantia</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remover serviço ${s.descricao || ""}`.trim()}
                onClick={() => removerServico(s.id)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
            <PecasDoServico pecas={s.pecas ?? []} onChange={(pecas) => atualizarServico(s.id, { pecas })} />
            </div>
            </Fragment>
            );
          })}
          {servicos.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nenhum serviço adicionado.
            </p>
          )}
        </div>
      </section>

      <section aria-label="Custos" className="rounded-2xl border bg-card p-5">
        <h2 className="text-base font-bold">Custos</h2>
        <dl className="ml-auto mt-3 grid max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Serviços</dt>
          <dd className="text-right tabular-nums">{formatCurrency(custoServicos)}</dd>
          <dt className="text-muted-foreground">Peças</dt>
          <dd className="text-right tabular-nums">{formatCurrency(custoPecas)}</dd>
          <dt className="border-t pt-2 font-bold">Total</dt>
          <dd className="border-t pt-2 text-right text-xl font-extrabold tabular-nums">{formatCurrency(custoTotalAoVivo)}</dd>
        </dl>
      </section>

      <section className="space-y-3 rounded-2xl border bg-card p-5">
        <h2 className="text-base font-bold">Observações</h2>
        <Textarea
          aria-label="Observações"
          value={observacoesVerif}
          onChange={(e) => setObservacoesVerif(e.target.value)}
          placeholder="Observações adicionais..."
          rows={3}
        />
        {imagensVerificacao.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {imagensVerificacao.map((imagem) => (
              <div
                key={imagem.local_id}
                className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md border"
              >
                <img
                  src={imagem.preview_url}
                  alt={imagem.filename}
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => setPhotoVerifOpen(true)}>
          <Camera className="mr-1 h-4 w-4" />
          Registrar foto da verificação
        </Button>
      </section>

      <div className="sticky bottom-0 z-20 -mx-4 mt-auto flex flex-wrap items-center justify-between gap-3 border-t bg-card px-4 py-3 lg:-mx-8 lg:px-8">
        <p className="text-sm text-muted-foreground">
          {soGarantia
            ? "Ao finalizar: OS só de garantia vai direto para Aprovado"
            : "Ao finalizar: Verificado → Aguardando aprovação, com envio automático"}
        </p>
        <div className="flex w-full gap-2 md:w-auto">
          <Button variant="outline" className="h-12 flex-1 md:h-10 md:flex-none" onClick={() => handleOpenChange(false)}>Cancelar</Button>
          <Button
            className="h-12 flex-1 md:h-10 md:flex-none"
            onClick={handleConcluir}
            disabled={salvando || servicos.some((s) => !s.descricao.trim() || Number(s.valor) < 0 || valoresServicoInvalidos[s.id])}
          >
            {salvando ? "Salvando..." : "Finalizar verificação"}
          </Button>
        </div>
      </div>
    </section>

    {equipamento.id && (
      <PhotoUploadDialog
        equipamentoId={equipamento.id}
        categoria="VERIFICACAO"
        open={photoVerifOpen}
        onOpenChange={setPhotoVerifOpen}
        onPhotoUploaded={async () => {
          if (equipamento?.id) {
            const imagens = await db.listarImagensEquipamento(equipamento.id);
            const drafts = await Promise.all(imagens.map(imagemPersistidaParaDraft));
            setImagensVerificacao(drafts.filter((d) => d.categoria === "VERIFICACAO"));
          }
        }}
      />
    )}
    <ConfirmDialog
      open={confirmGarantiaOpen}
      onOpenChange={(aberto) => {
        setConfirmGarantiaOpen(aberto);
        if (!aberto) setDadosGarantiaPendentes(null);
      }}
      title={TITULO_CONFIRMAR_OS_GARANTIA}
      description={MENSAGEM_CONFIRMAR_OS_GARANTIA}
      confirmLabel={LABEL_CONFIRMAR_OS_GARANTIA}
      cancelLabel="Cancelar"
      onConfirm={() => void confirmarOsGarantia()}
      onCancel={() => setDadosGarantiaPendentes(null)}
    />
    </>
  );
}
