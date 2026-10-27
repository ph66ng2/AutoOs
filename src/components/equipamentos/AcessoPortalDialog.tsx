import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, KeyRound, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClienteContatosPanel } from "@/components/clientes/ClienteContatosPanel";
import { SenhaPortalForm } from "@/components/clientes/SenhaPortalDialog";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import type { Cliente, ClienteContato, ClienteId } from "@/types";

/** Contato que responde orçamentos no portal: acesso DECIDIR e senha criada. */
export function respondeNoPortal(contato: ClienteContato) {
  return contato.ativo && contato.portal_acesso === "DECIDIR" && Boolean(contato.portal_senha_definida_em);
}

export function situacaoPortal(contato: ClienteContato): string {
  if (contato.portal_acesso === "DECIDIR") {
    return contato.portal_senha_definida_em ? "Pode responder · senha criada" : "Pode responder · ainda sem senha";
  }
  if (contato.portal_acesso === "ACOMPANHAR") {
    return contato.portal_senha_definida_em ? "Só acompanha · senha criada" : "Só acompanha · sem senha";
  }
  return "Sem acesso ao portal";
}

export function formatarDocumento(valor: string) {
  const d = valor.replace(/\D/g, "");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return valor;
}

type Tela = "acesso" | "contatos" | "senha";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clienteId: ClienteId;
  empresaId?: ClienteId;
  /** Responsável pelo equipamento: já vem marcado. */
  responsavelContatoId?: ClienteId | null;
  /** Avisa o quadro do orçamento para atualizar "quem responde". */
  onAlterado: () => void;
};

/**
 * Libera um contato para responder orçamentos e cria a senha, sem sair do equipamento.
 * Cadastrar ou editar contatos acontece aqui mesmo (painel de contatos embutido) e volta para o acesso.
 */
