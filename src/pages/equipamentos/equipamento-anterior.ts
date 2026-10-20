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
