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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  CHECKLIST_PADRAO,
  type Equipamento,
  type ItemVerificacao,
  type ServicoNecessario,
  type PecaNecessaria,
  type Verificacao,
} from "@/types";

/** Dados de verificação sem ID (para criação). Usado por useStatusEquipamento.finalizarVerificacao */
export interface DadosVerificacao extends Omit<Verificacao, "id"> {}

/** Props do dialog de verificação técnica */
interface VerificacaoTecnicaProps {
  equipamento: Equipamento | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConcluir: (dados: DadosVerificacao) => Promise<void>;
  salvando?: boolean;
}

export function VerificacaoTecnica({
  equipamento,
  open,
  onOpenChange,
  onConcluir,
  salvando = false,
}: VerificacaoTecnicaProps) {
  // ─── State ──────────────────────────────────────────
  const [checklist, setChecklist] = useState<ItemVerificacao[]>([
    ...CHECKLIST_PADRAO.map((i) => ({ ...i, verificado: false })),
  ]);
  const [tecnicoNome, setTecnicoNome] = useState("");
  const [problemaRelatado, setProblemaRelatado] = useState("");
  const [diagnostico, setDiagnostico] = useState("");
  const [servicos, setServicos] = useState<ServicoNecessario[]>([]);
  const [pecas, setPecas] = useState<PecaNecessaria[]>([]);
  const [custoMaoObra, setCustoMaoObra] = useState(0);
  const [tempoEstimado, setTempoEstimado] = useState(0);
  const [observacoesVerif, setObservacoesVerif] = useState("");

  // ─── Helpers ────────────────────────────────────────
  /** Limpa todos os campos do formulário para valores iniciais */
  function resetForm() {
    setChecklist(CHECKLIST_PADRAO.map((i) => ({ ...i, verificado: false })));
    setTecnicoNome("");
    setProblemaRelatado("");
    setDiagnostico("");
    setServicos([]);
    setPecas([]);
    setCustoMaoObra(0);
    setTempoEstimado(0);
    setObservacoesVerif("");
  }

  /** Adiciona um novo serviço vazio à lista (id = timestamp) */
  function adicionarServico() {
    setServicos([
      ...servicos,
      { id: Date.now().toString(), descricao: "", valor: 0 },
    ]);
  }
  /** Remove serviço da lista pelo ID */
  function removerServico(id: string) {
    setServicos(servicos.filter((s) => s.id !== id));
  }
  /** Adiciona uma nova peça vazia à lista (id = timestamp) */
  function adicionarPeca() {
    setPecas([
      ...pecas,
      {
        id: Date.now().toString(),
        nome: "",
        quantidade: 1,
        valorUnitario: 0,
        valorTotal: 0,
      },
    ]);
  }
  /** Remove peça da lista pelo ID */
  function removerPeca(id: string) {
    setPecas(pecas.filter((p) => p.id !== id));
  }

  const custoPecas = pecas.reduce((acc, p) => acc + p.valorTotal, 0);
  const custoTotal = custoMaoObra + custoPecas;

  /**
   * Monta o objeto DadosVerificacao com todos os dados preenchidos
   * (checklist, serviços, peças como JSON strings) e chama onConcluir do parent.
   * O parent (Equipamentos.tsx) repassa para useStatusEquipamento.finalizarVerificacao.
   */
  async function handleConcluir() {
    if (!equipamento) return;

    const dados: DadosVerificacao = {
      equipamento_id: equipamento.id!,
      tecnico_nome: tecnicoNome,
      problema_relatado: problemaRelatado,
      diagnostico,
      itens_verificados: JSON.stringify(checklist),
      servicos_necessarios: JSON.stringify(servicos),
      pecas_necessarias: JSON.stringify(pecas),
      custo_estimado_mao_obra: custoMaoObra,
      custo_estimado_pecas: custoPecas,
      custo_total: custoTotal,
      tempo_estimado: tempoEstimado,
      concluida: true,
      observacoes: observacoesVerif,
    };

    await onConcluir(dados);
    resetForm();
  }

  /** Reseta form ao fechar o dialog */
  function handleOpenChange(value: boolean) {
    if (!value) resetForm();
    onOpenChange(value);
  }

  useEffect(() => {
    if (open && equipamento) {
      setProblemaRelatado(equipamento.defeito_relatado || "");
    }
  }, [equipamento, open]);

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

            {/* Informações Básicas */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Informações Básicas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Técnico Responsável *</Label>
                    <Input
                      value={tecnicoNome}
                      onChange={(e) => setTecnicoNome(e.target.value)}
                      placeholder="Nome do técnico"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tempo Estimado (horas)</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.5"
                      value={tempoEstimado}
                      onChange={(e) => setTempoEstimado(Number(e.target.value))}
                      placeholder="Ex: 2.5"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Problema Relatado pelo Cliente *</Label>
                  <Textarea
                    value={problemaRelatado}
                    onChange={(e) => setProblemaRelatado(e.target.value)}
                    placeholder="Descreva o problema relatado pelo cliente..."
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Checklist de Verificação */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  Checklist de Verificação
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {checklist.map((item, idx) => (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 p-3 border rounded"
                    >
                      <Checkbox
                        checked={item.verificado}
                        onCheckedChange={(checked) => {
                          const newList = [...checklist];
                          newList[idx] = {
                            ...item,
                            verificado: Boolean(checked),
                          };
                          setChecklist(newList);
                        }}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <p
                          className={
                            item.verificado
                              ? "line-through text-muted-foreground"
                              : ""
                          }
                        >
                          {item.nome}
                        </p>
                        <Input
                          placeholder="Observações (opcional)"
                          value={item.observacao || ""}
                          onChange={(e) => {
                            const newList = [...checklist];
                            newList[idx] = {
                              ...item,
                              observacao: e.target.value,
                            };
                            setChecklist(newList);
                          }}
                          className="mt-2 text-sm"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Diagnóstico Técnico */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Diagnóstico Técnico</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={diagnostico}
                  onChange={(e) => setDiagnostico(e.target.value)}
                  placeholder="Descreva o diagnóstico detalhado e os problemas encontrados..."
                  rows={4}
                />
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
                <div className="space-y-3">
                  {servicos.map((s, idx) => (
                    <div key={s.id} className="flex gap-3 items-center">
                      <Input
                        placeholder="Descrição do serviço"
                        value={s.descricao}
                        onChange={(e) => {
                          const n = [...servicos];
                          n[idx] = { ...s, descricao: e.target.value };
                          setServicos(n);
                        }}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="R$ 0,00"
                        value={s.valor || ""}
                        onChange={(e) => {
                          const n = [...servicos];
                          n[idx] = {
                            ...s,
                            valor: parseFloat(e.target.value) || 0,
                          };
                          setServicos(n);
                        }}
                        className="w-28"
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

            {/* Peças Necessárias */}
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="text-sm">Peças Necessárias</CardTitle>
                  <Button
                    onClick={adicionarPeca}
                    variant="outline"
                    size="sm"
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Adicionar Peça
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {pecas.map((p, idx) => (
                    <div key={p.id} className="flex gap-2 items-center">
                      <Input
                        placeholder="Nome da peça"
                        value={p.nome}
                        onChange={(e) => {
                          const n = [...pecas];
                          n[idx] = { ...p, nome: e.target.value };
                          setPecas(n);
                        }}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        min={1}
                        placeholder="Qtd"
                        value={p.quantidade || ""}
                        onChange={(e) => {
                          const n = [...pecas];
                          const q = parseInt(e.target.value) || 1;
                          n[idx] = {
                            ...p,
                            quantidade: q,
                            valorTotal: q * p.valorUnitario,
                          };
                          setPecas(n);
                        }}
                        className="w-16"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Val.Un."
                        value={p.valorUnitario || ""}
                        onChange={(e) => {
                          const n = [...pecas];
                          const v = parseFloat(e.target.value) || 0;
                          n[idx] = {
                            ...p,
                            valorUnitario: v,
                            valorTotal: p.quantidade * v,
                          };
                          setPecas(n);
                        }}
                        className="w-28"
                      />
                      <span className="text-sm w-24 text-right font-medium">
                        R$ {p.valorTotal.toFixed(2)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removerPeca(p.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                  {pecas.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhuma peça adicionada.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Observações */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Observações</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={observacoesVerif}
                  onChange={(e) => setObservacoesVerif(e.target.value)}
                  placeholder="Observações adicionais..."
                  rows={2}
                />
              </CardContent>
            </Card>

            {/* Custo Mão de Obra */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Custo Mão de Obra</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label>Valor (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={custoMaoObra || ""}
                    onChange={(e) =>
                      setCustoMaoObra(parseFloat(e.target.value) || 0)
                    }
                    placeholder="0.00"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Resumo Financeiro */}
            <Card className="bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800">
              <CardHeader>
                <CardTitle className="text-sm">Resumo do Orçamento</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Mão de Obra:</span>
                    <span className="font-semibold">
                      R$ {custoMaoObra.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Peças:</span>
                    <span className="font-semibold">
                      R$ {custoPecas.toFixed(2)}
                    </span>
                  </div>
                  <hr className="border-blue-200 dark:border-blue-700" />
                  <div className="flex justify-between text-lg font-bold text-blue-700 dark:text-blue-300">
                    <span>TOTAL:</span>
                    <span>R$ {custoTotal.toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancelar</Button>
              </DialogClose>
              <Button
                onClick={handleConcluir}
                disabled={salvando || !tecnicoNome || !problemaRelatado}
                className="bg-green-600 hover:bg-green-700"
              >
                <Check className="mr-2 h-4 w-4" />
                {salvando ? "Salvando..." : "Finalizar Verificação"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