export function AcessoPortalDialog({ open, onOpenChange, clienteId, empresaId, responsavelContatoId, onAlterado }: Props) {
  const [tela, setTela] = useState<Tela>("acesso");
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [contatos, setContatos] = useState<ClienteContato[]>([]);
  const [selecionado, setSelecionado] = useState<ClienteId | null>(null);
  const [podeResponder, setPodeResponder] = useState(true);
  const [carregando, setCarregando] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const idsAntesDosContatos = useRef<Set<ClienteId>>(new Set());
  const empresa = empresaId ?? cliente?.empresa_id;

  const carregar = useCallback(async (preferir?: ClienteId | null) => {
    setCarregando(true);
    setErro(null);
    try {
      const c = await db.buscarCliente(clienteId);
      setCliente(c);
      const lista = (await db.listarClienteContatos(clienteId, empresaId ?? c.empresa_id!)).filter((item) => item.ativo);
      setContatos(lista);
      setSelecionado((atual) => {
        const ids = new Set(lista.map((item) => item.id));
        for (const candidato of [preferir, atual, responsavelContatoId, lista.find(respondeNoPortal)?.id, lista[0]?.id]) {
          if (candidato && ids.has(candidato)) return candidato;
        }
        return null;
      });
    } catch (cause) {
      setErro(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCarregando(false);
    }
  }, [clienteId, empresaId, responsavelContatoId]);

  useEffect(() => {
    if (!open) return;
    setTela("acesso");
    setPodeResponder(true);
    void carregar();
  }, [open, carregar]);

  const contato = contatos.find((item) => item.id === selecionado) ?? null;
  const acessoDesejado = podeResponder ? "DECIDIR" : "ACOMPANHAR";
  const jaPronto = contato?.portal_acesso === acessoDesejado && Boolean(contato.portal_senha_definida_em);
  const documento = formatarDocumento(cliente?.documento || cliente?.cpf_cnpj || "");

  const irParaContatos = () => {
    idsAntesDosContatos.current = new Set(contatos.map((item) => item.id!));
    setTela("contatos");
  };

  const voltarDosContatos = async () => {
    setTela("acesso");
    const antes = idsAntesDosContatos.current;
    const lista = await db.listarClienteContatos(clienteId, empresa!).catch(() => null);
    // Contato recém-cadastrado já volta marcado.
    const novo = lista?.filter((item) => item.ativo && item.id && !antes.has(item.id)).at(-1);
    await carregar(novo?.id ?? null);
    onAlterado();
  };

  const liberar = async () => {
    if (!contato?.id) return;
    setBusy(true);
    setErro(null);
    try {
      if (contato.portal_acesso !== acessoDesejado) {
        const atualizado = await db.definirAcessoPortalContato(contato.id, acessoDesejado);
        setContatos((lista) => lista.map((item) => (item.id === atualizado.id ? atualizado : item)));
        onAlterado();
      }
      setTela("senha");
    } catch (cause) {
      setErro(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-h-[88vh] overflow-y-auto", tela === "contatos" ? "sm:max-w-2xl" : "sm:max-w-lg")}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4" /> Acesso ao Portal do Cliente</DialogTitle>
          <DialogDescription>
            {cliente ? <>{cliente.nome || cliente.razao_social} · CPF/CNPJ {documento || "não cadastrado"}</> : "Carregando cliente…"}
          </DialogDescription>
        </DialogHeader>

        {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}

        {tela === "acesso" && (
          <div className="space-y-4">
            {!carregando && contatos.length === 0 && (
              <div className="rounded-md border border-dashed p-4 text-sm">
                <p>Este cliente ainda não tem contatos. Cadastre quem vai responder aos orçamentos.</p>
                <Button type="button" size="sm" className="mt-3" onClick={irParaContatos}>
                  <UserPlus className="mr-1 h-4 w-4" /> Cadastrar contato
                </Button>
              </div>
            )}

            {contatos.length > 0 && (
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-medium">Quem vai usar o portal?</legend>
                {contatos.map((item) => (
                  <label
                    key={item.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm",
                      selecionado === item.id ? "border-primary bg-primary/5" : "hover:bg-muted/40",
                    )}
                  >
                    <input
                      type="radio"
                      name="contato-portal"
                      className="mt-1"
                      checked={selecionado === item.id}
                      onChange={() => setSelecionado(item.id!)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{item.nome}</span>
                      {item.id === responsavelContatoId && <span className="ml-2 text-xs text-muted-foreground">responsável pelo equipamento</span>}
                      <span className="block text-xs text-muted-foreground">
                        {[item.telefone, item.email].filter(Boolean).join(" · ") || "sem telefone e email"}
                      </span>
                      <span className={cn("block text-xs", respondeNoPortal(item) ? "text-emerald-700" : "text-muted-foreground")}>
                        {situacaoPortal(item)}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}

            {contato && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={podeResponder} onChange={(event) => setPodeResponder(event.target.checked)} />
                <span>
                  Pode responder orçamentos (aceitar, recusar e negociar)
                  <span className="block text-xs text-muted-foreground">Desmarcado: só acompanha o andamento. Responder exige a permissão financeira.</span>
                </span>
              </label>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <Button type="button" variant="link" className="h-auto px-0" onClick={irParaContatos}>
                <UserPlus className="mr-1 h-4 w-4" /> Cadastrar ou editar contatos
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
                {contato && (
                  <Button type="button" disabled={busy} onClick={() => void liberar()}>
                    {busy ? "Liberando…" : jaPronto ? "Criar nova senha" : "Liberar acesso e criar senha"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {tela === "contatos" && cliente && (
          <div className="space-y-3">
            <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={() => void voltarDosContatos()}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Voltar para o acesso ao portal
            </Button>
            <ClienteContatosPanel cliente={cliente} empresaId={empresa} />
          </div>
        )}

        {tela === "senha" && contato && (
          <div className="space-y-3">
            <p className="text-sm">
              <strong>{contato.nome}</strong> entra em status.bmitag.com.br com o CPF/CNPJ <strong>{documento}</strong> e a senha abaixo.
            </p>
            <SenhaPortalForm
              contato={contato}
              documentoCliente={documento}
              onCancelar={() => setTela("acesso")}
              onSalvo={() => { void carregar(contato.id); onAlterado(); }}
              onConcluir={() => onOpenChange(false)}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
