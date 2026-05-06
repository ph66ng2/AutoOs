/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  lib/validations.ts — Validações, Schemas e Formatadores    ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  Contém toda a lógica de validação e formatação do sistema: ║
 * ║  - Validação matemática de CPF e CNPJ                       ║
 * ║  - Detecção automática PF/PJ pelo tamanho do documento      ║
 * ║  - Máscaras de formatação (CPF, CNPJ, telefone, CEP)        ║
 * ║  - Schemas Zod para validação de formulários                 ║
 * ║                                                              ║
 * ║  DEPENDE DE: zod                                             ║
 * ║                                                              ║
 * ║  USADO POR:                                                  ║
 * ║  - pages/Equipamentos.tsx (equipamentoSchema)                ║
 * ║  - pages/Clientes.tsx (clienteSchema + formatadores)        ║
 * ║  - components/ClienteSelector.tsx (clienteSchema + format.) ║
 * ║  - pages/Insumos.tsx (produtoSchema, movimentacaoSchema)    ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import { z } from "zod";

// ─── Validação CPF ──────────────────────────────────────
/**
 * Valida CPF usando algoritmo dos dígitos verificadores.
 * Remove caracteres não-numéricos, verifica tamanho e sequências repetidas.
 * Conecta-se a: clienteSchema (usado na validação do campo `documento`)
 */export function validarCPF(cpf: string): boolean {
  cpf = cpf.replace(/\D/g, "");
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let soma = 0;
  for (let i = 1; i <= 9; i++) {
    soma += parseInt(cpf.substring(i - 1, i)) * (11 - i);
  }
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf.substring(9, 10))) return false;

  soma = 0;
  for (let i = 1; i <= 10; i++) {
    soma += parseInt(cpf.substring(i - 1, i)) * (12 - i);
  }
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf.substring(10, 11))) return false;

  return true;
}

// ─── Validação CNPJ ─────────────────────────────────────
/**
 * Valida CNPJ usando algoritmo dos 2 dígitos verificadores.
 * Remove caracteres não-numéricos, verifica tamanho e sequências repetidas.
 * Conecta-se a: clienteSchema (usado na validação do campo `documento`)
 */export function validarCNPJ(cnpj: string): boolean {
  cnpj = cnpj.replace(/\D/g, "");
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  let tamanho = cnpj.length - 2;
  let numeros = cnpj.substring(0, tamanho);
  const digitos = cnpj.substring(tamanho);
  let soma = 0;
  let pos = tamanho - 7;

  for (let i = tamanho; i >= 1; i--) {
    soma += parseInt(numeros.charAt(tamanho - i)) * pos--;
    if (pos < 2) pos = 9;
  }

  let resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  if (resultado !== parseInt(digitos.charAt(0))) return false;

  tamanho = tamanho + 1;
  numeros = cnpj.substring(0, tamanho);
  soma = 0;
  pos = tamanho - 7;

  for (let i = tamanho; i >= 1; i--) {
    soma += parseInt(numeros.charAt(tamanho - i)) * pos--;
    if (pos < 2) pos = 9;
  }

  resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  return resultado === parseInt(digitos.charAt(1));
}

// ─── Detecção automática PF/PJ ─────────────────────────
/**
 * Detecta se o documento é CPF (11 dígitos) ou CNPJ (14 dígitos).
 * Conecta-se a: ClienteSelector.tsx e Clientes.tsx (detecção em tempo real)
 */export function detectarTipoDocumento(documento: string): "CPF" | "CNPJ" | null {
  const numeros = documento.replace(/\D/g, "");
  if (numeros.length === 11) return "CPF";
  if (numeros.length === 14) return "CNPJ";
  return null;
}

// ─── Máscaras de formatação ─────────────────────────────
/**
 * Formata CPF (000.000.000-00) ou CNPJ (00.000.000/0001-00) com máscara.
 * Detecta automaticamente pelo tamanho. Limita a 14 dígitos.
 * Conecta-se a: ClienteSelector.tsx, Clientes.tsx (nos inputs de documento)
 */export function formatarDocumento(valor: string): string {
  const numeros = valor.replace(/\D/g, "").substring(0, 14);

  if (numeros.length <= 11) {
    // CPF: 000.000.000-00
    return numeros
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  } else {
    // CNPJ: 00.000.000/0001-00
    return numeros
      .replace(/(\d{2})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1/$2")
      .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
  }
}

/**
 * Formata telefone: (00) 0000-0000 ou (00) 00000-0000 (celular).
 * Conecta-se a: ClienteSelector.tsx, Clientes.tsx, HistoricoComunicacoes
 */
export function formatarTelefone(valor: string): string {
  const numeros = valor.replace(/\D/g, "").substring(0, 11);
  if (numeros.length <= 10) {
    return numeros
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d{1,4})$/, "$1-$2");
  }
  return numeros
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d{1,4})$/, "$1-$2");
}

/** Formata CEP: 00000-000. Conecta-se a: ClienteSelector.tsx, Clientes.tsx */
export function formatarCEP(valor: string): string {
  const numeros = valor.replace(/\D/g, "").substring(0, 8);
  return numeros.replace(/(\d{5})(\d{1,3})$/, "$1-$2");
}

