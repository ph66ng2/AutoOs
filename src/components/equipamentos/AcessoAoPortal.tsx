import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatarDocumento } from "@/components/equipamentos/AcessoPortalDialog";
import { usePortalCliente } from "@/components/equipamentos/portal-cliente-context";
import { useAcessoPortalCliente } from "@/hooks/useAcessoPortalCliente";

/** Login do portal do cliente e quem pode entrar nele. A senha nunca aparece aqui. */
export function AcessoAoPortal() {
  const { equipamento, contatosVersao, abrirContatos } = usePortalCliente();
  const { data, loading, error } = useAcessoPortalCliente(equipamento.cliente_id, equipamento.empresa_id, contatosVersao);

  if (!equipamento.cliente_id) {
    return <p className="text-xs text-muted-foreground">Atendimento sem cliente cadastrado.</p>;
  }

  const documento = data?.documento ? formatarDocumento(data.documento) : null;
  const contatos = data?.contatos ?? [];

  async function copiarLogin() {
    if (!documento) return;
    try {
      await navigator.clipboard.writeText(documento);
      toast.success("Login copiado");
    } catch {
      toast.error("Não foi possível copiar o login");
    }
  }

  return (
    <div className="space-y-3 text-sm">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {loading && !data && <p className="text-xs text-muted-foreground">Carregando acesso…</p>}

      {data && (
        documento ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>Login: <strong>{documento}</strong></p>
            <Button size="sm" variant="outline" onClick={() => void copiarLogin()}>Copiar</Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">CPF/CNPJ não cadastrado no cliente.</p>
        )
      )}

      {data && (contatos.length > 0 ? (
        <ul aria-label="Contatos com acesso" className="space-y-1">
          {contatos.map((contato) => (
            <li key={contato.id} className="flex flex-wrap gap-x-2 text-xs">
              <span className="font-medium">{contato.nome}</span>
              <span className="text-muted-foreground">·</span>
              <span>{contato.portal_acesso === "DECIDIR" ? "Aprovar e recusar" : "Só acompanhar"}</span>
              <span className="text-muted-foreground">·</span>
              <span>{contato.portal_senha_definida_em ? "Senha criada" : "Sem senha"}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Nenhum contato deste cliente tem acesso ao portal.</p>
      ))}

      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={abrirContatos}>Gerenciar em Contatos</Button>
      </div>
    </div>
  );
}
