import { useState, useCallback, useEffect } from "react";
import { CalendarDays, ChevronRight, DollarSign, Download, Eye, EyeOff, Plus, RefreshCw } from "lucide-react";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { COR_ENTRA, COR_FIXO, CartaoNumero, CartaoVariaveis, ComposicaoGastos, GraficoFaturamento, LancamentosDoMes, MedidorTracos, PesoNoFaturamento, PorCategoria } from "@/components/financas/PainelFinancas";
import { useExportarLancamentos, useFinancasAno } from "@/hooks/useFinancasAno";
import { NOMES_MES, categoriasDoMes, dinheiro, dinheiroComSinal, maiorCategoria, mediaVariavelAnterior, totaisDoMes } from "@/lib/financas";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { useNotification } from "@/hooks/useNotification";
import { ErrorAlert } from "@/components/ui/error-alert";
import { SENSITIVE_PERMISSIONS } from "@/types";
import type { GastoFixo, GastoVariavel, GastoVariavelInput } from "@/types";
import {
  useGastosFixos,
  useGastosVariaveis,
  useResumoMensal,
} from "@/hooks/useGastos";
import { GastosTable } from "@/components/gastos/GastosTable";
import { GastosFormFixo } from "@/components/gastos/GastosFormFixo";
import { GastosFormVariavel } from "@/components/gastos/GastosFormVariavel";
import { PageHeader } from "@/components/PageHeader";

