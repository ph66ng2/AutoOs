import { useEffect, useRef, useState } from "react";
import { Plus, Search, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorAlert } from "@/components/ui/error-alert";
import { useNotification } from "@/hooks/useNotification";
import { db } from "@/lib/db";
import { clienteContatoSchema, formatarTelefone, type ClienteContatoFormData } from "@/lib/validations";
import type { Cliente, ClienteContato } from "@/types";

interface ContatoResponsavelSelectorProps {
  cliente: Cliente | null;
  empresaId?: number;
  value: ClienteContato | null;
  onChange: (contato: ClienteContato | null) => void;
  disabled?: boolean;
}

export function ContatoResponsavelSelector({
  cliente,
  empresaId,
  value,
  onChange,
  disabled = false,
}: ContatoResponsavelSelectorProps) {
  const [contatos, setContatos] = useState<ClienteContato[]>([]);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [novoOpen, setNovoOpen] = useState(false);
  const [novo, setNovo] = useState<ClienteContatoFormData>({ nome: "", email: "", telefone: "" });
  const [erroNovo, setErroNovo] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const clienteAnterior = useRef<number | undefined>(cliente?.id);
  const { error: showError } = useNotification();

  useEffect(() => {
    if (clienteAnterior.current !== cliente?.id) {
      clienteAnterior.current = cliente?.id;
      onChange(null);
    }
    setBusca("");
    if (!cliente?.id || !empresaId) {
      setContatos([]);
      setErro(null);
      return;
    }
    let ativo = true;
    setCarregando(true);
    setErro(null);
    db.listarClienteContatos(cliente.id, empresaId)
      .then((items) => { if (ativo) setContatos(items); })
      .catch((cause) => { if (ativo) { setContatos([]); setErro(String(cause)); } })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [cliente?.id, empresaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtrados = contatos.filter((contato) => {
    const termo = busca.trim().toLowerCase();
    return !termo || [contato.nome, contato.email, contato.telefone].some((valueToSearch) => valueToSearch?.toLowerCase().includes(termo));
  });
  const selecionado = value ? contatos.find((contato) => contato.id === value.id) || value : null;

  function atualizarNovo(campo: keyof ClienteContatoFormData, valor: string) {
    setNovo((estado) => ({ ...estado, [campo]: campo === "telefone" ? formatarTelefone(valor) : valor }));
    setErroNovo(null);
  }

  async function cadastrarRapido() {
    if (!cliente?.id || !empresaId) return;
    const resultado = clienteContatoSchema.safeParse(novo);
    if (!resultado.success) {
      setErroNovo(resultado.error.issues[0]?.message || "Revise os dados do contato.");
      return;
    }
    setSalvando(true);
    try {
      const contato = await db.criarClienteContato({
        empresa_id: empresaId,
        cliente_id: cliente.id,
        nome: resultado.data.nome.trim(),
        email: resultado.data.email.trim() || undefined,
        telefone: resultado.data.telefone.replace(/\D/g, "") || undefined,
      });
      setContatos((items) => [...items.filter((item) => item.id !== contato.id), contato].sort((a, b) => a.nome.localeCompare(b.nome)));
      onChange(contato);
      setNovoOpen(false);
      setNovo({ nome: "", email: "", telefone: "" });
    } catch (cause) {
      showError("Equipamentos", "Cadastrar contato", cause);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md border bg-muted/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <Label className="flex items-center gap-1"><UserRound className="h-3.5 w-3.5" /> Responsável pelo equipamento</Label>
          <p className="text-xs text-muted-foreground">Opcional. Escolha um contato ativo deste cliente.</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setNovoOpen(true)} disabled={disabled || !cliente?.id || !empresaId}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Novo contato
        </Button>
      </div>
      {!cliente ? (
        <p className="text-xs text-muted-foreground">Selecione o cliente para pesquisar contatos.</p>
      ) : (
        <>
          {selecionado ? (
            <div className="flex items-start justify-between gap-3 rounded-md border bg-background p-3">
              <div className="min-w-0 text-sm">
                <p className="font-medium">{selecionado.nome}</p>
                <p className="text-xs text-muted-foreground">{selecionado.email || "Sem e-mail"} · {selecionado.telefone ? formatarTelefone(selecionado.telefone) : "Sem telefone"}</p>
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="Remover responsável" onClick={() => onChange(null)} disabled={disabled}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  aria-label="Pesquisar contatos ativos"
                  className="pl-8"
                  value={busca}
                  onChange={(event) => setBusca(event.target.value)}
                  placeholder="Pesquisar contato por nome, e-mail ou telefone"
                  disabled={disabled || !empresaId}
                />
              </div>
              <Button type="button" variant="ghost" className="w-full justify-start text-sm" onClick={() => onChange(null)} disabled={disabled}>
                Sem responsável específico
              </Button>
              {carregando && <p className="text-xs text-muted-foreground">Carregando contatos ativos...</p>}
              {erro && <ErrorAlert variant="error" context="Equipamentos" message={erro} />}
              {!carregando && filtrados.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-md border bg-background">
                  {filtrados.map((contato) => (
                    <button key={contato.id} type="button" className="w-full border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent" onClick={() => onChange(contato)}>
                      <span className="font-medium">{contato.nome}</span>
                      <span className="block text-xs text-muted-foreground">{contato.email || "Sem e-mail"} · {contato.telefone ? formatarTelefone(contato.telefone) : "Sem telefone"}</span>
                    </button>
                  ))}
                </div>
              )}
              {!carregando && filtrados.length === 0 && <p className="text-xs text-muted-foreground">Nenhum contato ativo encontrado.</p>}
            </>
          )}
        </>
      )}

      <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo contato do cliente</DialogTitle>
            <DialogDescription>O contato será cadastrado como ativo e selecionado para este equipamento.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Cadastre rapidamente um contato para {cliente ? cliente.nome || cliente.nome_fantasia || cliente.razao_social : "o cliente"}.</p>
            <div className="space-y-2"><Label htmlFor="responsavel-novo-nome">Nome *</Label><Input id="responsavel-novo-nome" value={novo.nome} onChange={(event) => atualizarNovo("nome", event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="responsavel-novo-email">E-mail</Label><Input id="responsavel-novo-email" type="email" value={novo.email} onChange={(event) => atualizarNovo("email", event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="responsavel-novo-telefone">Telefone</Label><Input id="responsavel-novo-telefone" value={novo.telefone} onChange={(event) => atualizarNovo("telefone", event.target.value)} /></div>
            {erroNovo && <p className="text-xs text-red-600" role="alert">{erroNovo}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNovoOpen(false)}>Cancelar</Button>
            <Button type="button" disabled={salvando} onClick={() => void cadastrarRapido()}>{salvando ? "Salvando..." : "Cadastrar e selecionar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
