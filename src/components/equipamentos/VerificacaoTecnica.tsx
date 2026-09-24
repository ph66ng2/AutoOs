/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  VerificacaoTecnica.tsx — Dialog de Verificação Técnica      ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  Dialog modal que permite ao técnico preencher a verificação ║
 * ║  completa de um equipamento, incluindo:                      ║
 * ║  - Técnico responsável e problema relatado                   ║
 * ║  - Checklist de 7 itens padrão (CHECKLIST_PADRAO)           ║
 * ║  - Diagnóstico técnico                                       ║
 * ║  - Lista dinâmica de serviços necessários (com valores)     ║
 * ║  - Lista dinâmica de peças necessárias (qtd × valor)        ║
 * ║  - Custo mão de obra + resumo financeiro (auto-calculado)   ║
 * ║                                                              ║
 * ║  DEPENDE DE:                                                 ║
 * ║  - types/index.ts (CHECKLIST_PADRAO, Equipamento, etc.)     ║
 * ║  - shadcn/ui (Dialog, Card, Input, Textarea, Checkbox, etc.)║
 * ║                                                              ║
 * ║  USADO POR:                                                  ║
 * ║  - pages/Equipamentos.tsx (abrirVerificacao → onConcluir)   ║
 * ║                                                              ║
 * ║  EXPORTA:                                                    ║
 * ║  - DadosVerificacao (tipo) — usado por useStatusEquipamento ║
 * ║  - VerificacaoTecnica (componente)                           ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
import { useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  Check,
  Search,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  type Equipamento,
  type ServicoCatalogo,
  type ServicoNecessario,
  type PecaNecessaria,
  type Verificacao,
  type ItemVerificacao,
  type EquipamentoId,
  CHECKLIST_PADRAO,
} from "@/types";
import { db } from "@/lib/db";
import { carregarRepositorioOperacoesEquipamento } from "@/lib/data/equipamentos-operacoes-repository";
import { useNotification } from "@/hooks/useNotification";
import { PhotoUploadDialog } from "@/components/equipamentos/PhotoUploadDialog";
import { imagemPersistidaParaDraft, type EquipamentoImagemDraft } from "@/lib/equipamento-imagem-utils";

const TECNICOS_DISPONIVEIS = ["Ivan", "Isaias"] as const;
export type TecnicoDisponivel = (typeof TECNICOS_DISPONIVEIS)[number];

/** Dados de verificação sem ID (para criação). Usado por useStatusEquipamento.finalizarVerificacao */
export interface DadosVerificacao extends Omit<Verificacao, "id"> {}

/** Props do dialog de verificação técnica */
interface VerificacaoTecnicaProps {
  equipamento: Equipamento | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConcluir: (dados: DadosVerificacao) => Promise<boolean | void>;
  salvando?: boolean;
  tecnicoInicial?: TecnicoDisponivel;
  saasMode?: boolean;
}

