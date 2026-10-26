const MENSAGENS: Array<{ restricoes: string[]; texto: string }> = [
  {
    restricoes: [
      "ux_clientes_documento_ativo",
      "ux_clientes_cpf_cnpj_ativo",
      "clientes_documento_key",
      "clientes_cpf_cnpj_key",
    ],
    texto: "Esse cliente já está cadastrado. Procure o CPF ou CNPJ na lista de clientes em vez de criar outro.",
  },
  {
    restricoes: [
      "ux_produtos_empresa_codigo_ativo",
      "ux_produtos_codigo_ativo",
      "ux_produtos_codigo_ativo_sem_empresa",
      "produtos_codigo_key",
    ],
    texto: "Esse código de insumo já está cadastrado. Procure o código na lista ou escolha outro.",
  },
  {
    restricoes: ["ux_servicos_catalogo_nome_ativo"],
    texto: "Já existe um serviço com esse nome. Procure na lista ou escolha outro nome.",
  },
  {
    restricoes: ["ux_gastos_fixos_nome_ativo", "gastos_fixos_nome_key"],
    texto: "Já existe um gasto com esse nome. Procure na lista ou escolha outro nome.",
  },
  {
    restricoes: ["security_profiles_nome_key", "ux_security_profiles_nome_normalizado"],
    texto: "Já existe um perfil com este nome. Escolha outro nome.",
  },
  {
    restricoes: ["ux_equipamentos_patrimonio_when_present"],
    texto: "Esse patrimônio já está em outro equipamento. Confira o número ou deixe o campo em branco.",
  },
  {
    restricoes: ["empresas_email_key"],
    texto: "Esse e-mail já está cadastrado. Use outro e-mail ou entre com a conta que já existe.",
  },
];

const MENSAGEM_CHAVE_PRIMARIA = "Esse cadastro já existe. Não dá para gravar o mesmo registro duas vezes.";
const MENSAGEM_GENERICA = "Não foi possível salvar porque esse cadastro já existe. Confira se o documento, o código ou o nome já está na lista e altere o que estiver repetido.";

function textoDoErro(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  return "";
}

// Primeira linha da resposta do backend: código técnico + referência do log (`#XXXXXXXX`).
// A referência é opcional para aceitar respostas de versões anteriores.
const REFERENCIA = "(?:#([A-Z0-9]{4,16}))?";
const CODIGO_DUPLICADO = new RegExp(`^AUTOOS:23505(?::([A-Za-z_][A-Za-z0-9_]*))?${REFERENCIA}(?:\\n([\\s\\S]*))?$`);
const CODIGO_BANCO = new RegExp(`^AUTOOS:DB(?::([A-Z0-9_]{2,20}))?${REFERENCIA}(?:\\n([\\s\\S]*))?$`);
const CODIGO_OPERACIONAL = new RegExp(`^AUTOOS:OP${REFERENCIA}(?:\\n([\\s\\S]*))?$`);

export const MENSAGEM_ERRO_GENERICO = "Não foi possível concluir esta ação. O detalhe técnico foi registrado no log do aplicativo.";

function lerDuplicado(value: unknown): { restricao: string; embutida: string } | null {
  const match = CODIGO_DUPLICADO.exec(textoDoErro(value).trim());
  if (!match) return null;
  return { restricao: match[1] ?? "", embutida: (match[3] ?? "").trim() };
}

/** Só o código AUTOOS:23505 que o backend monta a partir do SQLSTATE. Texto solto não conta. */
export function erroDeCadastroDuplicado(value: unknown): boolean {
  return lerDuplicado(value) !== null;
}

/** Traduz o código estruturado de duplicidade. Mantém os outros erros. */
export function mensagemCadastroDuplicado(value: unknown): string | null {
  const lido = lerDuplicado(value);
  if (!lido) return null;

  const especifica = MENSAGENS.find((item) => item.restricoes.includes(lido.restricao));
  if (especifica) return especifica.texto;
  if (lido.restricao.endsWith("_pkey")) return MENSAGEM_CHAVE_PRIMARIA;
  if (lido.embutida) return lido.embutida;
  return MENSAGEM_GENERICA;
}

/** Frase do código AUTOOS:DB. Número parecido com SQLSTATE no texto não entra aqui. */
export function mensagemDeBanco(value: unknown): string | null {
  const texto = textoDoErro(value).trim();
  const match = CODIGO_BANCO.exec(texto) ?? CODIGO_OPERACIONAL.exec(texto);
  if (!match) return null;
  return (match[match.length - 1] ?? "").trim() || MENSAGEM_ERRO_GENERICO;
}

/**
 * Frase para o operador quando o backend mandou código estruturado.
 * Sem código, devolve null para a mensagem original seguir inteira.
 */