export default function Gastos() {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());

  const [fixoDialogOpen, setFixoDialogOpen] = useState(false);
  const [variavelDialogOpen, setVariavelDialogOpen] = useState(false);
  const [editandoFixo, setEditandoFixo] = useState<GastoFixo | null>(null);
  const [editandoVariavel, setEditandoVariavel] = useState<GastoVariavel | null>(null);
  const [salvando, setSalvando] = useState(false);

  const { ensureSensitiveAccess } = useSensitiveAccess();
  const { error: showError, success } = useNotification();

  const {
    gastosFixos,
    loading: loadingFixos,
    error: errorFixos,
    criarGastoFixoMutation,
    atualizarGastoFixoMutation,
    recarregar: recarregarFixos,
  } = useGastosFixos();

  const {
    gastosVariaveis,
    loading: loadingVariaveis,
    error: errorVariaveis,
    criarGastoVariavelMutation,
    recarregar: recarregarVariaveis,
  } = useGastosVariaveis(mes, ano);

  const {
    loading: loadingResumo,
    error: errorResumo,
    recarregar: recarregarResumo,
  } = useResumoMensal(mes, ano);

  const loading = loadingFixos || loadingVariaveis || loadingResumo;
  const error = errorFixos || errorVariaveis || errorResumo;

  const recarregarTudo = useCallback(() => {
    recarregarFixos();
    recarregarVariaveis();
    recarregarResumo();
  }, [recarregarFixos, recarregarVariaveis, recarregarResumo]);

  useEffect(() => {
    void recarregarTudo();
  }, [mes, ano, recarregarTudo]);

  async function abrirNovoFixo() {
    const liberado = await ensureSensitiveAccess({
      title: "Cadastrar gasto fixo",
      description: "Informe o PIN para cadastrar despesas recorrentes.",
      permission: SENSITIVE_PERMISSIONS.VIEW_EXPENSES,
    });
    if (!liberado) return;
    setEditandoFixo(null);
    setFixoDialogOpen(true);
  }

  async function abrirNovoVariavel() {
    const liberado = await ensureSensitiveAccess({
      title: "Cadastrar gasto variável",
      description: "Informe o PIN para cadastrar despesas avulsas.",
      permission: SENSITIVE_PERMISSIONS.VIEW_EXPENSES,
    });
    if (!liberado) return;
    setEditandoVariavel(null);
    setVariavelDialogOpen(true);
  }

  async function abrirEditarFixo(gasto: GastoFixo) {
    const liberado = await ensureSensitiveAccess({
      title: "Editar gasto fixo",
      description: "Informe o PIN para alterar gasto fixo.",
      permission: SENSITIVE_PERMISSIONS.VIEW_EXPENSES,
    });
    if (!liberado) return;
    setEditandoFixo(gasto);
    setFixoDialogOpen(true);
  }

  async function abrirEditarVariavel(gasto: GastoVariavel) {
    const liberado = await ensureSensitiveAccess({
      title: "Editar gasto variável",
      description: "Informe o PIN para alterar gasto variável.",
      permission: SENSITIVE_PERMISSIONS.VIEW_EXPENSES,
    });
    if (!liberado) return;
    setEditandoVariavel(gasto);
    setVariavelDialogOpen(true);
  }

  async function onSaveFixo(data: Omit<GastoFixo, "id">) {
    setSalvando(true);
    try {
      const resultado = editandoFixo
        ? await atualizarGastoFixoMutation(editandoFixo.id!, data)
        : await criarGastoFixoMutation(data);
      if (!resultado.sucesso) {
        throw new Error(resultado.erro || "Não foi possível salvar o gasto fixo.");
      }
      recarregarResumo();
      setFixoDialogOpen(false);
      setEditandoFixo(null);
    } catch (err: any) {
      console.error("Erro ao salvar gasto fixo:", err);
      showError("Gastos Fixos", "Salvar", err);
    } finally {
      setSalvando(false);
    }
  }

  async function onSaveVariavel(data: GastoVariavelInput) {
    setSalvando(true);
    try {
      const resultado = await criarGastoVariavelMutation(data);
      if (!resultado.sucesso) {
        throw new Error(resultado.erro || "Não foi possível salvar o gasto variável.");
      }
      recarregarResumo();
      setVariavelDialogOpen(false);
      setEditandoVariavel(null);
    } catch (err: any) {
      console.error("Erro ao salvar gasto variável:", err);
      showError("Gastos Variáveis", "Salvar", err);
    } finally {
      setSalvando(false);
    }
  }

  const [ocultar, setOcultar] = useState(false);
  const [todasAbertas, setTodasAbertas] = useState(false);
  const exportar = useExportarLancamentos();
  const totais = totaisDoMes(gastosFixos, gastosVariaveis);
  const { meses, anterior, loading: loadingAno, error: erroAno } = useFinancasAno(ano, totais.fixo);
  const mesAtual = meses[mes - 1];
  const faturadoMes = mesAtual?.faturado ?? 0;
  const saldo = faturadoMes - totais.total;
  const mesAnterior = mes === 1 ? anterior[11] : meses[mes - 2];
  const saldoAnterior = mesAnterior ? mesAnterior.faturado - mesAnterior.fixo - mesAnterior.variavel : null;
  const media = mediaVariavelAnterior([...anterior, ...meses], mes, ano);
  const maiorVariavel = Math.max(0, ...[...anterior, ...meses].filter((m) => !m.futuro).map((m) => m.variavel));
  const categorias = categoriasDoMes(gastosFixos, gastosVariaveis);
  const maior = maiorCategoria(categorias);
  const opcoesMes = Array.from({ length: 36 }, (_, indice) => {
    const data = new Date(now.getFullYear(), now.getMonth() - indice, 1);
    return { mes: data.getMonth() + 1, ano: data.getFullYear() };
  });

  async function baixarCsv() {
    try {
      const nome = await exportar(mes, ano, gastosFixos, gastosVariaveis);
      success("Finanças", `Lançamentos salvos em ${nome}, na pasta temporária do app.`);
    } catch (err) {
      showError("Finanças", "Baixar lançamentos", err);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader titulo="Finanças">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={`${ano}-${mes}`} onValueChange={(valor) => { const [a, m] = valor.split("-").map(Number); setAno(a); setMes(m); }}>
            <SelectTrigger aria-label="Mês" className="h-10 w-auto gap-2 px-3 font-semibold">
              <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {opcoesMes.map((opcao) => (
                <SelectItem key={`${opcao.ano}-${opcao.mes}`} value={`${opcao.ano}-${opcao.mes}`}>
                  {NOMES_MES[opcao.mes - 1]}, {opcao.ano}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" className="h-10" onClick={() => void abrirNovoVariavel()}>
            <Plus className="h-4 w-4 mr-1.5" />
            Gasto variável
          </Button>
          <Button className="h-10" onClick={() => void abrirNovoFixo()}>
            <Plus className="h-4 w-4 mr-1.5" />
            Gasto fixo
          </Button>
        </div>
      </PageHeader>

      {error && <ErrorAlert variant="error" context="Gastos" message={error} action="Carregar" />}

      <div className="space-y-4 rounded-3xl border bg-card/40 p-4 md:p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <DollarSign className="h-4 w-4" aria-hidden="true" /> Financeiro / Finanças
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10"
              aria-pressed={ocultar}
              aria-label={ocultar ? "Mostrar valores" : "Ocultar valores"}
              title={ocultar ? "Mostrar valores" : "Ocultar valores"}
              onClick={() => setOcultar((atual) => !atual)}
            >
              {ocultar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="icon" className="h-10 w-10" aria-label="Baixar lançamentos do mês (CSV)" title="Baixar lançamentos do mês (CSV)" onClick={() => void baixarCsv()}>
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-10 w-10" aria-label="Recarregar" title="Recarregar" onClick={() => void recarregarTudo()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy={loading || undefined}>
          <CartaoNumero
            rotulo="Gastos fixos"
            valor={dinheiro(totais.fixo, ocultar)}
            medida={<MedidorTracos fracao={totais.total ? totais.fixo / totais.total : 0} cor={COR_FIXO} rotulo="Parte dos fixos nos gastos do mês" />}
            rodape={`${totais.quantidadeFixos} ${totais.quantidadeFixos === 1 ? "gasto fixo" : "gastos fixos"} no mês`}
          />
          <CartaoVariaveis valor={totais.variavel} quantidade={totais.quantidadeVariaveis} media={media} maximo={maiorVariavel} ocultar={ocultar} />
          <CartaoNumero
            rotulo="Saldo do mês"
            valor={<span className={saldo < 0 ? "text-status-bad" : undefined}>{dinheiroComSinal(saldo, ocultar)}</span>}
            medida={
              <div
                role="img"
                aria-label={`Faturado ${dinheiro(faturadoMes, ocultar)} contra gastos ${dinheiro(totais.total, ocultar)}`}
                className="flex h-7 gap-1 overflow-hidden rounded-[4px]"
              >
                {faturadoMes > 0 || totais.total > 0 ? (
                  <>
                    {/* Entrou (azul) contra saiu (vermelho): saldo positivo deixa o azul maior. */}
                    {faturadoMes > 0 && <span className="rounded-[4px]" style={{ flexGrow: faturadoMes, background: COR_ENTRA }} />}
                    {totais.total > 0 && <span className="rounded-[4px]" style={{ flexGrow: totais.total, background: COR_FIXO }} />}
                  </>
                ) : (
                  <span className="flex-1 rounded-[4px] bg-track" />
                )}
              </div>
            }
            rodape={
              saldoAnterior == null || loadingAno ? (
                "faturado menos gastos"
              ) : (
                <>
                  <span className={cn("font-semibold", saldo - saldoAnterior >= 0 ? "text-primary" : "text-status-bad")}>
                    {dinheiroComSinal(saldo - saldoAnterior, ocultar)}
                  </span>{" "}
                  vs. {NOMES_MES[(mes + 10) % 12].toLowerCase()}
                </>
              )
            }
          />
          <CartaoNumero
            rotulo="Maior categoria"
            valor={maior?.categoria ?? "—"}
            medida={
              <div role="img" aria-label="Peso de cada categoria nos gastos" className="flex h-7 items-end gap-1.5">
                {(maior?.todas ?? []).slice(0, 7).map((item, indice) => (
                  <span
                    key={item.categoria}
                    className={cn("flex-1 rounded-[3px]", indice === 0 ? "" : "bg-track")}
                    style={{ height: `${Math.max(15, (item.valor / (maior?.valor || 1)) * 100)}%`, background: indice === 0 ? COR_FIXO : undefined }}
                  />
                ))}
              </div>
            }
            rodape={
              maior ? (
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 text-left hover:text-foreground"
                  onClick={() => document.getElementById("financas-por-categoria")?.scrollIntoView({ behavior: "smooth", block: "center" })}
                >
                  <span>{dinheiro(maior.valor, ocultar)} · {Math.round(maior.parte * 100)}% dos gastos</span>
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : (
                "Nenhum gasto neste mês"
              )
            }
          />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <GraficoFaturamento
            meses={meses}
            anterior={anterior}
            mesEscolhido={mes}
            loading={loadingAno}
            error={erroAno}
            ocultar={ocultar}
            onEscolherMes={setMes}
          />
          <LancamentosDoMes
            fixos={gastosFixos}
            variaveis={gastosVariaveis}
            ocultar={ocultar}
            onEditarFixo={(g) => void abrirEditarFixo(g)}
            onEditarVariavel={(g) => void abrirEditarVariavel(g)}
            onVerTodas={() => setTodasAbertas(true)}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <ComposicaoGastos fixo={totais.fixo} variavel={totais.variavel} ocultar={ocultar} />
          <PorCategoria id="financas-por-categoria" categorias={categorias} ocultar={ocultar} />
          <PesoNoFaturamento gastos={totais.total} faturado={faturadoMes} ocultar={ocultar} />
        </div>
      </div>

      <Dialog open={todasAbertas} onOpenChange={setTodasAbertas}>
        <DialogContent tamanho="visualizador">
          <DialogHeader>
            <DialogTitle>Lançamentos de {NOMES_MES[mes - 1].toLowerCase()} de {ano}</DialogTitle>
            <DialogDescription className="sr-only">Todos os gastos fixos e variáveis do mês, com busca e filtros.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <GastosTable
              gastosFixos={gastosFixos}
              gastosVariaveis={gastosVariaveis}
              loading={loading}
              onEditFixo={(g) => { setTodasAbertas(false); void abrirEditarFixo(g); }}
              onEditVariavel={(g) => { setTodasAbertas(false); void abrirEditarVariavel(g); }}
            />
          </DialogBody>
        </DialogContent>
      </Dialog>

      <GastosFormFixo
        open={fixoDialogOpen}
        onOpenChange={setFixoDialogOpen}
        gasto={editandoFixo}
        onSave={onSaveFixo}
        saving={salvando}
      />

      <GastosFormVariavel
        open={variavelDialogOpen}
        onOpenChange={setVariavelDialogOpen}
        gasto={editandoVariavel}
        onSave={onSaveVariavel}
        saving={salvando}
      />
    </div>
  );
}
