/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  ClienteSelector.tsx — Seletor/Cadastro Inline de Cliente   ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  Componente standalone para buscar, selecionar ou cadastrar ║
 * ║  um cliente diretamente dentro do formulário de equipamento.║
 * ║                                                              ║
 * ║  MODOS DE OPERAÇÃO (type Modo):                              ║
 * ║  - "busca": campo de busca com dropdown de resultados       ║
 * ║  - "selecionado": card com dados do cliente vinculado       ║
 * ║  - "novo": formulário inline para cadastrar novo cliente    ║
 * ║                                                              ║
 * ║  DEPENDE DE:                                                 ║
 * ║  - lib/db.ts (listarClientes, criarCliente, buscarCliente,  ║
 * ║    listarEquipamentos)                                       ║
 * ║  - lib/validations.ts (clienteSchema, formatadores)         ║
 * ║  - types/index.ts (Cliente, Equipamento)                    ║
 * ║  - react-hook-form + zod (formulário do novo cliente)       ║
 * ║                                                              ║
 * ║  USADO POR:                                                  ║
 * ║  - pages/Equipamentos.tsx (dentro do dialog de criar/editar)║
 * ╚══════════════════════════════════════════════════════════════╝
 */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  User,
  Building2,
  Phone,
  Mail,
  MapPin,
  Printer,
  Plus,
  X,
  Check,
  Loader2,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClienteFormularioCampos } from "@/components/clientes/ClienteFormularioCampos";
import { db } from "@/lib/db";
import type { Cliente, Equipamento } from "@/types";
import {
  clienteSchema,
  type ClienteFormData,
  formatarDocumento,
  formatarTelefone,
  detectarTipoDocumento,
} from "@/lib/validations";

/** Props do componente ClienteSelector */
interface ClienteSelectorProps {
  /** Cliente já selecionado (para edição) */
  clienteInicial?: Cliente | null;
  /** Cliente ID inicial (para carregar do DB) */
  clienteIdInicial?: number | null;
  /** Callback quando um cliente é selecionado ou criado */
  onClienteSelecionado: (cliente: Cliente) => void;
  /** Callback quando o cliente é removido */
  onClienteRemovido: () => void;
  /** Modo somente leitura */
  readOnly?: boolean;
}

type Modo = "busca" | "selecionado" | "novo";

/**
 * Componente de seleção/cadastro de cliente com 3 modos.
 * Gerencia busca com debounce, formulário PF/PJ, e historico de equipamentos.
 */
