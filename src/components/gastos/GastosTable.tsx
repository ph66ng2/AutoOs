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
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { GastoFixo, GastoVariavel, GastosFixosCategoria } from "@/types";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

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
  onEditFixo: (gasto: GastoFixo) => void;
  onEditVariavel: (gasto: GastoVariavel) => void;
}

export function GastosTable({
  gastosFixos,
  gastosVariaveis,
  loading,
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
      data: g.data ? new Date(g.data).toLocaleDateString("pt-BR") : "—",
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

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por descrição ou categoria..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
            <SelectTrigger className="w-[180px]">
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

          <Select value={tipoFiltro} onValueChange={(v) => setTipoFiltro(v as typeof tipoFiltro)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="fixo">Fixos</SelectItem>
              <SelectItem value="variavel">Variáveis</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {rows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-lg font-medium mb-1">Nenhum gasto encontrado</p>
            <p className="text-sm">
              {busca || categoriaFiltro !== "TODOS"
                ? "Tente ajustar os filtros."
                : "Cadastre gastos fixos ou variáveis."}
            </p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Data/Vencimento</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Badge variant={row.tipo === "fixo" ? "default" : "secondary"}>
                        {row.tipo === "fixo" ? "Fixo" : "Variável"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {row.descricao}
                      {!row.ativo && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          Inativo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.categoria}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {currencyFormatter.format(row.valor)}
                    </TableCell>
                    <TableCell>{row.data}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
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
      </CardContent>
    </Card>
  );
}
