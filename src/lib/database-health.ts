import { lerCodigoTecnico } from "@/lib/operator-errors";

/**
 * Detecta, a partir do erro de um comando, se o banco pode ter caído com o
 * app aberto. É só um indício: quem ouve o canal confirma com
 * `verificar_saude_banco` antes de mostrar qualquer aviso.
 */

/** Categorias do código `AUTOOS:DB:<x>` que apontam para conexão, não para dado. */
const ASSINATURAS_DE_CONEXAO = new Set(["REDE", "POOL_TIMEOUT", "POOL_FECHADO", "TLS", "PROTOCOLO"]);

/** SQLSTATE de conexão (classe 08), servidor lotado e servidor desligando. */
function sqlstateDeConexao(assinatura: string): boolean {
  return assinatura.startsWith("08") || assinatura === "53300" || /^57P0[123]$/.test(assinatura);
}

/**
 * Textos crus que ainda chegam de comandos que devolvem `e.to_string()`
 * (frases do sqlx em inglês) e as frases sanitizadas de `database_error_message`.
 */
const TEXTOS_DE_CONEXAO = [
  "pool timed out",
  "error communicating with database",
  "connection refused",
  "connection reset",
  "broken pipe",
  "too many clients",
  "attempted to acquire a connection on a closed pool",
  "não foi possível alcançar o banco",
  "a conexão com o banco excedeu",
  "o banco demorou para responder",
  "falha ao estabelecer a conexão segura tls",
  "pool de conexões não inicializado",
  "sqlstate 53300",
];

function textoDoErro(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

export function pareceFalhaDeConexao(error: unknown): boolean {
  const codigo = lerCodigoTecnico(error);
  if (codigo?.codigo.startsWith("AUTOOS:DB:")) {
    const assinatura = codigo.codigo.slice("AUTOOS:DB:".length);
    return ASSINATURAS_DE_CONEXAO.has(assinatura) || sqlstateDeConexao(assinatura);
  }
  if (codigo) return false;
  const texto = textoDoErro(error).toLocaleLowerCase("pt-BR");
  return TEXTOS_DE_CONEXAO.some((trecho) => texto.includes(trecho));
}

type Ouvinte = () => void;
const ouvintes = new Set<Ouvinte>();
/** Suspeita que chegou antes de alguém ouvir (ex.: provider que roda antes do App montar o aviso). */
let suspeitaPendente = false;

/** Comandos de checagem/reconexão não realimentam o canal. */
const COMANDOS_DE_SAUDE = new Set(["verificar_saude_banco", "tentar_reconectar_banco", "obter_erro_inicializacao_banco"]);

/** Chamado pelos wrappers de `invoke` de `db.ts` e `sensitive-access.ts` quando um comando falha. */
export function reportarFalhaDeComando(comando: string, error: unknown): void {
  if (COMANDOS_DE_SAUDE.has(comando) || !pareceFalhaDeConexao(error)) return;
  if (ouvintes.size === 0) {
    suspeitaPendente = true;
    return;
  }
  for (const ouvinte of ouvintes) ouvinte();
}

/** Registra quem confirma a queda (o hook de saúde do banco). */
export function ouvirPossivelQuedaDeConexao(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte);
  if (suspeitaPendente) {
    suspeitaPendente = false;
    queueMicrotask(ouvinte);
  }
  return () => {
    ouvintes.delete(ouvinte);
  };
}
