import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import type {
  Cliente,
  Equipamento,
  ServicoCatalogo,
  ServicoNecessario,
  Verificacao,
} from "@/types";
import { db } from "@/lib/db";
import { PdfService } from "@/lib/pdf-service";
import { useNotification } from "@/hooks/useNotification";
import { ClienteSelector } from "@/components/equipamentos/ClienteSelector";
import { EquipamentoSelector } from "@/components/equipamentos/EquipamentoSelector";

export interface OrcamentoRapidoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function OrcamentoRapidoDialog({
  open,
  onOpenChange,
  onSuccess,
}: OrcamentoRapidoDialogProps) {
  const { success, error: showError } = useNotification();

  const [catalogoServicos, setCatalogoServicos] = useState<ServicoCatalogo[]>([]);
  const [salvando, setSalvando] = useState(false);

  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null);
  const [equipamentoSelecionado, setEquipamentoSelecionado] = useState<Equipamento | null>(null);
  const [servicos, setServicos] = useState<ServicoNecessario[]>([]);
  const [valorTotal, setValorTotal] = useState<number>(0);
  const [valorTotalEditadoManualmente, setValorTotalEditadoManualmente] = useState(false);
  const [defeitoRelatado, setDefeitoRelatado] = useState("");
  const [linhaSugestaoAberta, setLinhaSugestaoAberta] = useState<string | null>(null);

  const carregarDados = useCallback(async () => {
    try {
      const s = await db.listarServicosCatalogoAtivos();
      setCatalogoServicos(s);
    } catch (err) {
      console.error("Erro ao carregar dados do orçamento rápido:", err);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void carregarDados();
    }
  }, [open, carregarDados]);

  useEffect(() => {
    if (!valorTotalEditadoManualmente) {
      const total = servicos.reduce((sum, s) => sum + (Number(s.valor) || 0), 0);
      setValorTotal(total);
    }
  }, [servicos, valorTotalEditadoManualmente]);

  function adicionarServico() {
    const novo: ServicoNecessario = {
      id: crypto.randomUUID(),
      descricao: "",
      valor: 0,
    };
    setServicos((prev) => [...prev, novo]);
  }

  function removerServico(id: string) {
    setServicos((prev) => prev.filter((s) => s.id !== id));
  }

  function atualizarServico(id: string, patch: Partial<ServicoNecessario>) {
    setServicos((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function selecionarServicoCatalogo(servicoId: string, item: ServicoCatalogo) {
    atualizarServico(servicoId, {
      descricao: item.nome,
      catalogo_id: item.id,
      valor: Number(item.preco_padrao) || 0,
    });
  }

  function handleValorTotalChange(valor: string) {
    setValorTotalEditadoManualmente(true);
    setValorTotal(Number(valor) || 0);
  }

  function resetarFormulario() {
    setClienteSelecionado(null);
    setEquipamentoSelecionado(null);
    setServicos([]);
    setValorTotal(0);
    setValorTotalEditadoManualmente(false);
    setDefeitoRelatado("");
  }

  async function handleSubmit() {
    if (!clienteSelecionado) {
      return;
    }
    setSalvando(true);

    try {
      const nomeCliente = clienteSelecionado.tipo_pessoa === "PJ"
        ? (clienteSelecionado.nome_fantasia || clienteSelecionado.razao_social || clienteSelecionado.nome || "")
        : (clienteSelecionado.nome || "");

      const base = equipamentoSelecionado;

      const payload: Omit<Equipamento, "id"> = {
        serial_number: base?.serial_number || "NÃO INFORMADO",
        patrimonio: base?.patrimonio,
        marca: base?.marca || "Não informado",
        modelo: base?.modelo || "",
        tipo: base?.tipo || "Visita Técnica",
        status: "AGUARDANDO_APROVACAO",
        defeito_relatado: defeitoRelatado || undefined,
        acessorios: undefined,
        acessorios_outros: undefined,
        data_entrada: new Date().toISOString().split("T")[0],
        observacoes: undefined,
        cliente_id: clienteSelecionado.id || undefined,
        cliente_nome: nomeCliente,
        cliente_telefone: clienteSelecionado.telefone || undefined,
        cliente_email: clienteSelecionado.email || undefined,
      };

      const equipamentoCriado = await db.criarEquipamento(payload);

      const verificacao: Omit<Verificacao, "id"> = {
        equipamento_id: equipamentoCriado.id!,
        tecnico_nome: "",
        problema_relatado: defeitoRelatado || "",
        servicos_necessarios: JSON.stringify(servicos),
        pecas_necessarias: "[]",
        custo_total: valorTotal,
      };

      await db.salvarVerificacao(verificacao);

      const caminho = await PdfService.gerarOrcamento(equipamentoCriado, {
        ...verificacao,
        id: undefined,
      } as Verificacao);

      if (caminho) {
        success("Equipamentos", `Orçamento PDF gerado: ${caminho}`, "Orçamento Rápido");
      }

      resetarFormulario();
      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      console.error("Erro no orçamento rápido:", err);
      showError("Equipamentos", "Orçamento Rápido", err);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Orçamento Rápido</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label>Cliente</Label>
            <ClienteSelector
              onClienteSelecionado={(c) => {
                setClienteSelecionado(c);
                setEquipamentoSelecionado(null);
              }}
              onClienteRemovido={() => {
                setClienteSelecionado(null);
                setEquipamentoSelecionado(null);
              }}
            />
          </div>

          <div className="space-y-2">
            <EquipamentoSelector
              onEquipamentoSelecionado={setEquipamentoSelecionado}
            />
          </div>

          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="text-sm">Serviços</CardTitle>
                <Button
                  onClick={adicionarServico}
                  variant="outline"
                  size="sm"
                  type="button"
                  disabled={salvando}
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
                        disabled={salvando}
                      />
                      {linhaSugestaoAberta === s.id && (
                        <div className="absolute z-20 mt-1 max-h-44 w-full overflow-auto rounded-md border bg-popover shadow">
                          {catalogoServicos
                            .filter((item) =>
                              item.nome.toLowerCase().includes((s.descricao || "").toLowerCase())
                            )
                            .slice(0, 8)
                            .map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => selecionarServicoCatalogo(s.id, item)}
                              >
                                <span className="font-medium">{item.nome}</span>
                                <span className="text-muted-foreground">
                                  {" "}— R$ {Number(item.preco_padrao || 0).toFixed(2)}
                                </span>
                              </button>
                            ))}
                          {catalogoServicos.filter((item) =>
                            item.nome.toLowerCase().includes((s.descricao || "").toLowerCase())
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
                      className="w-28"
                      disabled={salvando}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removerServico(s.id)}
                      type="button"
                      disabled={salvando}
                      aria-label="Remover"
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

          <div className="space-y-2">
            <Label htmlFor="orc-valor">Valor total</Label>
            <Input
              id="orc-valor"
              type="number"
              min={0}
              step="0.01"
              value={Number.isFinite(valorTotal) ? valorTotal : ""}
              onChange={(e) => handleValorTotalChange(e.target.value)}
              disabled={salvando}
            />
            <p className="text-xs text-muted-foreground">
              Calculado automaticamente dos serviços. Você pode editar manualmente.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="orc-defeito">Defeito Relatado</Label>
            <Textarea
              id="orc-defeito"
              value={defeitoRelatado}
              onChange={(e) => setDefeitoRelatado(e.target.value)}
              placeholder="Descreva o defeito informado pelo cliente"
              rows={3}
              disabled={salvando}
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" type="button" disabled={salvando}>
              Cancelar
            </Button>
          </DialogClose>
          <Button
            type="button"
            disabled={salvando}
            onClick={() => void handleSubmit()}
          >
            {salvando ? "Gerando..." : "Gerar Orçamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
