import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronDown, Printer, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorAlert } from "@/components/ui/error-alert";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/pages/equipamentos/EquipamentosStatusBadge";
import { nomeExibicaoCliente } from "@/components/clientes/cliente-display-utils";
import { useHistoricoEquipamentosCliente } from "@/hooks/useHistoricoEquipamentosCliente";
import type { EquipamentoHistorico } from "@/lib/historico-equipamentos";
import { formatDatePtBr } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

const COLUNAS = "md:grid md:grid-cols-[minmax(0,1fr)_6.5rem_7.5rem_9.5rem_11rem_1.25rem] md:items-center md:gap-4";

/** atualizado_em vem do PostgreSQL como texto ("2026-11-16 15:30:00.12+00"); data só, no fuso de Salvador. */
function dataDaMovimentacao(valor: string): string {
  if (valor.length <= 10) return formatDatePtBr(valor, "—");
  const instante = new Date(valor.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
  return Number.isNaN(instante.getTime())
    ? formatDatePtBr(valor.slice(0, 10), "—")
    : instante.toLocaleDateString("pt-BR", { timeZone: "America/Bahia" });
}

function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

/** Todos os aparelhos que o cliente já trouxe, com quantas vezes cada um passou pela assistência. */
export default function ClienteEquipamentos() {
  const navigate = useNavigate();
  const { id } = useParams();
  const clienteId = id && /^\d+$/.test(id) ? Number(id) : null;
  const { cliente, aparelhos, totalOs, loading, error, recarregar } = useHistoricoEquipamentosCliente(clienteId);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  const servicos = aparelhos.reduce((soma, a) => soma + a.servicosFeitos, 0);
  const nome = cliente ? nomeExibicaoCliente(cliente) : "";

  function alternar(chave: string) {
    setAbertos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });
  }

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" className="-ml-2 h-8 gap-1.5 px-2 text-muted-foreground" onClick={() => navigate("/clientes")}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Clientes
      </Button>

      <PageHeader
        titulo={cliente ? `Equipamentos de ${nome}` : "Equipamentos do cliente"}
        descricao={loading || !cliente ? undefined : `${plural(aparelhos.length, "equipamento", "equipamentos")} · ${plural(totalOs, "passagem", "passagens")} pela assistência · ${plural(servicos, "serviço feito", "serviços feitos")}`}
      >
        <Button variant="outline" size="icon" className="h-10 w-10" aria-label="Atualizar" onClick={() => void recarregar()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </PageHeader>

      {error && <ErrorAlert variant="error" context="Equipamentos do cliente" message={error} action="Carregar" />}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-32 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" /></div>
          ) : aparelhos.length === 0 ? (
            !error && (
              <div className="py-12 text-center text-muted-foreground">
                <Printer className="mx-auto mb-4 h-14 w-14 opacity-20" aria-hidden="true" />
                <p className="font-medium">Este cliente ainda não trouxe equipamentos</p>
              </div>
            )
          ) : (
            <>
              <div className={cn("hidden border-b px-5 py-3 text-xs font-semibold text-muted-foreground", COLUNAS)}>
                <span>Equipamento</span>
                <span className="text-right" title="Quantas OS o aparelho já teve">Passagens</span>
                <span className="text-right" title="OS que chegaram a Pronto: manutenção concluída">Serviços feitos</span>
                <span title="Última alteração em qualquer OS do aparelho">Última movimentação</span>
                <span>Situação</span>
                <span />
              </div>
              <ul className="divide-y">
                {aparelhos.map((aparelho) => (
                  <LinhaAparelho
                    key={aparelho.chave}
                    aparelho={aparelho}
                    aberto={abertos.has(aparelho.chave)}
                    onAlternar={() => alternar(aparelho.chave)}
                    onAbrirOs={(osId) => navigate(`/equipamentos/${osId}`)}
                  />
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LinhaAparelho({
  aparelho,
  aberto,
  onAlternar,
  onAbrirOs,
}: {
  aparelho: EquipamentoHistorico;
  aberto: boolean;
  onAlternar: () => void;
  onAbrirOs: (osId: number) => void;
}) {
  const painelId = `passagens-${aparelho.chave}`;
  return (
    <li>
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={painelId}
        onClick={onAlternar}
        className={cn("flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 text-left transition-colors duration-rapida hover:bg-muted/60", COLUNAS)}
      >
        <span className="min-w-0 basis-full md:basis-auto">
          <span className="block truncate text-sm font-semibold">{aparelho.marca} {aparelho.modelo}</span>
          <span className="block truncate font-mono text-xs text-muted-foreground">{aparelho.serial || "sem número de série"}</span>
        </span>
        <span className="text-sm tabular-nums md:text-right">
          <span className="font-semibold">{aparelho.passagens.length}</span>
          <span className="text-muted-foreground md:hidden"> {aparelho.passagens.length === 1 ? "passagem" : "passagens"}</span>
        </span>
        <span className="text-sm tabular-nums md:text-right">
          <span className="font-semibold">{aparelho.servicosFeitos}</span>
          <span className="text-muted-foreground md:hidden"> {aparelho.servicosFeitos === 1 ? "serviço feito" : "serviços feitos"}</span>
        </span>
        <span className="text-sm tabular-nums text-muted-foreground">{dataDaMovimentacao(aparelho.ultimaMovimentacao)}</span>
        <span><StatusBadge status={aparelho.statusAtual} /></span>
        <ChevronDown
          aria-hidden="true"
          className={cn("ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-padrao ease-saida md:ml-0", aberto && "rotate-180")}
        />
      </button>
      {aberto && (
        <div id={painelId} className="bg-muted/40 px-5 py-3">
          <ol className="space-y-1.5">
            {aparelho.passagens.map((os) => (
              <li key={os.id}>
                <button
                  type="button"
                  onClick={() => os.id != null && onAbrirOs(os.id)}
                  className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-card px-3 py-2.5 text-left text-sm transition-colors duration-rapida hover:bg-background"
                >
                  <span className="w-16 font-semibold tabular-nums">OS {os.id}</span>
                  <span className="w-56 whitespace-nowrap tabular-nums text-muted-foreground">
                    {formatDatePtBr(os.data_entrada, "—")}
                    {os.data_saida ? ` → ${formatDatePtBr(os.data_saida, "")}` : ""}
                  </span>
                  <StatusBadge status={os.status} />
                  {os.defeito_relatado && <span className="min-w-0 flex-1 truncate text-muted-foreground">{os.defeito_relatado}</span>}
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </li>
  );
}
