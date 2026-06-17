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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { db } from "@/lib/db";
import type { Cliente, Equipamento } from "@/types";
import {
  clienteSchema,
  type ClienteFormData,
  detectarTipoDocumento,
} from "@/lib/validations";
import { nomeExibicaoCliente } from "@/components/clientes/cliente-display-utils";
import { ClienteSelectorBusca } from "@/components/equipamentos/ClienteSelectorBusca";
import { ClienteSelectorClienteCard } from "@/components/equipamentos/ClienteSelectorClienteCard";
import { ClienteSelectorFormNovo } from "@/components/equipamentos/ClienteSelectorFormNovo";
import { useNotification } from "@/hooks/useNotification";

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

  const [termoBusca, setTermoBusca] = useState("");
  const [resultados, setResultados] = useState<Cliente[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [dropdownAberto, setDropdownAberto] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [equipamentosCliente, setEquipamentosCliente] = useState<Equipamento[]>([]);
  const [carregandoEquip, setCarregandoEquip] = useState(false);

  const [tipoPessoa, setTipoPessoa] = useState<"PF" | "PJ" | null>(null);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [salvandoNovo, setSalvandoNovo] = useState(false);
  const { warning, error: showError } = useNotification();

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
    }, 300);

    return () => clearTimeout(timeout);
  }, [termoBusca]);

  useEffect(() => {
    if (!clienteSelecionado?.id) {
      setEquipamentosCliente([]);
      return;
    }
    setCarregandoEquip(true);
    const nome = nomeExibicaoCliente(clienteSelecionado);
    db.listarEquipamentos(nome).then((todos) => {
      const doCliente = todos.filter(
        (eq) => eq.cliente_id === clienteSelecionado.id || eq.cliente_nome === nome || eq.cliente_nome === clienteSelecionado.nome
      );
      setEquipamentosCliente(doCliente);
    }).catch(() => setEquipamentosCliente([]))
      .finally(() => setCarregandoEquip(false));
  }, [clienteSelecionado]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownAberto(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const docValue = formNovoCliente.watch("documento");
  useEffect(() => {
    if (!docValue) { setTipoPessoa(null); return; }
    const tipo = detectarTipoDocumento(docValue);
    if (tipo === "CPF") { setTipoPessoa("PF"); formNovoCliente.setValue("tipo_pessoa", "PF"); }
    else if (tipo === "CNPJ") { setTipoPessoa("PJ"); formNovoCliente.setValue("tipo_pessoa", "PJ"); }
    else { setTipoPessoa(null); }
  }, [docValue, formNovoCliente]);

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

  function selecionarCliente(c: Cliente) {
    setClienteSelecionado(c);
    setModo("selecionado");
    setDropdownAberto(false);
    setTermoBusca("");
    onClienteSelecionado(c);
  }

  function removerCliente() {
    setClienteSelecionado(null);
    setModo("busca");
    setTermoBusca("");
    setEquipamentosCliente([]);
    onClienteRemovido();
  }

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
      } as Omit<Cliente, "id">;

      const novoCliente = await db.criarCliente(payload);
      setClienteSelecionado(novoCliente);
      setModo("selecionado");
      onClienteSelecionado(novoCliente);
    } catch (err: unknown) {
      const msg = err?.toString() || "";
      if (msg.includes("UNIQUE")) {
        warning("Clientes", "Já existe um cliente com este CPF/CNPJ. Use a busca para encontrá-lo.");
      } else {
        console.error("Erro ao criar cliente:", err);
        showError("Clientes", "Criar cliente", err || "Erro ao criar cliente.");
      }
    } finally {
      setSalvandoNovo(false);
    }
  }

  if (modo === "selecionado" && clienteSelecionado) {
    return (
      <ClienteSelectorClienteCard
        cliente={clienteSelecionado}
        equipamentosCliente={equipamentosCliente}
        carregandoEquip={carregandoEquip}
        readOnly={readOnly}
        onRemover={removerCliente}
      />
    );
  }

  if (modo === "novo") {
    return (
      <ClienteSelectorFormNovo
        form={formNovoCliente}
        tipoPessoa={tipoPessoa}
        buscarCep={buscarCep}
        buscandoCep={buscandoCep}
        salvandoNovo={salvandoNovo}
        onVoltarBusca={() => setModo("busca")}
        onSalvar={() => void formNovoCliente.handleSubmit(salvarNovoCliente)()}
      />
    );
  }

  return (
    <ClienteSelectorBusca
      dropdownRef={dropdownRef}
      termoBusca={termoBusca}
      setTermoBusca={setTermoBusca}
      buscando={buscando}
      dropdownAberto={dropdownAberto}
      setDropdownAberto={setDropdownAberto}
      resultados={resultados}
      onSelecionarCliente={selecionarCliente}
      onAbrirNovoCliente={abrirNovoCliente}
    />
  );
}
