import { useEffect, useState } from "react";
import { Edit, KeyRound, Mail, Phone, Plus, UserRound, UserX } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorAlert } from "@/components/ui/error-alert";
import { useNotification } from "@/hooks/useNotification";
import { db } from "@/lib/db";
import { carregarRepositorioClienteContatos } from "@/lib/data/cliente-contatos-repository";
import { IS_SAAS_BUILD } from "@/lib/runtime-mode";
import {
  clienteContatoSchema,
  formatarTelefone,
  type ClienteContatoFormData,
} from "@/lib/validations";
import { nomeExibicaoCliente } from "@/components/clientes/cliente-display-utils";
import { SenhaPortalDialog } from "@/components/clientes/SenhaPortalDialog";
import type { AcessoPortalContato, Cliente, ClienteContato, ClienteContatoInput, ClienteId } from "@/types";

const ACESSO_PORTAL: Record<AcessoPortalContato, string> = {
  NENHUM: "Sem acesso ao portal",
  ACOMPANHAR: "Portal: acompanha status",
  DECIDIR: "Portal: acompanha e responde orçamentos",
};

interface ClienteContatosPanelProps {
  cliente: Cliente;
  empresaId?: ClienteId;
}

function formatarDocumentoCliente(valor: string) {
  const d = valor.replace(/\D/g, "");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return valor;
}

