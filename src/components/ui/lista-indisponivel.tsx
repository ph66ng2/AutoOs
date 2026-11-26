import { CloudOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ListaIndisponivelProps {
  /** "equipamentos", "clientes"… entra no título. */
  oque: string;
  onTentarDeNovo: () => void;
  tentando?: boolean;
}

/**
 * Lista que não carregou (banco fora, sessão sem empresa, erro do servidor). Nunca mostra o
 * "Nenhum … encontrado / Clique em Novo…": com o banco fora isso parece uma base vazia.
 */
export function ListaIndisponivel({ oque, onTentarDeNovo, tentando = false }: ListaIndisponivelProps) {
  return (
    <div role="status" className="py-12 text-center text-muted-foreground">
      <CloudOff className="mx-auto mb-4 h-16 w-16 opacity-20" aria-hidden="true" />
      <p className="mb-1 text-lg font-medium text-foreground">Não foi possível carregar os {oque}</p>
      <p className="mb-4 text-sm">Nada foi apagado: os dados continuam no servidor. Confira a conexão e tente de novo.</p>
      <Button variant="outline" onClick={onTentarDeNovo} disabled={tentando}>
        <RefreshCw className={`mr-2 h-4 w-4${tentando ? " animate-spin" : ""}`} aria-hidden="true" />
        {tentando ? "Tentando…" : "Tentar de novo"}
      </Button>
    </div>
  );
}
