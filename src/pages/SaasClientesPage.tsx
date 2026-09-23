import { useCallback, useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Edit, Plus, RefreshCw, Search, Trash2, Users } from "lucide-react";
import { useForm } from "react-hook-form";
import { ClienteFormularioCampos } from "@/components/clientes/ClienteFormularioCampos";
import { documentoExibicaoCliente, nomeExibicaoCliente } from "@/components/clientes/cliente-display-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useClientes } from "@/hooks/useClientes";
import { clienteSchema, detectarTipoDocumento, formatarCEP, formatarDocumento, formatarTelefone, type ClienteFormData } from "@/lib/validations";
import type { Cliente } from "@/types";

const EMPTY_FORM: ClienteFormData = {
  documento: "", tipo_pessoa: "PF", nome: "", razao_social: "", nome_fantasia: "",
  inscricao_estadual: "", telefone: "", telefone_secundario: "", email: "", cep: "",
  endereco: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "", observacoes: "",
};

const FORM_FIELD_LABELS: Partial<Record<keyof ClienteFormData, string>> = {
  documento: "CPF ou CNPJ",
  nome: "Nome completo",
  razao_social: "Razão Social",
  email: "E-mail",
  uf: "UF",
};

/** Clientes SaaS: usa exclusivamente o repository remoto selecionado por useClientes. */
export default function SaasClientesPage() {
  const [busca, setBusca] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [deletando, setDeletando] = useState<Cliente | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [tipoPessoa, setTipoPessoa] = useState<"PF" | "PJ" | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const { clientes, loading, error, criar, atualizar, deletar, recarregar } = useClientes({ busca: busca || undefined });
  const form = useForm<ClienteFormData>({ resolver: zodResolver(clienteSchema), defaultValues: EMPTY_FORM });
  const documento = form.watch("documento");
  const validationIssues = Object.entries(form.formState.errors).flatMap(([field, issue]) =>
    issue?.message ? [`${FORM_FIELD_LABELS[field as keyof ClienteFormData] ?? field}: ${issue.message}`] : [],
  );
  const validationMessage = form.formState.submitCount > 0 && validationIssues.length > 0
    ? `Revise os campos antes de salvar: ${validationIssues.join("; ")}`
    : null;

  useEffect(() => {
    const detected = detectarTipoDocumento(documento || "");
    const type = detected === "CNPJ" ? "PJ" : detected === "CPF" ? "PF" : null;
    setTipoPessoa(type);
    if (type) form.setValue("tipo_pessoa", type);
  }, [documento, form]);

  const buscarCep = useCallback(async (cep: string) => {
    const numeros = cep.replace(/\D/g, "");
    if (numeros.length !== 8) return;
    setBuscandoCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${numeros}/json/`);
      const data = await response.json();
      if (!data.erro) {
        form.setValue("endereco", data.logradouro || "");
        form.setValue("bairro", data.bairro || "");
        form.setValue("cidade", data.localidade || "");
        form.setValue("uf", data.uf || "");
        form.setValue("complemento", data.complemento || "");
      }
    } catch {
      // O endereço continua editável quando o serviço público estiver indisponível.
    } finally {
      setBuscandoCep(false);
    }
  }, [form]);

  function abrirNovo() {
    setEditando(null);
    setTipoPessoa(null);
    setOperationError(null);
    form.reset(EMPTY_FORM);
    setDialogOpen(true);
  }

  function abrirEditar(cliente: Cliente) {
    const doc = cliente.documento || cliente.cpf_cnpj || "";
    const isPJ = cliente.tipo_pessoa === "PJ" || doc.replace(/\D/g, "").length === 14;
    setEditando(cliente);
    setTipoPessoa(isPJ ? "PJ" : "PF");
    setOperationError(null);
    form.reset({
      documento: formatarDocumento(doc), tipo_pessoa: isPJ ? "PJ" : "PF", nome: cliente.nome || "",
      razao_social: cliente.razao_social || "", nome_fantasia: cliente.nome_fantasia || "",
      inscricao_estadual: cliente.inscricao_estadual || "", telefone: formatarTelefone(cliente.telefone || ""),
      telefone_secundario: formatarTelefone(cliente.telefone_secundario || ""), email: cliente.email || "",
      cep: formatarCEP(cliente.cep || ""), endereco: cliente.endereco || "", numero: cliente.numero || "",
      complemento: cliente.complemento || "", bairro: cliente.bairro || "", cidade: cliente.cidade || "",
      uf: cliente.uf || "", observacoes: cliente.observacoes || "",
    });
    setDialogOpen(true);
  }

  async function salvar(data: ClienteFormData) {
    setSalvando(true);
    setOperationError(null);
    const documentoLimpo = data.documento.replace(/\D/g, "");
    const isPJ = documentoLimpo.length === 14;
    const payload: Omit<Cliente, "id"> = {
      tipo_pessoa: isPJ ? "PJ" : "PF", documento: documentoLimpo, cpf_cnpj: documentoLimpo,
      nome: isPJ ? (data.nome_fantasia || data.razao_social || "") : data.nome || "",
      razao_social: isPJ ? data.razao_social || null : null, nome_fantasia: isPJ ? data.nome_fantasia || null : null,
      inscricao_estadual: isPJ ? data.inscricao_estadual || null : null, telefone: data.telefone?.replace(/\D/g, "") || "",
      telefone_secundario: data.telefone_secundario?.replace(/\D/g, "") || null, email: data.email || null,
      cep: data.cep?.replace(/\D/g, "") || null, endereco: data.endereco || null, numero: data.numero || null,
      complemento: data.complemento || null, bairro: data.bairro || null, cidade: data.cidade || null, uf: data.uf || null,
      receber_email: true, receber_whatsapp: true, observacoes: data.observacoes || null, ativo: true,
      atualizado_em: editando?.atualizado_em,
    } as Omit<Cliente, "id">;
    try {
      const result = editando ? await atualizar(editando.id!, payload) : await criar(payload);
      if (!result.sucesso) throw new Error(result.erro || "Não foi possível salvar o cliente.");
      setDialogOpen(false);
    } catch (cause) {
      setOperationError(cause instanceof Error ? cause.message : "Não foi possível salvar o cliente.");
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarExclusao() {
    if (!deletando?.id) return;
    setSalvando(true);
    setOperationError(null);
    try {
      const result = await deletar(deletando.id);
      if (!result.sucesso) throw new Error(result.erro || "Não foi possível excluir o cliente.");
      setDeleteOpen(false);
      setDeletando(null);
    } catch (cause) {
      setOperationError(cause instanceof Error ? cause.message : "Não foi possível excluir o cliente.");
    } finally {
      setSalvando(false);
    }
  }

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div><h1 className="text-3xl font-bold tracking-tight">Clientes</h1><p className="text-muted-foreground">Cadastros da sua empresa no plano Online.</p></div>
      <Button onClick={abrirNovo}><Plus className="mr-2 h-4 w-4" />Novo cliente</Button>
    </div>
    {(error || (!dialogOpen && operationError)) && <ErrorAlert variant="error" context="Clientes" action="Operação não concluída" message={operationError || error || ""} />}
    <Card><CardContent className="pt-6"><div className="flex gap-3"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar por nome, documento, telefone ou e-mail" /></div><Button aria-label="Atualizar clientes" variant="outline" size="icon" onClick={() => void recarregar()}><RefreshCw className="h-4 w-4" /></Button></div></CardContent></Card>
    <Card><CardContent className="pt-6">{loading ? <div className="py-12 text-center text-muted-foreground">Carregando clientes…</div> : clientes.length === 0 ? <div className="py-12 text-center text-muted-foreground"><Users className="mx-auto mb-3 h-12 w-12 opacity-30" /><p>Nenhum cliente encontrado.</p></div> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Documento</TableHead><TableHead>Contato</TableHead><TableHead className="w-24 text-right">Ações</TableHead></TableRow></TableHeader><TableBody>{clientes.map((cliente) => <TableRow key={cliente.id}><TableCell><p className="font-medium">{nomeExibicaoCliente(cliente)}</p>{cliente.razao_social && <p className="text-xs text-muted-foreground">{cliente.razao_social}</p>}</TableCell><TableCell>{documentoExibicaoCliente(cliente)}</TableCell><TableCell><p>{formatarTelefone(cliente.telefone || "")}</p><p className="text-xs text-muted-foreground">{cliente.email || "—"}</p></TableCell><TableCell><div className="flex justify-end gap-1"><Button aria-label={`Editar ${nomeExibicaoCliente(cliente)}`} variant="ghost" size="icon" onClick={() => abrirEditar(cliente)}><Edit className="h-4 w-4" /></Button><Button aria-label={`Excluir ${nomeExibicaoCliente(cliente)}`} variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => { setDeletando(cliente); setDeleteOpen(true); }}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>)}</TableBody></Table></div>}</CardContent></Card>
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editando ? "Editar cliente" : "Novo cliente"}</DialogTitle>
          <DialogDescription>Preencha os campos obrigatórios e confira os dados antes de salvar.</DialogDescription>
        </DialogHeader>
        <form className="space-y-5" onSubmit={form.handleSubmit(salvar, () => setOperationError(null))}>
          <ClienteFormularioCampos form={form} tipoPessoa={tipoPessoa} buscarCep={buscarCep} buscandoCep={buscandoCep} />
          {(validationMessage || operationError) && (
            <div role="alert">
              <ErrorAlert
                variant="error"
                context="Clientes"
                action={validationMessage ? "Revise o formulário" : "Falha ao salvar online"}
                message={validationMessage || operationError || ""}
              />
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
            <Button type="submit" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Excluir cliente</DialogTitle></DialogHeader><p>Excluir <strong>{deletando ? nomeExibicaoCliente(deletando) : "este cliente"}</strong>? Esta ação não pode ser desfeita.</p><DialogFooter><DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose><Button variant="destructive" disabled={salvando} onClick={() => void confirmarExclusao()}>{salvando ? "Excluindo…" : "Excluir"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
