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

const CODIGO_DUPLICADO = /^AUTOOS:23505(?::([A-Za-z_][A-Za-z0-9_]*))?(?:\n([\s\S]*))?$/;
const CODIGO_BANCO = /^AUTOOS:DB(?:\n([\s\S]*))?$/;

export const MENSAGEM_ERRO_GENERICO = "Não foi possível concluir esta ação. O detalhe técnico foi registrado no log do aplicativo.";

function lerDuplicado(value: unknown): { restricao: string; embutida: string } | null {
  const match = CODIGO_DUPLICADO.exec(textoDoErro(value).trim());
  if (!match) return null;
  return { restricao: match[1] ?? "", embutida: (match[2] ?? "").trim() };
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
  const match = CODIGO_BANCO.exec(textoDoErro(value).trim());
  if (!match) return null;
  return (match[1] ?? "").trim() || MENSAGEM_ERRO_GENERICO;
}

/**
 * Frase para o operador quando o backend mandou código estruturado.
 * Sem código, devolve null para a mensagem original seguir inteira.
 */
export function mensagemVisivelAoOperador(value: unknown): string | null {
  return mensagemCadastroDuplicado(value) ?? mensagemDeBanco(value);
}
