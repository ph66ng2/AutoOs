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

const CODIGO_DUPLICADO = /^AUTOOS:23505(?::([A-Za-z_][A-Za-z0-9_]*))?$/;

export const MENSAGEM_ERRO_GENERICO = "Não foi possível concluir esta ação. O detalhe técnico foi registrado no log do aplicativo.";

/** Só o código AUTOOS:23505 que o backend monta a partir do SQLSTATE. Texto solto não conta. */
export function erroDeCadastroDuplicado(value: unknown): boolean {
  return CODIGO_DUPLICADO.test(textoDoErro(value).trim());
}

function nomeDaRestricao(raw: string): string {
  return CODIGO_DUPLICADO.exec(raw.trim())?.[1] ?? "";
}

/** Traduz o código estruturado de duplicidade. Mantém os outros erros. */
export function mensagemCadastroDuplicado(value: unknown): string | null {
  const raw = textoDoErro(value).trim();
  if (!CODIGO_DUPLICADO.test(raw)) return null;

  const restricao = nomeDaRestricao(raw);
  const especifica = MENSAGENS.find((item) => item.restricoes.includes(restricao));
  if (especifica) return especifica.texto;
  if (restricao.endsWith("_pkey")) return MENSAGEM_CHAVE_PRIMARIA;
  return MENSAGEM_GENERICA;
}

export function textoTecnicoDeBanco(value: unknown): boolean {
  if (erroDeCadastroDuplicado(value)) return false;
  const raw = textoDoErro(value);
  if (!raw) return false;
  return /sqlstate|duplicate key|unique constraint|syntax error|violates|constraint "|chave duplicada|unicidade|pg_[a-z0-9_]+|\b235\d{2}\b|\b42\d{3}\b/i.test(raw);
}
