/** O backend recusa publicar orçamento cujo prazo de aprovação já passou. */
export function ehErroPrazoVencido(msg: string): boolean {
  return msg.includes("prazo de aprovação do orçamento já terminou");
}

/** AAAA-MM-DD de hoje (fuso local) somado a `dias`. */
export function dataIsoEmDias(dias: number, base = new Date()): string {
  const data = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dias);
  return data.toLocaleDateString("en-CA");
}

/** AAAA-MM-DD → DD/MM/AAAA. */
export function formatarDataIso(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : iso;
}

/** True when the stored approval deadline is a calendar date before today (local). */
export function prazoAprovacaoVencido(prazo?: string | null, hoje = dataIsoEmDias(0)): boolean {
  const data = prazo?.trim() ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(data) && data < hoje;
}