export function ClienteSelector({
  clienteInicial,
  clienteIdInicial,
  onClienteSelecionado,
  onClienteRemovido,
  readOnly = false,
}: ClienteSelectorProps) {
  const [modo, setModo] = useState<Modo>(clienteInicial || clienteIdInicial ? "selecionado" : "busca");
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(clienteInicial || null);

  // Busca
  const [termoBusca, setTermoBusca] = useState("");
  const [resultados, setResultados] = useState<Cliente[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [dropdownAberto, setDropdownAberto] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Resumo de equipamentos do cliente selecionado
  const [equipamentosCliente, setEquipamentosCliente] = useState<Equipamento[]>([]);
  const [carregandoEquip, setCarregandoEquip] = useState(false);

  // Form novo cliente
  const [tipoPessoa, setTipoPessoa] = useState<"PF" | "PJ" | null>(null);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [salvandoNovo, setSalvandoNovo] = useState(false);

  const formNovoCliente = useForm<ClienteFormData>({
    resolver: zodResolver(clienteSchema),
    defaultValues: {
      documento: "", tipo_pessoa: "PF", nome: "",
      razao_social: "", nome_fantasia: "", inscricao_estadual: "",
      telefone: "", telefone_secundario: "",
      email: "", cep: "", endereco: "", numero: "", complemento: "",
      bairro: "", cidade: "", uf: "", observacoes: "",
    },
  });

  // Carregar cliente inicial por ID
  useEffect(() => {
    if (clienteIdInicial && !clienteInicial) {
      db.buscarCliente(clienteIdInicial).then((c) => {
        if (c) {
          setClienteSelecionado(c);
          setModo("selecionado");
          onClienteSelecionado(c);
        }
      }).catch(() => {});
    }
  }, [clienteIdInicial]); // eslint-disable-line react-hooks/exhaustive-deps

  // Buscar clientes ao digitar
  useEffect(() => {
    if (!termoBusca || termoBusca.length < 2) {
      setResultados([]);
      setDropdownAberto(false);
      return;
    }

    const timeout = setTimeout(async () => {
      setBuscando(true);
      try {
        const data = await db.listarClientes(termoBusca);
        setResultados(data);
        setDropdownAberto(data.length > 0);
      } catch {
        setResultados([]);
      } finally {
        setBuscando(false);
      }
    }, 300); // debounce 300ms

    return () => clearTimeout(timeout);
  }, [termoBusca]);

  // Carregar equipamentos do cliente selecionado
  useEffect(() => {
    if (!clienteSelecionado?.id) {
      setEquipamentosCliente([]);
      return;
    }
    setCarregandoEquip(true);
    const nome = nomeExibicao(clienteSelecionado);
    db.listarEquipamentos(nome).then((todos) => {
      const doCliente = todos.filter(
        (eq) => eq.cliente_id === clienteSelecionado.id || eq.cliente_nome === nome || eq.cliente_nome === clienteSelecionado.nome
      );
      setEquipamentosCliente(doCliente);
    }).catch(() => setEquipamentosCliente([]))
      .finally(() => setCarregandoEquip(false));
  }, [clienteSelecionado]);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownAberto(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Detectar tipo documento no form novo cliente
  const docValue = formNovoCliente.watch("documento");
  useEffect(() => {
    if (!docValue) { setTipoPessoa(null); return; }
    const tipo = detectarTipoDocumento(docValue);
    if (tipo === "CPF") { setTipoPessoa("PF"); formNovoCliente.setValue("tipo_pessoa", "PF"); }
    else if (tipo === "CNPJ") { setTipoPessoa("PJ"); formNovoCliente.setValue("tipo_pessoa", "PJ"); }
    else { setTipoPessoa(null); }
  }, [docValue, formNovoCliente]);

  // Buscar CEP
  const buscarCep = useCallback(async (cep: string) => {
    const numeros = cep.replace(/\D/g, "");
    if (numeros.length !== 8) return;
    setBuscandoCep(true);
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${numeros}/json/`);
      const data = await resp.json();
      if (!data.erro) {
        formNovoCliente.setValue("endereco", data.logradouro || "");
        formNovoCliente.setValue("bairro", data.bairro || "");
        formNovoCliente.setValue("cidade", data.localidade || "");
        formNovoCliente.setValue("uf", data.uf || "");
        formNovoCliente.setValue("complemento", data.complemento || "");
      }
    } catch { /* silenciar */ }
    finally { setBuscandoCep(false); }
  }, [formNovoCliente]);

  // ─── Ações ────────────────────────────────────────────

  /** Vincula cliente ao equipamento. Notifica o parent via onClienteSelecionado */
  function selecionarCliente(c: Cliente) {
    setClienteSelecionado(c);
    setModo("selecionado");
    setDropdownAberto(false);
    setTermoBusca("");
    onClienteSelecionado(c);
  }

  /** Remove vínculo do cliente. Reseta para modo busca. Notifica parent via onClienteRemovido */
  function removerCliente() {
    setClienteSelecionado(null);
    setModo("busca");
    setTermoBusca("");
    setEquipamentosCliente([]);
    onClienteRemovido();
  }

  /** Abre formulário inline para cadastrar novo cliente. Reseta o form */
  function abrirNovoCliente() {
    setDropdownAberto(false);
    setTipoPessoa(null);
    formNovoCliente.reset({
      documento: "", tipo_pessoa: "PF", nome: "",
      razao_social: "", nome_fantasia: "", inscricao_estadual: "",
      telefone: "", telefone_secundario: "",
      email: "", cep: "", endereco: "", numero: "", complemento: "",
      bairro: "", cidade: "", uf: "", observacoes: "",
    });
    setModo("novo");
  }

  /**
   * Salva novo cliente no banco via db.criarCliente e auto-vincula ao equipamento.
   * Trata erro de UNIQUE constraint (CPF/CNPJ duplicado).
   * Conecta-se a: db.criarCliente → Rust criar_cliente
   */
  async function salvarNovoCliente(data: ClienteFormData) {
    setSalvandoNovo(true);
    try {
      const docNumeros = data.documento.replace(/\D/g, "");
      const isPJ = docNumeros.length === 14;
      const payload: Omit<Cliente, "id"> = {
        tipo_pessoa: isPJ ? "PJ" : "PF",
        documento: docNumeros,
        cpf_cnpj: docNumeros,
        nome: isPJ ? (data.nome_fantasia || data.razao_social || "") : (data.nome || ""),
        razao_social: isPJ ? (data.razao_social || null) : null,
        nome_fantasia: isPJ ? (data.nome_fantasia || null) : null,
        inscricao_estadual: isPJ ? (data.inscricao_estadual || null) : null,
        telefone: data.telefone?.replace(/\D/g, "") || "",
        telefone_secundario: data.telefone_secundario?.replace(/\D/g, "") || null,
        email: data.email || null,
        cep: data.cep?.replace(/\D/g, "") || null,
        endereco: data.endereco || null,
        numero: data.numero || null,
        complemento: data.complemento || null,
        bairro: data.bairro || null,
        cidade: data.cidade || null,
        uf: data.uf || null,
        receber_email: true,
        receber_whatsapp: true,
        observacoes: data.observacoes || null,
        ativo: true,
      } as any;

      const novoCliente = await db.criarCliente(payload);
      setClienteSelecionado(novoCliente);
      setModo("selecionado");
      onClienteSelecionado(novoCliente);
    } catch (err: any) {
      const msg = err?.toString() || "";
      if (msg.includes("UNIQUE")) {
        alert("Já existe um cliente com este CPF/CNPJ. Use a busca para encontrá-lo.");
      } else {
        console.error("Erro ao criar cliente:", err);
        alert("Erro ao criar cliente: " + msg);
      }
    } finally {
      setSalvandoNovo(false);
    }
  }

  // ─── Renders ──────────────────────────────────────────

  /** Renderiza card de resumo do cliente vinculado com badge PF/PJ e lista de equipamentos anteriores */
  function renderClienteSelecionado() {
    const c = clienteSelecionado!;
    return (
      <Card className="border-green-200 bg-green-50/30">
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              Cliente Vinculado
              {c.tipo_pessoa === "PJ" ? (
                <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-xs">
                  <Building2 className="h-3 w-3 mr-1" />PJ
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                  <User className="h-3 w-3 mr-1" />PF
                </Badge>
              )}
            </CardTitle>
            {!readOnly && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={removerCliente} title="Remover vínculo">
                <X className="h-4 w-4 text-muted-foreground" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {/* Dados do cliente */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Nome:</span>
              <p className="font-medium">{nomeExibicao(c)}</p>
              {c.tipo_pessoa === "PJ" && c.razao_social && (
                <p className="text-xs text-muted-foreground">{c.razao_social}</p>
              )}
            </div>
            <div>
              <span className="text-muted-foreground">Documento:</span>
              <p className="font-medium font-mono text-xs">
                {formatarDocumento(c.documento || c.cpf_cnpj || "")}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-1">
              <Phone className="h-3 w-3 text-muted-foreground" />
              <span>{c.telefone ? formatarTelefone(c.telefone) : "—"}</span>
            </div>
            {c.email && (
              <div className="flex items-center gap-1">
                <Mail className="h-3 w-3 text-muted-foreground" />
                <span className="truncate">{c.email}</span>
              </div>
            )}
          </div>
          {(c.cidade || c.uf) && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-3 w-3" />
              <span>{c.cidade && c.uf ? `${c.cidade}/${c.uf}` : c.cidade || c.uf}</span>
            </div>
          )}

          {/* Resumo de equipamentos */}
          {carregandoEquip ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Carregando equipamentos...
            </div>
          ) : equipamentosCliente.length > 0 ? (
            <div className="border-t pt-2 mt-2">
              <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                <Printer className="h-3 w-3" />
                {equipamentosCliente.length} equipamento(s) anterior(es)
              </p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {equipamentosCliente.map((eq) => (
                  <div key={eq.id} className="flex items-center justify-between text-xs bg-white/50 p-1.5 rounded border">
                    <span className="font-medium">{eq.marca} {eq.modelo}</span>
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                      (eq.status === "ENTREGUE" || eq.status === "PRONTO") ? "bg-green-100 text-green-700" :
                      eq.status === "EM_MANUTENCAO" ? "bg-indigo-100 text-indigo-700" :
                      "bg-gray-100 text-gray-700"
                    }`}>
                      {eq.status.replace(/_/g, " ")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  /** Renderiza campo de busca com dropdown de resultados e botão "Cadastrar Novo Cliente" */
  function renderBusca() {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4" />
          <h3 className="font-semibold text-sm">Dados do Cliente</h3>
        </div>
        <div className="relative" ref={dropdownRef}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={termoBusca}
              onChange={(e) => setTermoBusca(e.target.value)}
              placeholder="Buscar cliente por nome, CPF/CNPJ, telefone ou email..."
              className="pl-9 pr-10"
              onFocus={() => resultados.length > 0 && setDropdownAberto(true)}
            />
            {buscando && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          {/* Dropdown de resultados */}
          {dropdownAberto && resultados.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-y-auto">
              {resultados.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="w-full px-3 py-2 text-left hover:bg-accent flex items-center justify-between gap-2 border-b last:border-b-0"
                  onClick={() => selecionarCliente(c)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {c.tipo_pessoa === "PJ" ? (
                      <Building2 className="h-4 w-4 text-purple-600 shrink-0" />
                    ) : (
                      <User className="h-4 w-4 text-blue-600 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{nomeExibicao(c)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatarDocumento(c.documento || c.cpf_cnpj || "")}
                        {c.telefone ? ` • ${formatarTelefone(c.telefone)}` : ""}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {c.tipo_pessoa === "PJ" ? "PJ" : "PF"}
                  </Badge>
                </button>
              ))}
            </div>
          )}

          {/* Sem resultados */}
          {dropdownAberto && resultados.length === 0 && termoBusca.length >= 2 && !buscando && (
            <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg p-3 text-center text-sm text-muted-foreground">
              Nenhum cliente encontrado
            </div>
          )}
        </div>

        {/* Botão de cadastrar novo */}
        <Button type="button" variant="outline" size="sm" className="w-full gap-2" onClick={abrirNovoCliente}>
          <Plus className="h-4 w-4" /> Cadastrar Novo Cliente
        </Button>
      </div>
    );
  }

  /** Renderiza formulário inline de novo cliente com detecção automática PF/PJ pelo documento */
  function renderFormNovoCliente() {
    return (
      <div className="flex max-h-[min(560px,72vh)] min-h-0 flex-col gap-4 rounded-lg border bg-accent/20 p-4">
        <div className="flex shrink-0 items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Plus className="h-4 w-4" /> Novo Cliente
          </h3>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setModo("busca")}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <ClienteFormularioCampos
            form={formNovoCliente}
            tipoPessoa={tipoPessoa}
            buscarCep={buscarCep}
            buscandoCep={buscandoCep}
          />
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t pt-3">
          <Button type="button" variant="outline" size="sm" onClick={() => setModo("busca")}>
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={salvandoNovo}
            onClick={formNovoCliente.handleSubmit(salvarNovoCliente)}
          >
            {salvandoNovo ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Salvando...</>
            ) : (
              <><Check className="h-4 w-4 mr-1" />Cadastrar e Vincular</>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // ─── Render principal ─────────────────────────────────

  if (modo === "selecionado" && clienteSelecionado) {
    return renderClienteSelecionado();
  }

  if (modo === "novo") {
    return renderFormNovoCliente();
  }

  return renderBusca();
}

// ─── Helpers ────────────────────────────────────────────

/** Retorna o nome de exibição: PJ usa nome_fantasia/razao_social, PF usa nome */
function nomeExibicao(c: Cliente): string {
  if (c.tipo_pessoa === "PJ") {
    return c.nome_fantasia || c.razao_social || c.nome || "—";
  }
  return c.nome || "—";
}
