import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { respondeNoPortal } from "@/components/equipamentos/AcessoPortalDialog";
import { usePortalCliente } from "@/components/equipamentos/portal-cliente-context";
import type { ClienteContato } from "@/types";

/**
 * Quem deste cliente consegue responder pelo portal. Sem ninguém, o operador libera o acesso e cria
 * a senha (inclusive cadastrando o contato), sem sair do equipamento.
 */
export function QuemRespondeNoPortal() {
  const { equipamento, contatosVersao, abrirAcesso } = usePortalCliente();
  const [contatos, setContatos] = useState<ClienteContato[] | null>(null);
  const clienteId = equipamento.cliente_id;
  const empresaId = equipamento.empresa_id;

  const carregar = useCallback(async () => {
    if (!clienteId || !empresaId) return;
    try {
      setContatos(await db.listarClienteContatos(clienteId, empresaId));
    } catch {
      setContatos(null);
    }
  }, [clienteId, empresaId]);

  useEffect(() => { void carregar(); }, [carregar, contatosVersao]);

  if (!clienteId) {
    return <p className="text-xs text-muted-foreground">Atendimento sem cliente cadastrado: vincule um cliente para usar o portal.</p>;
  }
  if (!contatos) return null;
  const respondem = contatos.filter(respondeNoPortal);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {respondem.length > 0 ? (
        <p className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <span>
            Quem responde no portal:{" "}
            {respondem.map((contato, indice) => (
              <span key={contato.id}>
                {indice > 0 && ", "}
                <strong>{contato.nome}</strong>
              </span>
            ))}
          </span>
        </p>
      ) : (
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">Ninguém deste cliente pode responder pelo portal.</p>
      )}
      <Button size="sm" variant={respondem.length > 0 ? "ghost" : "default"} onClick={abrirAcesso}>
        <KeyRound className="mr-1 h-4 w-4" /> {respondem.length > 0 ? "Gerenciar acesso" : "Dar acesso a um contato"}
      </Button>
    </div>
  );
}
