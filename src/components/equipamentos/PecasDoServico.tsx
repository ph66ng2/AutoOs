import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { carregarProdutosParaPecas, type ProdutoParaPecaSugerida } from "@/lib/data/servicos-repository";
import type { ClienteId, PecaVinculada } from "@/types";

interface Props<Id extends ClienteId> {
  pecas: PecaVinculada<Id>[];
  onChange: (pecas: PecaVinculada<Id>[]) => void;
}

export function PecasDoServico<Id extends ClienteId>({ pecas, onChange }: Props<Id>) {
  const [produtos, setProdutos] = useState<ProdutoParaPecaSugerida[]>([]);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    void carregarProdutosParaPecas()
      .then((lista) => { if (ativo) setProdutos(lista); })
      .catch(() => { if (ativo) setErro("Não foi possível consultar o estoque."); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, []);

  function adicionar(produtoId: string) {
    const produto = produtos.find((item) => item.id === produtoId);
    if (!produto || pecas.some((item) => item.produto_id === produtoId)) return;
    onChange([...pecas, {
      produto_id: produto.id as Id,
      nome: produto.nome,
      quantidade: 1,
      valor_unitario: produto.preco_venda,
    }]);
  }

  return (
    <div className="mt-2 space-y-2 rounded-md border p-3">
      <p className="text-xs font-medium">Peças sugeridas para este serviço</p>
      {pecas.map((peca) => {
        const saldo = produtos.find((item) => item.id === peca.produto_id)?.quantidade_estoque;
        return (
          <div key={peca.produto_id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="min-w-36 flex-1">{peca.nome}</span>
            <Input
              aria-label={`Quantidade de ${peca.nome}`}
              className="w-20"
              type="number"
              min={1}
              step={1}
              value={peca.quantidade}
              onChange={(event) => onChange(pecas.map((item) => item.produto_id === peca.produto_id
                ? { ...item, quantidade: Number(event.target.value) }
                : item))}
            />
            <Input
              aria-label={`Valor de ${peca.nome}`}
              className="w-24"
              type="number"
              min={0}
              step="0.01"
              value={peca.valor_unitario}
              onChange={(event) => onChange(pecas.map((item) => item.produto_id === peca.produto_id
                ? { ...item, valor_unitario: Number(event.target.value) }
                : item))}
            />
            <span className={saldo !== undefined && saldo < peca.quantidade ? "text-amber-700" : "text-muted-foreground"}>
              Saldo {saldo ?? "—"}{saldo !== undefined && saldo < peca.quantidade ? " · falta peça" : ""}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remover ${peca.nome}`}
              onClick={() => onChange(pecas.filter((item) => item.produto_id !== peca.produto_id))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      })}
      <div className="flex items-center gap-2">
        <Plus className="h-4 w-4 text-muted-foreground" />
        <select
          aria-label="Adicionar peça"
          aria-busy={carregando}
          className="h-9 flex-1 rounded-md border bg-background px-2 text-sm"
          value=""
          disabled={carregando || Boolean(erro) || produtos.length === 0}
          onChange={(event) => adicionar(event.target.value)}
        >
          <option value="">
            {carregando ? "Carregando estoque..." : erro ? "Estoque indisponível" : produtos.length === 0 ? "Nenhuma peça ativa no estoque" : "Adicionar peça do estoque..."}
          </option>
          {produtos.filter((produto) => !pecas.some((peca) => peca.produto_id === produto.id))
            .map((produto) => (
              <option key={produto.id} value={produto.id}>
                {produto.nome} · saldo {produto.quantidade_estoque}
              </option>
            ))}
        </select>
      </div>
      {erro && <p className="text-xs text-destructive">{erro}</p>}
    </div>
  );
}