// ─── Schemas ────────────────────────────────────────────
/**
 * Schema Zod para formulário de equipamento (campos básicos).
 * O restante dos dados (cliente, datas, etc) é adicionado no onSubmit.
 * Conecta-se a: Equipamentos.tsx (useForm com zodResolver)
 */export const equipamentoSchema = z.object({
  serial_number: z
    .string()
    .min(3, "Número de série deve ter no mínimo 3 caracteres")
    .max(50, "Número de série muito longo"),
  patrimonio: z.string().max(80, "Patrimônio muito longo").optional().or(z.literal("")),
  marca: z.string().min(2, "Marca é obrigatória"),
  modelo: z.string().min(2, "Modelo é obrigatório"),
  tipo: z.string().min(1, "Selecione um tipo"),
  status: z.string().default("RECEBIDO"),
  defeito_relatado: z.string().min(3, "Defeito é obrigatório"),
   acessorios: z.array(z.string()).optional(),
   acessorios_outros: z.string().optional().or(z.literal("")),
   observacoes: z.string().max(1000).optional().or(z.literal("")),
});

export type EquipamentoFormData = z.infer<typeof equipamentoSchema>;

/**
 * Schema Zod para formulário de cliente (PF e PJ).
 * Usa superRefine para validar condicionalmente:
 * - PF (≤11 díg): nome obrigatório
 * - PJ (14 díg): razao_social obrigatória
 * Campo telefone é opcional.
 * Conecta-se a: Clientes.tsx, ClienteSelector.tsx (useForm com zodResolver)
 */
export const clienteSchema = z.object({
   // Documento (obrigatório)
   documento: z
     .string()
     .min(1, "CPF ou CNPJ é obrigatório")
     .refine(
       (val) => {
         const numeros = val.replace(/\D/g, "");
         return numeros.length === 11 || numeros.length === 14;
       },
       {
         message:
           "Complete o número: CPF deve ter 11 dígitos e CNPJ 14 dígitos (confira se nada ficou faltando).",
       }
     )
     .refine(
       (val) => {
         const numeros = val.replace(/\D/g, "");
         if (numeros.length === 11) return validarCPF(numeros);
         if (numeros.length === 14) return validarCNPJ(numeros);
         return false;
       },
       {
         message:
           "CPF ou CNPJ não confere nos dígitos verificadores. Verifique cada número ou use um documento oficialmente válido.",
       }
     ),
   tipo_pessoa: z.enum(["PF", "PJ"]).default("PF"),

   // PF
   nome: z.string().optional().or(z.literal("")),

   // PJ
   razao_social: z.string().optional().or(z.literal("")),
   nome_fantasia: z.string().optional().or(z.literal("")),
   inscricao_estadual: z.string().optional().or(z.literal("")),

   // Contato
   telefone: z.string().optional().or(z.literal("")),
   telefone_secundario: z.string().optional().or(z.literal("")),
   email: z
     .union([z.literal(""), z.string().email("Email inválido")]),

   // Endereço
   cep: z.string().optional().or(z.literal("")),
   endereco: z.string().optional().or(z.literal("")),
   numero: z.string().optional().or(z.literal("")),
   complemento: z.string().optional().or(z.literal("")),
   bairro: z.string().optional().or(z.literal("")),
   cidade: z.string().optional().or(z.literal("")),
uf: z.string().max(2).optional().or(z.literal("")),

    // Preferências
   observacoes: z.string().optional().or(z.literal("")),
 }).superRefine((data, ctx) => {
   const numeros = data.documento.replace(/\D/g, "");
   if (numeros.length === 11) {
     // PF: nome obrigatório
     if (!data.nome || data.nome.trim().length < 2) {
       ctx.addIssue({
         code: z.ZodIssueCode.custom,
         message: "Nome completo é obrigatório para Pessoa Física",
         path: ["nome"],
       });
     }
   } else if (numeros.length === 14) {
     // PJ: razao_social obrigatória
     if (!data.razao_social || data.razao_social.trim().length < 2) {
       ctx.addIssue({
         code: z.ZodIssueCode.custom,
         message: "Razão Social é obrigatória para Pessoa Jurídica",
         path: ["razao_social"],
       });
     }
   }

   const telDigitos = (data.telefone || "").replace(/\D/g, "");
   if (telDigitos.length < 10) {
     ctx.addIssue({
       code: z.ZodIssueCode.custom,
       message: "Telefone é obrigatório (DDD + número, no mínimo 10 dígitos)",
       path: ["telefone"],
     });
   }
 });

export type ClienteFormData = z.infer<typeof clienteSchema>;

/**
 * Schema Zod para formulário de produto (insumo de estoque).
 * Campos numéricos usam z.coerce para converter string → number.
 * Conecta-se a: Insumos.tsx (useForm com zodResolver)
 */
export const produtoSchema = z.object({
  codigo: z.string().min(1, "Código é obrigatório"),
  nome: z.string().min(2, "Nome é obrigatório"),
  descricao: z.string().optional().or(z.literal("")),
  categoria: z.string().min(1, "Selecione uma categoria"),
  quantidade_estoque: z.coerce.number().int().min(0).default(0),
  quantidade_minima: z.coerce.number().int().min(0).default(5),
  preco_custo: z.coerce.number().min(0).default(0),
  preco_venda: z.coerce.number().min(0).default(0),
  localizacao: z.string().optional().or(z.literal("")),
});

export type ProdutoFormData = z.infer<typeof produtoSchema>;

/**
 * Schema Zod para movimentação de estoque (entrada/saída).
 * Conecta-se a: Insumos.tsx (dialog de movimentação)
 */
export const movimentacaoSchema = z.object({
  tipo: z.enum(["ENTRADA", "SAIDA"]),
  quantidade: z.coerce.number().int().min(1, "Quantidade mínima é 1"),
  origem: z.string().min(1, "Informe a origem/motivo"),
  referencia: z.string().optional().or(z.literal("")),
});

export type MovimentacaoFormData = z.infer<typeof movimentacaoSchema>;
