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
  type Verificacao,
} from "@/types";
import { db } from "@/lib/db";

const TECNICOS_DISPONIVEIS = ["Ivan", "Isaias"] as const;
export type TecnicoDisponivel = (typeof TECNICOS_DISPONIVEIS)[number];

/** Dados de verificação sem ID (para criação). Usado por useStatusEquipamento.finalizarVerificacao */
export interface DadosVerificacao extends Omit<Verificacao, "id"> {}

/** Props do dialog de verificação técnica */
interface VerificacaoTecnicaProps {
  equipamento: Equipamento | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConcluir: (dados: DadosVerificacao) => Promise<void>;
  salvando?: boolean;
  tecnicoInicial?: TecnicoDisponivel;
}

export function VerificacaoTecnica({
  equipamento,
  open,
  onOpenChange,
  onConcluir,
  salvando = false,
  tecnicoInicial = "Ivan",
}: VerificacaoTecnicaProps) {
  // ─── State ──────────────────────────────────────────
  const [diagnostico, setDiagnostico] = useState("");
  const [servicos, setServicos] = useState<ServicoNecessario[]>([]);
  const [observacoesVerif, setObservacoesVerif] = useState("");
  const [tecnicoNome, setTecnicoNome] = useState<TecnicoDisponivel>(tecnicoInicial);
  const [catalogoServicos, setCatalogoServicos] = useState<ServicoCatalogo[]>([]);
  const [carregandoCatalogo, setCarregandoCatalogo] = useState(false);
  const [linhaSugestaoAberta, setLinhaSugestaoAberta] = useState<string | null>(null);

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

  // ─── Helpers ────────────────────────────────────────
  /** Limpa todos os campos do formulário para valores iniciais */
  function resetForm() {
    setDiagnostico("");
    setServicos([]);
    setObservacoesVerif("");
    setTecnicoNome(tecnicoInicial);
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

  function selecionarServicoCatalogo(linhaId: string, servicoCatalogo: ServicoCatalogo) {
    atualizarServico(linhaId, {
      catalogo_id: servicoCatalogo.id,
      descricao: servicoCatalogo.nome,
      valor: Number(servicoCatalogo.preco_padrao || 0),
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
      (servico) => !servico.descricao.trim() || Number(servico.valor) <= 0 || Number.isNaN(Number(servico.valor)),
    );
    if (servicosInvalidos) {
      alert("Cada serviço precisa ter descrição e valor maior que zero.");
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

    const dados: DadosVerificacao = {
      equipamento_id: equipamento.id!,
      tecnico_nome: tecnicoNome,
      problema_relatado: equipamento.defeito_relatado || "Não informado",
      diagnostico,
      itens_verificados: JSON.stringify([]),
      servicos_necessarios: JSON.stringify(servicosNormalizados),
      pecas_necessarias: JSON.stringify([]),
      custo_estimado_mao_obra: custoTotalServicos,
      custo_estimado_pecas: 0,
      custo_total: custoTotalServicos,
      tempo_estimado: 0,
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
                        min={0.01}
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

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancelar</Button>
              </DialogClose>
              <Button
                onClick={handleConcluir}
                disabled={salvando || servicos.some((s) => !s.descricao.trim() || Number(s.valor) <= 0)}
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
