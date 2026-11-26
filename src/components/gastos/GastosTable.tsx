import { useState, useMemo } from "react";
import { Search, Edit } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { GastoFixo, GastoVariavel, GastosFixosCategoria } from "@/types";
import { formatDatePtBr } from "@/lib/date-utils";
import { dinheiro } from "@/lib/financas";
import { CarregandoSkeleton, Skeleton } from "@/components/ui/skeleton";

const CATEGORIAS: GastosFixosCategoria[] = [
  "Aluguel",
  "Energia",
  "Internet",
  "Fornecedores",
  "Folha",
  "Outros",
];

interface GastosTableProps {
  gastosFixos: GastoFixo[];
  gastosVariaveis: GastoVariavel[];
  loading: boolean;
  ocultar: boolean;
  onEditFixo: (gasto: GastoFixo) => void;
  onEditVariavel: (gasto: GastoVariavel) => void;
}

export function GastosTable({
  gastosFixos,
  gastosVariaveis,
  loading,
  ocultar,
  onEditFixo,
  onEditVariavel,
}: GastosTableProps) {
  const [busca, setBusca] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("TODOS");
  const [tipoFiltro, setTipoFiltro] = useState<"todos" | "fixo" | "variavel">("todos");

  const rows = useMemo(() => {
    const fixoRows = gastosFixos.map((g) => ({
      id: `fixo-${g.id}`,
      tipo: "fixo" as const,
      descricao: g.nome,
      valor: g.valor,
      categoria: g.categoria,
      data: g.vencimento_dia ? `Dia ${g.vencimento_dia}` : "—",
      ativo: g.ativo,
      original: g,
    }));

    const variavelRows = gastosVariaveis.map((g) => ({
      id: `variavel-${g.id}`,
      tipo: "variavel" as const,
      descricao: g.descricao,
      valor: g.valor,
      categoria: g.categoria,
      data: g.data ? formatDatePtBr(g.data) : "—",
      ativo: true,
      original: g,
    }));

    let all = [...fixoRows, ...variavelRows];

    if (tipoFiltro !== "todos") {
      all = all.filter((r) => r.tipo === tipoFiltro);
    }

    if (categoriaFiltro !== "TODOS") {
      all = all.filter((r) => r.categoria === categoriaFiltro);
    }

    if (busca) {
      const lower = busca.toLowerCase();
      all = all.filter(
        (r) =>
          r.descricao.toLowerCase().includes(lower) ||
          r.categoria.toLowerCase().includes(lower),
      );
    }

    return all;
  }, [gastosFixos, gastosVariaveis, busca, categoriaFiltro, tipoFiltro]);

  const filtrando = busca !== "" || categoriaFiltro !== "TODOS" || tipoFiltro !== "todos";
  const tipos = [
    { valor: "todos" as const, rotulo: "Todos", total: gastosFixos.length + gastosVariaveis.length },
    { valor: "fixo" as const, rotulo: "Fixos", total: gastosFixos.length },
    { valor: "variavel" as const, rotulo: "Variáveis", total: gastosVariaveis.length },
  ];

  return (
    <section aria-labelledby="lancamentos-titulo" className="rounded-2xl border bg-card p-5">
      <h2 id="lancamentos-titulo" className="text-base font-bold">Lançamentos do mês</h2>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Tipo de gasto" className="inline-flex rounded-xl bg-muted p-1">
          {tipos.map((tipo) => (
            <button
              key={tipo.valor}
              type="button"
              aria-pressed={tipoFiltro === tipo.valor}
              onClick={() => setTipoFiltro(tipo.valor)}
              className={
                "inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition-colors duration-rapida md:h-9 " +
                (tipoFiltro === tipo.valor ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")
              }
            >
              {tipo.rotulo}
              <span className="text-[11px] tabular-nums opacity-70">{tipo.total}</span>
            </button>
          ))}
        </div>
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar gasto"
            placeholder="Buscar por descrição ou categoria"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="h-11 border-transparent bg-muted pl-10 md:h-10"
          />
        </div>
        <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
          <SelectTrigger aria-label="Categoria" className="h-11 w-[180px] md:h-10">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Todas categorias</SelectItem>
            {CATEGORIAS.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <CarregandoSkeleton rotulo="Carregando gastos" className="mt-4 space-y-3">
          {Array.from({ length: 4 }, (_, indice) => (
            <Skeleton key={indice} className="h-10 rounded-lg" />
          ))}
        </CarregandoSkeleton>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center">
          <p className="font-semibold">{filtrando ? "Nenhum gasto com esses filtros." : "Nenhum gasto neste mês."}</p>
          {filtrando && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                setBusca("");
                setCategoriaFiltro("TODOS");
                setTipoFiltro("todos");
              }}
            >
              Limpar filtros
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Descrição</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Data/Vencimento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-12 text-right"><span className="sr-only">Ações</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} className="h-12">
                  <TableCell className="font-semibold">
                    {row.descricao}
                    {!row.ativo && (
                      <span className="ml-2 rounded-full bg-status-neutral-bg px-2 py-0.5 text-xs font-bold text-status-neutral">Inativo</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      <span aria-hidden="true" className={"h-2 w-2 rounded-full " + (row.tipo === "fixo" ? "bg-status-bad" : "bg-status-bad/45")} />
                      {row.tipo === "fixo" ? "Fixo" : "Variável"}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.categoria}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{row.data}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {dinheiro(row.valor, ocultar)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Editar ${row.descricao}`}
                      onClick={() => {
                        if (row.tipo === "fixo") {
                          onEditFixo(row.original as GastoFixo);
                        } else {
                          onEditVariavel(row.original as GastoVariavel);
                        }
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