export function mensagemVisivelAoOperador(value: unknown): string | null {
  return mensagemCadastroDuplicado(value) ?? mensagemDeBanco(value);
}

/** SQLSTATE por classe (dois primeiros caracteres), em termos que o suporte entende. */
const CLASSES_SQLSTATE: Record<string, string> = {
  "08": "conexão com o banco",
  "22": "dado inválido para o tipo da coluna",
  "23": "regra de integridade (chave, obrigatório, referência ou CHECK)",
  "25": "estado de transação inválido",
  "28": "autenticação no banco",
  "40": "transação revertida (conflito ou deadlock)",
  "42": "SQL inválido ou objeto inexistente (tabela, coluna, função)",
  "53": "recursos do servidor esgotados",
  "54": "limite do programa excedido",
  "55": "objeto em uso ou estado inválido",
  "57": "operação cancelada ou servidor indisponível",
  "58": "erro de sistema no servidor",
  P0: "erro levantado por função do banco (PL/pgSQL)",
  XX: "erro interno do Postgres",
};

const SQLSTATE_CONHECIDOS: Record<string, string> = {
  "23502": "campo obrigatório sem valor (NOT NULL)",
  "23503": "referência a registro inexistente (chave estrangeira)",
  "23505": "registro duplicado (chave única)",
  "23514": "valor recusado por regra CHECK",
  "40001": "falha de serialização",
  "40P01": "deadlock detectado",
  "42501": "sem permissão no banco",
  "42703": "coluna inexistente",
  "42883": "função inexistente",
  "42P01": "tabela ou visão inexistente",
  "53300": "conexões do banco esgotadas",
  "57014": "consulta cancelada por tempo limite",
};

const CATEGORIAS: Record<string, string> = {
  POOL_TIMEOUT: "tempo esgotado esperando conexão livre com o banco",
  POOL_FECHADO: "conexão com o banco encerrada pelo aplicativo",
  REDE: "falha de rede/IO na conexão com o banco",
  TLS: "falha de TLS na conexão com o banco",
  PROTOCOLO: "resposta inesperada do servidor do banco",
  SEM_LINHA: "registro não encontrado",
  COLUNA: "coluna esperada não veio na consulta",
  DECODE: "valor do banco não converte para o tipo esperado",
  ENCODE: "parâmetro não converte para o tipo do banco",
  CONFIG: "configuração de conexão inválida",
  MIGRATION: "falha ao aplicar migration",
  BANCO: "erro do banco sem SQLSTATE",
  OUTRO: "erro do driver do banco",
};

export type CodigoTecnico = {
  /** Linha de código como veio do backend, sem a referência. Ex.: `AUTOOS:DB:42P01`. */
  codigo: string;
  /** Referência gravada na mesma linha do log do aplicativo. */
  referencia?: string;
  /** Explicação do SQLSTATE/categoria para quem vai investigar. */
  descricao: string;
};

/** Lê o código técnico da resposta do backend. Texto solto (sem `AUTOOS:`) devolve null. */
export function lerCodigoTecnico(value: unknown): CodigoTecnico | null {
  const texto = textoDoErro(value).trim();
  const duplicado = CODIGO_DUPLICADO.exec(texto);
  if (duplicado) {
    return {
      codigo: duplicado[1] ? `AUTOOS:23505:${duplicado[1]}` : "AUTOOS:23505",
      referencia: duplicado[2],
      descricao: `23505 · ${SQLSTATE_CONHECIDOS["23505"]}${duplicado[1] ? ` em ${duplicado[1]}` : ""}`,
    };
  }
  const banco = CODIGO_BANCO.exec(texto);
  if (banco) {
    const assinatura = banco[1];
    let descricao = "erro de banco (versão sem SQLSTATE no código)";
    if (assinatura && /^[0-9A-Z]{5}$/.test(assinatura) && !CATEGORIAS[assinatura]) {
      const classe = CLASSES_SQLSTATE[assinatura.slice(0, 2)] ?? "classe SQLSTATE não mapeada";
      descricao = `SQLSTATE ${assinatura} · ${SQLSTATE_CONHECIDOS[assinatura] ?? classe}${SQLSTATE_CONHECIDOS[assinatura] ? ` (classe ${assinatura.slice(0, 2)}: ${classe})` : ""}`;
    } else if (assinatura) {
      descricao = `${assinatura} · ${CATEGORIAS[assinatura] ?? "categoria não mapeada"}`;
    }
    return { codigo: assinatura ? `AUTOOS:DB:${assinatura}` : "AUTOOS:DB", referencia: banco[2], descricao };
  }
  const operacional = CODIGO_OPERACIONAL.exec(texto);
  if (operacional) {
    return { codigo: "AUTOOS:OP", referencia: operacional[1], descricao: "erro de arquivo, processo ou serialização (fora do banco)" };
  }
  return null;
}