export function ClienteContatosPanel({ cliente, empresaId }: ClienteContatosPanelProps) {
  const [contatos, setContatos] = useState<ClienteContato[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<ClienteContato | null>(null);
  const [inativando, setInativando] = useState<ClienteContato | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [alterandoAcesso, setAlterandoAcesso] = useState<ClienteId | null>(null);
  const [senhaDe, setSenhaDe] = useState<ClienteContato | null>(null);
  const { success, error: showError } = useNotification();
  const form = useForm<ClienteContatoFormData>({
    resolver: zodResolver(clienteContatoSchema),
    defaultValues: { nome: "", email: "", telefone: "" },
  });

  async function carregarContatos() {
    if (!cliente.id || (!IS_SAAS_BUILD && !empresaId)) {
      setContatos([]);
      setErro(empresaId ? "Cliente sem identificador para listar contatos." : "Empresa não identificada para listar contatos.");
      return;
    }
    setCarregando(true);
    setErro(null);
    try {
      const repository = await carregarRepositorioClienteContatos();
      setContatos(await repository.listar(cliente.id, empresaId));
    } catch (cause) {
      setErro(String(cause));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregarContatos();
    // A identidade do cliente/empresa é a única fonte da listagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente.id, empresaId]);

  function abrirNovo() {
    setEditando(null);
    form.reset({ nome: "", email: "", telefone: "" });
    setDialogOpen(true);
  }

  function abrirEdicao(contato: ClienteContato) {
    setEditando(contato);
    form.reset({
      nome: contato.nome,
      email: contato.email || "",
      telefone: contato.telefone ? formatarTelefone(contato.telefone) : "",
    });
    setDialogOpen(true);
  }

  async function salvarContato(data: ClienteContatoFormData) {
    if (!cliente.id || (!IS_SAAS_BUILD && !empresaId)) return;
    setSalvando(true);
    const input: ClienteContatoInput = {
      empresa_id: empresaId ?? "",
      cliente_id: cliente.id,
      nome: data.nome.trim(),
      email: data.email.trim() || undefined,
      telefone: data.telefone.replace(/\D/g, "") || undefined,
      atualizado_em: editando?.atualizado_em,
    };
    try {
      if (editando?.id) {
        const repository = await carregarRepositorioClienteContatos();
        await repository.atualizar(editando.id, input);
        success("Clientes", "Contato atualizado.", "Contatos");
      } else {
        const repository = await carregarRepositorioClienteContatos();
        await repository.criar(input);
        success("Clientes", "Contato cadastrado.", "Contatos");
      }
      setDialogOpen(false);
      await carregarContatos();
    } catch (cause) {
      showError("Clientes", "Salvar contato", cause);
    } finally {
      setSalvando(false);
    }
  }

  async function alterarAcessoPortal(contato: ClienteContato, acesso: AcessoPortalContato) {
    if (!contato.id) return;
    setAlterandoAcesso(contato.id);
    try {
      const atualizado = await db.definirAcessoPortalContato(contato.id, acesso);
      success("Clientes", ACESSO_PORTAL[acesso] + ".", "Portal do cliente");
      await carregarContatos();
      // Liberar e criar a senha é um passo só: sem senha o contato não consegue entrar.
      if (acesso !== "NENHUM" && !atualizado?.portal_senha_definida_em) setSenhaDe(atualizado ?? { ...contato, portal_acesso: acesso });
    } catch (cause) {
      showError("Clientes", "Alterar acesso ao portal", cause);
    } finally {
      setAlterandoAcesso(null);
    }
  }

  async function confirmarInativacao() {
    if (!inativando?.id || (!IS_SAAS_BUILD && !empresaId)) return;
    setSalvando(true);
    try {
      const repository = await carregarRepositorioClienteContatos();
      await repository.inativar(inativando.id, empresaId == null ? undefined : Number(empresaId));
      setInativando(null);
      await carregarContatos();
      success("Clientes", "Contato inativado.", "Contatos");
    } catch (cause) {
      showError("Clientes", "Inativar contato", cause);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="space-y-4" aria-label={`Contatos de ${nomeExibicaoCliente(cliente)}`}>
      <div className="space-y-3">
        <div className="pr-10">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <UserRound className="h-4 w-4" /> Contatos do cliente
          </h3>
          <p className="text-sm text-muted-foreground">
            Empresa/cliente vinculado: <strong>{nomeExibicaoCliente(cliente)}</strong>
          </p>
        </div>
        <Button type="button" size="sm" onClick={abrirNovo} disabled={!cliente.id || (!IS_SAAS_BUILD && !empresaId)}>
          <Plus className="mr-1 h-4 w-4" /> Novo contato
        </Button>
      </div>

      {erro && <ErrorAlert variant="error" context="Clientes" message={erro} action={IS_SAAS_BUILD || empresaId ? "Carregar contatos" : "Use “Regularizar antigos” na tela de clientes"} />}
      {carregando ? (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">Carregando contatos...</div>
      ) : contatos.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhum contato ativo cadastrado para esta empresa/cliente.
        </div>
      ) : (
        <div className="space-y-2">
          {contatos.map((contato) => (
            <div key={contato.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div className="min-w-0">
                <p className="font-medium">{contato.nome}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span><Mail className="mr-1 inline h-3 w-3" />{contato.email || "Sem e-mail"}</span>
                  <span><Phone className="mr-1 inline h-3 w-3" />{contato.telefone ? formatarTelefone(contato.telefone) : "Sem telefone"}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Portal das Impressoras:</span>
                  <select
                    aria-label={`Acesso de ${contato.nome} ao portal`}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    value={contato.portal_acesso ?? "NENHUM"}
                    disabled={alterandoAcesso === contato.id}
                    onChange={(event) => void alterarAcessoPortal(contato, event.target.value as AcessoPortalContato)}
                  >
                    {(Object.keys(ACESSO_PORTAL) as AcessoPortalContato[]).map((acesso) => (
                      <option key={acesso} value={acesso}>{ACESSO_PORTAL[acesso]}</option>
                    ))}
                  </select>
                  {contato.portal_acesso && contato.portal_acesso !== "NENHUM" && (
                    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setSenhaDe(contato)}>
                      <KeyRound className="mr-1 h-3.5 w-3.5" />
                      {contato.portal_senha_definida_em ? "Trocar senha" : "Criar senha"}
                    </Button>
                  )}
                  {contato.portal_acesso && contato.portal_acesso !== "NENHUM" && (
                    <span className="text-muted-foreground">
                      {contato.portal_senha_definida_em ? "Senha criada" : "Sem senha (ainda não entra)"}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button type="button" size="sm" variant="outline" onClick={() => abrirEdicao(contato)}>
                  <Edit className="mr-1 h-3.5 w-3.5" /> Editar
                </Button>
                <Button type="button" size="sm" variant="ghost" className="text-red-600" onClick={() => setInativando(contato)}>
                  <UserX className="mr-1 h-3.5 w-3.5" /> Inativar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar contato" : "Novo contato"}</DialogTitle>
            <DialogDescription>
              Informe os canais que poderão ser usados para falar com este contato.
              {editando?.portal_acesso && editando.portal_acesso !== "NENHUM" && (
                <> O WhatsApp de orçamento só indica o portal se o telefone aqui for o mesmo que recebe a mensagem.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={form.handleSubmit(salvarContato)}>
            <div className="space-y-2">
              <Label htmlFor="contato-nome">Nome *</Label>
              <Input id="contato-nome" {...form.register("nome")} placeholder="Nome do contato" />
              {form.formState.errors.nome && <p className="text-xs text-red-600">{form.formState.errors.nome.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="contato-email">E-mail</Label>
              <Input id="contato-email" type="email" {...form.register("email")} placeholder="email@empresa.com" />
              {form.formState.errors.email && <p className="text-xs text-red-600">{form.formState.errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="contato-telefone">Telefone</Label>
              <Input
                id="contato-telefone"
                {...form.register("telefone", {
                  onChange: (event) => form.setValue("telefone", formatarTelefone(event.target.value), { shouldValidate: true }),
                })}
                placeholder="(00) 00000-0000"
              />
              {form.formState.errors.telefone && <p className="text-xs text-red-600">{form.formState.errors.telefone.message}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={salvando}>{salvando ? "Salvando..." : editando ? "Salvar" : "Cadastrar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <SenhaPortalDialog
        contato={senhaDe}
        documentoCliente={formatarDocumentoCliente(cliente.documento || cliente.cpf_cnpj || "")}
        onClose={() => setSenhaDe(null)}
        onSalvo={() => void carregarContatos()}
      />

      <ConfirmDialog
        open={Boolean(inativando)}
        onOpenChange={(open) => { if (!open) setInativando(null); }}
        title="Inativar contato"
        description={`Inativar o contato ${inativando?.nome || "selecionado"}? Ele deixará de aparecer nas escolhas do cliente.`}
        confirmLabel={salvando ? "Inativando..." : "Inativar"}
        variant="destructive"
        onConfirm={() => void confirmarInativacao()}
        onCancel={() => setInativando(null)}
      />
    </section>
  );
}
