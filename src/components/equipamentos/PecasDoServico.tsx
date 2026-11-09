import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ValorDecimalInput } from "@/components/ui/valor-decimal-input";
import { carregarProdutosParaPecas, type ProdutoParaPecaSugerida } from "@/lib/data/servicos-repository";
import { carregarProdutosOrcamento, CATEGORIA_PECAS_ORCAMENTO } from "@/lib/orcamento-estoque";
import { formatCurrencyOrMissing } from "@/lib/utils";
import type { ClienteId, PecaVinculada } from "@/types";

/** Produto do SaaS não traz categoria; o do desktop só oferece a categoria Peça. */
type ProdutoPeca = ProdutoParaPecaSugerida & { categoria?: string };

interface Props<Id extends ClienteId> {
  pecas: PecaVinculada<Id>[];
  onChange: (pecas: PecaVinculada<Id>[]) => void;
  saasMode?: boolean;
  /** Informa o pai quando algum preço de peça tem texto inválido (bloqueia o submit). */
  onValidityChange?: (valido: boolean) => void;
}

export function PecasDoServico<Id extends ClienteId>({ pecas, onChange, saasMode = true, onValidityChange }: Props<Id>) {
  const [produtos, setProdutos] = useState<ProdutoPeca[]>([]);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [precosInvalidos, setPrecosInvalidos] = useState<Record<string, boolean>>({});
  const validadeRef = useRef(onValidityChange);
  validadeRef.current = onValidityChange;

  const algumPrecoInvalido = pecas.some((peca) => precosInvalidos[String(peca.produto_id)]);
  useEffect(() => {
    validadeRef.current?.(!algumPrecoInvalido);
  }, [algumPrecoInvalido]);
  useEffect(() => () => validadeRef.current?.(true), []);

  useEffect(() => {
    let ativo = true;
    const carregar = async (): Promise<ProdutoPeca[]> => {
      if (saasMode) return carregarProdutosParaPecas();
      const lista = await carregarProdutosOrcamento();
      return lista.map((produto) => ({
        id: produto.id!, empresa_id: produto.empresa_id!, nome: produto.nome,
        quantidade_estoque: produto.quantidade_estoque,
        preco_venda: Number(produto.preco_venda ?? 0), ativo: produto.ativo ?? true,
        categoria: produto.categoria,
      }));
    };
    void carregar()
      .then((lista) => { if (ativo) setProdutos(lista); })
      .catch(() => { if (ativo) setErro("Não foi possível consultar o estoque."); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [saasMode]);

  // O saldo de peças já vinculadas em orçamentos antigos usa a lista completa;
  // o seletor oferece só a categoria Peça (desktop).
  const opcoes = produtos.filter((produto) => produto.categoria === undefined || produto.categoria === CATEGORIA_PECAS_ORCAMENTO);

  function adicionar(produtoId: string) {
    const produto = produtos.find((item) => String(item.id) === produtoId);
    if (!produto || pecas.some((item) => String(item.produto_id) === produtoId)) return;
    onChange([...pecas, {
      produto_id: produto.id as Id,
      nome: produto.nome,
      quantidade: 1,
      valor_unitario: produto.preco_venda,
    }]);
  }

  return (
    <div className="mt-2 min-w-0 space-y-2 rounded-md border p-3">
      <p className="text-xs font-medium">Peças sugeridas para este serviço</p>
      {pecas.map((peca) => {
        const saldo = produtos.find((item) => String(item.id) === String(peca.produto_id))?.quantidade_estoque;
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
            <ValorDecimalInput
              aria-label={`Valor de ${peca.nome}`}
              className="w-24"
              min={0}
              value={Number(peca.valor_unitario) || 0}
              onValidityChange={(valido) => setPrecosInvalidos((atual) => ({ ...atual, [String(peca.produto_id)]: !valido }))}
              onValueChange={(valor) => onChange(pecas.map((item) => item.produto_id === peca.produto_id
                ? { ...item, valor_unitario: valor }
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
              onClick={() => {
                setPrecosInvalidos((atual) => {
                  const { [String(peca.produto_id)]: _removido, ...resto } = atual;
                  return resto;
                });
                onChange(pecas.filter((item) => item.produto_id !== peca.produto_id));
              }}
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
          className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
          value=""
          disabled={carregando || Boolean(erro) || opcoes.length === 0}
          onChange={(event) => adicionar(event.target.value)}
        >
          <option value="">
            {carregando ? "Carregando estoque..." : erro ? "Estoque indisponível" : opcoes.length === 0 ? "Nenhuma peça ativa no estoque" : "Adicionar peça do estoque..."}
          </option>
          {opcoes.filter((produto) => !pecas.some((peca) => String(peca.produto_id) === String(produto.id)))
            .map((produto) => (
              <option key={produto.id} value={produto.id}>
                {produto.nome} · {formatCurrencyOrMissing(Number(produto.preco_venda))} · saldo {produto.quantidade_estoque}
              </option>
            ))}
        </select>
      </div>
      {erro && <p className="text-xs text-destructive">{erro}</p>}
    </div>
  );
}