export function VerificacaoTecnica({
  equipamento,
  open,
  onOpenChange,
  onConcluir,
  salvando = false,
  tecnicoInicial = "Ivan",
  saasMode = false,
}: VerificacaoTecnicaProps) {
  // ─── State ──────────────────────────────────────────
  const [diagnostico, setDiagnostico] = useState("");
  const [servicos, setServicos] = useState<ServicoNecessario[]>([]);
  const [pecas, setPecas] = useState<PecaNecessaria[]>([]);
  const [itensVerificados, setItensVerificados] = useState<ItemVerificacao[]>(() =>
    CHECKLIST_PADRAO.map((item) => ({ ...item })),
  );
  const [tempoEstimado, setTempoEstimado] = useState(0);
  const [observacoesVerif, setObservacoesVerif] = useState("");
  const [tecnicoNome, setTecnicoNome] = useState<TecnicoDisponivel>(tecnicoInicial);
  const [catalogoServicos, setCatalogoServicos] = useState<ServicoCatalogo<EquipamentoId>[]>([]);
  const [carregandoCatalogo, setCarregandoCatalogo] = useState(false);
  const [linhaSugestaoAberta, setLinhaSugestaoAberta] = useState<string | null>(null);
  const [photoVerifOpen, setPhotoVerifOpen] = useState(false);
  const [imagensVerificacao, setImagensVerificacao] = useState<EquipamentoImagemDraft[]>([]);
  const { warning } = useNotification();

  useEffect(() => {
    if (!open) return;
    setCarregandoCatalogo(true);
    const catalogo = saasMode
      ? carregarRepositorioOperacoesEquipamento().then((repository) => repository.listActiveServices())
      : db.listarServicos(undefined, true);
    void catalogo
      .then((servicosDoCatalogo) => setCatalogoServicos(servicosDoCatalogo))
      .catch((err) => {
        console.error("Erro ao carregar catálogo de serviços:", err);
        setCatalogoServicos([]);
      })
      .finally(() => setCarregandoCatalogo(false));
  }, [open, saasMode]);

  useEffect(() => {
    if (!open) return;
    setTecnicoNome(tecnicoInicial);
  }, [open, tecnicoInicial]);

  useEffect(() => {
    if (saasMode || !open || !equipamento?.id) {
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
  }, [open, equipamento?.id, saasMode]);

  // ─── Helpers ────────────────────────────────────────
  /** Limpa todos os campos do formulário para valores iniciais */
  function resetForm() {
    setDiagnostico("");
    setServicos([]);
    setPecas([]);
    setItensVerificados(CHECKLIST_PADRAO.map((item) => ({ ...item })));
    setTempoEstimado(0);
    setObservacoesVerif("");
    setTecnicoNome(tecnicoInicial);
    setImagensVerificacao([]);
  }

  /** Adiciona um novo serviço vazio à lista (id = timestamp) */
  function adicionarServico() {
    setServicos([
      ...servicos,
      { id: Date.now().toString(), descricao: "", valor: 0, catalogo_id: undefined },
    ]);
  }
  /** Remove serviço da lista pelo ID */
  function removerServico(id: string) {
    setServicos(servicos.filter((s) => s.id !== id));
  }

  function atualizarServico(id: string, patch: Partial<ServicoNecessario>) {
    setServicos((estadoAtual) =>
      estadoAtual.map((servico) =>
        servico.id === id ? { ...servico, ...patch } : servico,
      ),
    );
  }

  function selecionarServicoCatalogo(linhaId: string, servicoCatalogo: ServicoCatalogo<EquipamentoId>) {
    atualizarServico(linhaId, {
      catalogo_id: servicoCatalogo.id,
      descricao: servicoCatalogo.nome,
      valor: Number(servicoCatalogo.preco_padrao || 0),
    });
    setLinhaSugestaoAberta(null);
  }

  function adicionarPeca() {
    setPecas((atuais) => [...atuais, {
      id: Date.now().toString(), nome: "", quantidade: 1, valorUnitario: 0, valorTotal: 0,
    }]);
  }

  function atualizarPeca(id: string, patch: Partial<PecaNecessaria>) {
    setPecas((atuais) => atuais.map((peca) => {
      if (peca.id !== id) return peca;
      const quantidade = patch.quantidade ?? peca.quantidade;
      const valorUnitario = patch.valorUnitario ?? peca.valorUnitario;
      return { ...peca, ...patch, valorTotal: Math.round(quantidade * valorUnitario * 100) / 100 };
    }));
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
        !servico.descricao.trim() || Number(servico.valor) < 0 || Number.isNaN(Number(servico.valor)),
    );
    if (servicosInvalidos) {
      warning("Verificação", "Cada serviço precisa ter descrição e valor igual ou maior que zero (0,00 para garantia).");
      return;
    }
    const pecasInvalidas = pecas.some((peca) =>
      !peca.nome.trim()
      || !Number.isFinite(Number(peca.quantidade))
      || Number(peca.quantidade) <= 0
      || !Number.isFinite(Number(peca.valorUnitario))
      || Number(peca.valorUnitario) < 0,
    );
    if (pecasInvalidas) {
      warning("Verificação", "Cada peça precisa ter descrição, quantidade maior que zero e valor igual ou maior que zero.");
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
    const pecasNormalizadas = pecas.map((peca) => ({
      ...peca,
      nome: peca.nome.trim(),
      quantidade: Number(peca.quantidade),
      valorUnitario: Number(peca.valorUnitario),
      valorTotal: Math.round(Number(peca.quantidade) * Number(peca.valorUnitario) * 100) / 100,
    }));
    const custoTotalPecas = pecasNormalizadas.reduce((acum, peca) => acum + peca.valorTotal, 0);
    const custoTotal = Math.round((custoTotalServicos + custoTotalPecas) * 100) / 100;

    const dados: DadosVerificacao = {
      equipamento_id: equipamento.id!,
      tecnico_nome: tecnicoNome,
      problema_relatado: equipamento.defeito_relatado || "Não informado",
      diagnostico,
      itens_verificados: JSON.stringify(itensVerificados),
      servicos_necessarios: JSON.stringify(servicosNormalizados),
      pecas_necessarias: JSON.stringify(pecasNormalizadas),
      custo_estimado_mao_obra: custoTotalServicos,
      custo_estimado_pecas: custoTotalPecas,
      custo_total: custoTotal,
      tempo_estimado: Math.max(0, Math.floor(Number(tempoEstimado) || 0)),
      concluida: true,
      observacoes: observacoesVerif,
    };

    const concluida = await onConcluir(dados);
    if (concluida === false) return;
    onOpenChange(false);
    resetForm();
  }

  /** Reseta form ao fechar o dialog */
  function handleOpenChange(value: boolean) {
    if (!value) resetForm();
    onOpenChange(value);
  }
  // ─── Render ─────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Check className="h-5 w-5" />
            Verificação Técnica
          </DialogTitle>
        </DialogHeader>

        {equipamento && (
          <div className="space-y-6">
            {/* Equipamento info */}
            <div className="bg-accent/50 p-3 rounded-lg">
              <p className="font-medium">
                {equipamento.marca} {equipamento.modelo}
              </p>
              <p className="text-sm text-muted-foreground">
                SN: {equipamento.serial_number}
              </p>
            </div>

            {/* Verificação Inicial */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Verificação Inicial</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-3 space-y-2">
                  <label className="text-sm font-medium">Técnico responsável</label>
                  <Select value={tecnicoNome} onValueChange={(value: (typeof TECNICOS_DISPONIVEIS)[number]) => setTecnicoNome(value)}>
                    <SelectTrigger className="w-full sm:w-64">
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
                <label className="mb-2 block text-sm font-medium">Diagnóstico Técnico</label>
                <Textarea
                  value={diagnostico}
                  onChange={(e) => setDiagnostico(e.target.value)}
                  placeholder="Descreva o diagnóstico detalhado e os problemas encontrados..."
                  rows={4}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Checklist de Verificação</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {itensVerificados.map((item) => (
                  <label key={item.id} className="flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={item.verificado}
                      onChange={(event) => setItensVerificados((atuais) => atuais.map((linha) =>
                        linha.id === item.id ? { ...linha, verificado: event.target.checked } : linha,
                      ))}
                      className="mt-1"
                    />
                    <span>{item.nome}</span>
                  </label>
                ))}
                <div className="space-y-2 pt-2">
                  <label className="text-sm font-medium" htmlFor="tempo-estimado-verificacao">Tempo estimado (horas)</label>
                  <Input
                    id="tempo-estimado-verificacao"
                    type="number"
                    min={0}
                    step={1}
                    value={tempoEstimado || ""}
                    onChange={(event) => setTempoEstimado(Math.max(0, Number(event.target.value) || 0))}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Serviços Necessários */}
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="text-sm">
                    Serviços Necessários
                  </CardTitle>
                  <Button
                    onClick={adicionarServico}
                    variant="outline"
                    size="sm"
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Adicionar Serviço
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">
                  Digite para buscar no catálogo e selecionar o serviço pré-cadastrado com preço automático.
                </p>
                <div className="space-y-3">
                  {servicos.map((s) => (
                    <div key={s.id} className="flex gap-3 items-start">
                      <div className="relative flex-1">
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
                                <span className="text-muted-foreground"> — R$ {Number(item.preco_padrao || 0).toFixed(2)}</span>
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
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="Valor"
                        value={Number.isFinite(Number(s.valor)) ? Number(s.valor) : ""}
                        onChange={(e) => atualizarServico(s.id, { valor: Number(e.target.value) })}
                        className="w-32"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removerServico(s.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                  {servicos.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhum serviço adicionado.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Peças Necessárias</CardTitle>
                  <Button onClick={adicionarPeca} variant="outline" size="sm">
                    <Plus className="mr-1 h-4 w-4" />Adicionar Peça
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {pecas.map((peca) => (
                  <div key={peca.id} className="grid grid-cols-[minmax(0,1fr)_5rem_7rem_2rem] items-center gap-2">
                    <Input
                      aria-label="Nome da peça"
                      placeholder="Nome da peça"
                      value={peca.nome}
                      onChange={(event) => atualizarPeca(peca.id, { nome: event.target.value })}
                    />
                    <Input
                      aria-label="Quantidade da peça"
                      type="number"
                      min={1}
                      step={1}
                      value={peca.quantidade}
                      onChange={(event) => atualizarPeca(peca.id, { quantidade: Number(event.target.value) })}
                    />
                    <Input
                      aria-label="Valor unitário da peça"
                      type="number"
                      min={0}
                      step="0.01"
                      value={peca.valorUnitario}
                      onChange={(event) => atualizarPeca(peca.id, { valorUnitario: Number(event.target.value) })}
                    />
                    <Button variant="ghost" size="icon" aria-label="Remover peça" onClick={() => setPecas((atuais) => atuais.filter((item) => item.id !== peca.id))}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                    <p className="col-span-4 text-right text-xs text-muted-foreground">
                      Subtotal: R$ {Number(peca.valorTotal || 0).toFixed(2)}
                    </p>
                  </div>
                ))}
                {pecas.length === 0 && <p className="py-2 text-center text-sm text-muted-foreground">Nenhuma peça adicionada.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-1 pt-4 text-sm">
                <div className="flex justify-between"><span>Serviços / mão de obra</span><span>R$ {servicos.reduce((sum, item) => sum + (Number(item.valor) || 0), 0).toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Peças</span><span>R$ {pecas.reduce((sum, item) => sum + (Number(item.valorTotal) || 0), 0).toFixed(2)}</span></div>
                <div className="flex justify-between border-t pt-2 font-semibold"><span>Orçamento total</span><span>R$ {(servicos.reduce((sum, item) => sum + (Number(item.valor) || 0), 0) + pecas.reduce((sum, item) => sum + (Number(item.valorTotal) || 0), 0)).toFixed(2)}</span></div>
              </CardContent>
            </Card>

            {/* Observações */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Observações</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {!saasMode && <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setPhotoVerifOpen(true)}
                    title="Registrar foto da verificação"
                  >
                    <Smartphone className="h-4 w-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground">Registrar foto da verificação</span>
                </div>}

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

                <Textarea
                  value={observacoesVerif}
                  onChange={(e) => setObservacoesVerif(e.target.value)}
                  placeholder="Observações adicionais..."
                  rows={2}
                />
              </CardContent>
            </Card>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancelar</Button>
              </DialogClose>
              <Button
                onClick={handleConcluir}
                disabled={salvando || servicos.some((s) => !s.descricao.trim() || Number(s.valor) < 0)}
                className="bg-green-600 hover:bg-green-700"
              >
                <Check className="mr-2 h-4 w-4" />
                {salvando ? "Salvando..." : "Finalizar Verificação"}
              </Button>
            </DialogFooter>

            {!saasMode && equipamento?.id && (
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
