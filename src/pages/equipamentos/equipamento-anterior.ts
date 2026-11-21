import type { UseFormReturn } from "react-hook-form";
import type { EquipamentoFormData } from "@/lib/validations";
import { STATUS_LABELS, type Equipamento, type StatusEquipamento } from "@/types";

/** Atendimentos já encerrados: seus dados podem ser reaproveitados num novo cadastro. */
const STATUS_ATENDIMENTO_ENCERRADO: readonly string[] = ["ENTREGUE", "ABANDONADO"];

/** Campos de "Dados do Equipamento" copiados de um atendimento anterior. */
export const CAMPOS_DADOS_EQUIPAMENTO = ["serial_number", "patrimonio", "marca", "modelo", "tipo"] as const;

export const MENSAGEM_DADOS_PREENCHIDOS = "Dados do equipamento preenchidos a partir do atendimento anterior";

export function atendimentoEncerrado(equipamento: Pick<Equipamento, "status">): boolean {
  return STATUS_ATENDIMENTO_ENCERRADO.includes(equipamento.status);
}

export function rotuloStatusEquipamento(status: string): string {
  return STATUS_LABELS[status as StatusEquipamento] ?? status.replace(/_/g, " ");
}

/**
 * Preenche só os dados do aparelho (série, patrimônio, marca, modelo, tipo). Defeito, técnico,
 * acessórios, observação e fotos são do atendimento novo e não são tocados. A marca "Outro"
 * é guardada como texto livre, então o valor é copiado como está.
 */
export function preencherDadosDoEquipamentoAnterior(
  form: Pick<UseFormReturn<EquipamentoFormData>, "setValue">,
  anterior: Pick<Equipamento, (typeof CAMPOS_DADOS_EQUIPAMENTO)[number]>,
): void {
  const opcoes = { shouldDirty: true, shouldValidate: true } as const;
  form.setValue("serial_number", anterior.serial_number ?? "", opcoes);
  form.setValue("patrimonio", anterior.patrimonio ?? "", opcoes);
  form.setValue("marca", anterior.marca ?? "", opcoes);
  form.setValue("modelo", anterior.modelo ?? "", opcoes);
  form.setValue("tipo", anterior.tipo ?? "", opcoes);
}

export type ResultadoEquipamentoAnterior =
  | { tipo: "em_atendimento" }
  /** `registros` são os cadastros com a mesma série; com algum, o novo ciclo já vem confirmado. */
  | { tipo: "preenchido"; registros: Equipamento[]; confirmarNovoCiclo: boolean };

/**
 * Clique num equipamento anterior no cadastro novo: preenche os dados do aparelho se o atendimento
 * foi encerrado e confere a série repetida; se ainda está em atendimento, não preenche nada.
 */
export async function usarEquipamentoAnteriorNoCadastro(
  form: Pick<UseFormReturn<EquipamentoFormData>, "setValue">,
  anterior: Equipamento,
  buscarPorSerial: (serial: string) => Promise<Equipamento[]>,
): Promise<ResultadoEquipamentoAnterior> {
  if (!atendimentoEncerrado(anterior)) return { tipo: "em_atendimento" };
  preencherDadosDoEquipamentoAnterior(form, anterior);
  let registros: Equipamento[] = [];
  try {
    registros = await buscarPorSerial(anterior.serial_number);
  } catch (err) {
    console.error("Erro ao buscar registros anteriores:", err);
  }
  // O aviso de série repetida aparece de propósito: quem reaproveita os dados abre um novo ciclo.
  return { tipo: "preenchido", registros, confirmarNovoCiclo: registros.length > 0 };
}

/**
 * "Sim, nova manutenção" no aviso de série repetida: copia da última entrada só os campos do
 * aparelho que ainda estão vazios. O que a pessoa já digitou nunca é trocado.
 */
export function preencherVaziosComAnterior(
  form: Pick<UseFormReturn<EquipamentoFormData>, "setValue" | "getValues">,
  anterior: Pick<Equipamento, (typeof CAMPOS_DADOS_EQUIPAMENTO)[number]>,
): void {
  const opcoes = { shouldDirty: true, shouldValidate: true } as const;
  for (const campo of CAMPOS_DADOS_EQUIPAMENTO) {
    if (campo === "serial_number") continue;
    const atual = String(form.getValues(campo) ?? "").trim();
    const valor = anterior[campo];
    if (!atual && valor) form.setValue(campo, valor, opcoes);
  }
}

/** A passagem mais recente desta série (entrada mais nova; empate pelo número da OS). */
export function ultimaPassagem(registros: Equipamento[]): Equipamento | null {
  const ordenados = [...registros].sort(
    (a, b) => (b.data_entrada ?? "").localeCompare(a.data_entrada ?? "") || (b.id ?? 0) - (a.id ?? 0),
  );
  return ordenados[0] ?? null;
}

/**
 * Retorno dentro da garantia dos serviços: a última passagem foi entregue há no máximo `prazoDias`
 * dias. Conta da data de saída (o banco não guarda quando ficou pronta). Só avisa; quem decide
 * cobrar ou não é o técnico, na verificação.
 */
export function retornoNaGarantia(
  ultima: Pick<Equipamento, "status" | "data_saida"> | null,
  prazoDias: number | null,
  hojeIso: string,
): { diasDesdeEntrega: number } | null {
  if (!ultima || ultima.status !== "ENTREGUE" || !ultima.data_saida || prazoDias == null || prazoDias <= 0) return null;
  const saida = Date.parse(`${ultima.data_saida.slice(0, 10)}T00:00:00Z`);
  const hoje = Date.parse(`${hojeIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(saida) || Number.isNaN(hoje)) return null;
  const dias = Math.round((hoje - saida) / 86_400_000);
  return dias >= 0 && dias <= prazoDias ? { diasDesdeEntrega: dias } : null;
}

/** Linha que a OS nova ganha nas observações quando volta dentro da garantia. */
export function linhaRetornoGarantia(ultima: Pick<Equipamento, "id">, prazoDias: number): string {
  return `Retorno da OS #${ultima.id} dentro da garantia de ${prazoDias} dias dos serviços.`;
}
