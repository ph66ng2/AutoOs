/**
 * Mensagens prontas de WhatsApp (0058): troca os campos entre chaves pelo dado do atendimento.
 * Campo sem dado vira vazio e o texto é arrumado (sem espaço duplo nem "()" sobrando).
 */
export const CAMPOS_MENSAGEM = ["cliente", "contato", "equipamento", "os", "status"] as const;
export type CampoMensagem = (typeof CAMPOS_MENSAGEM)[number];
export type DadosMensagem = Partial<Record<CampoMensagem, string | null | undefined>>;

export const ROTULO_CAMPO_MENSAGEM: Record<CampoMensagem, string> = {
  cliente: "Cliente",
  contato: "Contato",
  equipamento: "Equipamento",
  os: "Nº da OS",
  status: "Situação",
};

export function preencherMensagem(texto: string, dados: DadosMensagem): string {
  const preenchido = texto.replace(/\{(\w+)\}/g, (bruto, campo: string) => {
    if (!(CAMPOS_MENSAGEM as readonly string[]).includes(campo)) return bruto;
    return dados[campo as CampoMensagem]?.trim() ?? "";
  });
  return preenchido
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.!?;:])/g, "$1")
    .replace(/,\s*!/g, "!")
    .trim();
}
