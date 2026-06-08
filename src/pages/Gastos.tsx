import { useState, useCallback, useEffect } from "react";
import { Plus, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
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
import { GastosSummaryCards } from "@/components/gastos/GastosSummaryCards";
import { GastosChart } from "@/components/gastos/GastosChart";
import { GastosTable } from "@/components/gastos/GastosTable";
import { GastosFormFixo } from "@/components/gastos/GastosFormFixo";
import { GastosFormVariavel } from "@/components/gastos/GastosFormVariavel";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

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
  const { error: showError } = useNotification();

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
    resumo,
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
      setVariavelDialogOpen(false);
      setEditandoVariavel(null);
    } catch (err: any) {
      console.error("Erro ao salvar gasto variável:", err);
      showError("Gastos Variáveis", "Salvar", err);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gastos</h1>
          <p className="text-muted-foreground">
            Gestão de despesas fixas e variáveis
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => void abrirNovoFixo()}>
            <Plus className="h-4 w-4 mr-2" />
            Gasto Fixo
          </Button>
          <Button onClick={() => void abrirNovoVariavel()}>
            <Plus className="h-4 w-4 mr-2" />
            Gasto Variável
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Mês" />
              </SelectTrigger>
              <SelectContent>
                {MESES.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Ano" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i).map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="outline" size="icon" onClick={() => void recarregarTudo()}>
              <TrendingUp className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && <ErrorAlert variant="error" context="Gastos" message={error} action="Carregar" />}

      <GastosSummaryCards
        resumo={resumo}
        gastosFixos={gastosFixos}
        loading={loading}
      />

      <GastosChart
        mes={mes}
        ano={ano}
        gastosFixos={gastosFixos}
      />

      <GastosTable
        gastosFixos={gastosFixos}
        gastosVariaveis={gastosVariaveis}
        loading={loading}
        onEditFixo={(g) => void abrirEditarFixo(g)}
        onEditVariavel={(g) => void abrirEditarVariavel(g)}
      />

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
