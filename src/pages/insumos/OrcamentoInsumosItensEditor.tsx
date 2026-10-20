/**
 * Itens do orçamento de insumos: busca no estoque (qualquer categoria, menos impressoras),
 * mostra o saldo de cada produto e deixa ajustar quantidade e valor unitário.
 */
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/db";
import {
  categoriaOrcavel,
  valorUnitarioPadrao,
  type LinhaOrcamentoInsumos,
  type TotaisOrcamentoInsumos,
} from "@/lib/orcamento-insumos";
import { formatCurrency } from "@/lib/utils";
import { categoriaProdutoLabel } from "@/pages/insumos/insumos-page-constants";
import type { Produto } from "@/types";

interface OrcamentoInsumosItensEditorProps {
  linhas: LinhaOrcamentoInsumos[];
  totais: TotaisOrcamentoInsumos;
  onChange: (linhas: LinhaOrcamentoInsumos[]) => void;
  disabled?: boolean;
}

export function OrcamentoInsumosItensEditor({
  linhas,
  totais,
  onChange,
  disabled = false,
}: OrcamentoInsumosItensEditorProps) {
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<Produto[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [erroBusca, setErroBusca] = useState<string | null>(null);

  useEffect(() => {
    const termo = busca.trim();
    if (disabled || termo.length < 2) {
      setResultados([]);
      setErroBusca(null);
      return;
    }
    let ativo = true;
    const timer = window.setTimeout(() => {
      setBuscando(true);
      db.listarProdutos(termo, undefined, false, 0)
        .then((produtos) => {
          if (!ativo) return;
          setResultados(produtos.filter((produto) => categoriaOrcavel(produto.categoria)).slice(0, 8));
          setErroBusca(null);
        })
        .catch((error) => {
          if (ativo) {
            setResultados([]);
            setErroBusca(String(error));
          }
        })
        .finally(() => {
          if (ativo) setBuscando(false);
        });
    }, 250);
    return () => {
      ativo = false;
      window.clearTimeout(timer);
    };
  }, [busca, disabled]);

  const idsNaLista = useMemo(() => new Set(linhas.map((linha) => linha.produto_id)), [linhas]);

  function adicionar(produto: Produto) {
    if (produto.id == null) return;
    if (idsNaLista.has(produto.id)) {
      onChange(
        linhas.map((linha) =>
          linha.produto_id === produto.id ? { ...linha, quantidade: linha.quantidade + 1 } : linha,
        ),
      );
    } else {
      onChange([
        ...linhas,
        {
          produto_id: produto.id,
          descricao: produto.nome,
          categoria: produto.categoria,
          quantidade: 1,
          valor_unitario: valorUnitarioPadrao(produto.preco_venda),
          saldo: produto.quantidade_estoque ?? 0,
        },
      ]);
    }
    setBusca("");
    setResultados([]);
  }

  function alterar(produtoId: number, alteracao: Partial<LinhaOrcamentoInsumos>) {
    onChange(linhas.map((linha) => (linha.produto_id === produtoId ? { ...linha, ...alteracao } : linha)));
  }

  return (
    <div className="space-y-2">
      {!disabled && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar produto do estoque"
            placeholder="Buscar etiqueta, ribbon, peça... (nome ou código)"
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            className="h-9 pl-9"
          />
          {(resultados.length > 0 || buscando || erroBusca) && (
            <ul
              className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border bg-popover text-sm shadow-md"
              role="listbox"
              aria-label="Produtos encontrados"
            >
              {buscando && <li className="px-3 py-2 text-muted-foreground">Buscando...</li>}
              {erroBusca && <li className="px-3 py-2 text-red-600">{erroBusca}</li>}
              {!buscando && !erroBusca && resultados.length === 0 && (
                <li className="px-3 py-2 text-muted-foreground">Nenhum produto encontrado.</li>
              )}
              {resultados.map((produto) => (
                <li key={produto.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left hover:bg-accent"
                    onClick={() => adicionar(produto)}
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{produto.nome}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {categoriaProdutoLabel(produto.categoria)}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      saldo {produto.quantidade_estoque ?? 0}
                      {produto.preco_venda > 0 ? ` | ${formatCurrency(produto.preco_venda)}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="max-h-44 overflow-y-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/80 text-xs text-muted-foreground">
            <tr>
              <th className="px-2 py-1 text-left font-medium">Produto</th>
              <th className="w-16 px-2 py-1 text-center font-medium">Saldo</th>
              <th className="w-20 px-2 py-1 text-center font-medium">Qtd</th>
              <th className="w-28 px-2 py-1 text-right font-medium">Valor unit.</th>
              <th className="w-24 px-2 py-1 text-right font-medium">Total</th>
              {!disabled && <th className="w-9" />}
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr>
                <td colSpan={disabled ? 5 : 6} className="px-2 py-4 text-center text-muted-foreground">
                  Nenhum item. Busque um produto do estoque para incluir.
                </td>
              </tr>
            )}
            {linhas.map((linha, indice) => {
              const quantidadeInvalida = !Number.isInteger(linha.quantidade) || linha.quantidade <= 0;
              const semSaldo = linha.saldo != null && Math.floor(linha.quantidade || 0) > linha.saldo;
              return (
                <tr key={linha.produto_id} className="border-t" data-testid={`item-${linha.produto_id}`}>
                  <td className="px-2 py-1">
                    <span className="font-medium">{linha.descricao}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {categoriaProdutoLabel(linha.categoria)}
                    </span>
                  </td>
                  <td className="px-2 py-1 text-center">
                    {linha.saldo == null ? (
                      "—"
                    ) : (
                      <span
                        className={semSaldo ? "inline-flex items-center gap-1 font-semibold text-red-600" : ""}
                        title={semSaldo ? "Saldo menor que a quantidade pedida" : undefined}
                      >
                        {semSaldo && <AlertTriangle className="h-3 w-3" aria-hidden />}
                        {linha.saldo}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      aria-label={`Quantidade de ${linha.descricao}`}
                      value={Number.isFinite(linha.quantidade) ? linha.quantidade : ""}
                      disabled={disabled}
                      onChange={(event) =>
                        alterar(linha.produto_id, { quantidade: Math.floor(Number(event.target.value)) || 0 })
                      }
                      aria-invalid={quantidadeInvalida || undefined}
                      className={quantidadeInvalida ? "h-8 px-2 text-center border-red-500" : "h-8 px-2 text-center"}
                    />
                    {quantidadeInvalida && (
                      <p className="mt-0.5 text-[11px] leading-tight text-red-600" role="alert">
                        Informe uma quantidade maior que zero
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      aria-label={`Valor unitário de ${linha.descricao}`}
                      value={Number.isFinite(linha.valor_unitario) ? linha.valor_unitario : ""}
                      disabled={disabled}
                      onChange={(event) => alterar(linha.produto_id, { valor_unitario: Number(event.target.value) || 0 })}
                      className="h-8 px-2 text-right"
                    />
                  </td>
                  <td className="px-2 py-1 text-right font-medium tabular-nums">
                    {formatCurrency(totais.linhas[indice] ?? 0)}
                  </td>
                  {!disabled && (
                    <td className="px-1 py-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-600"
                        aria-label={`Remover ${linha.descricao}`}
                        onClick={() => onChange(linhas.filter((outra) => outra.produto_id !== linha.produto_id))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
