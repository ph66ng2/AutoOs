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

export function erroDeCadastroDuplicado(value: unknown): boolean {
  const lower = textoDoErro(value).toLowerCase();
  return lower.includes("duplicate key")
    || lower.includes("unique constraint")
    || lower.includes("23505")
    || lower.includes("unicidade")
    || lower.includes("chave duplicada");
}

function nomeDaRestricao(raw: string): string {
  const match = raw.match(/(?:constraint|unicidade) "([^"]+)"/i);
  return match?.[1] ?? "";
}

/** Traduz chave duplicada do banco para uma frase de balcão. Mantém os outros erros. */
export function mensagemCadastroDuplicado(value: unknown): string | null {
  const raw = textoDoErro(value);
  if (!erroDeCadastroDuplicado(raw)) return null;

  const restricao = nomeDaRestricao(raw);
  const especifica = MENSAGENS.find((item) => item.restricoes.includes(restricao));
  if (especifica) return especifica.texto;
  if (restricao.endsWith("_pkey")) return MENSAGEM_CHAVE_PRIMARIA;
  return MENSAGEM_GENERICA;
}
