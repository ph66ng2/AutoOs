import { db } from "@/lib/db";
import type { Cliente, ClienteContatoInput, Equipamento } from "@/types";
import type { RecipientChannel } from "@/lib/recipient-resolver";

/** Persiste um endereço digitado somente após confirmação explícita do operador. */
export async function saveRecipientAddress(
  equipamento: Equipamento,
  canal: RecipientChannel,
  endereco: string,
) {
  const value = endereco.trim();
  if (!value) throw new Error("Informe um endereço válido para salvar.");

  if (equipamento.responsavel_contato_id && equipamento.empresa_id && equipamento.cliente_id) {
    const input: ClienteContatoInput = {
      empresa_id: equipamento.empresa_id,
      cliente_id: equipamento.cliente_id,
      nome: equipamento.responsavel_nome?.trim() || "Responsável pelo equipamento",
      email: canal === "email" ? value : equipamento.responsavel_email?.trim() || undefined,
      telefone: equipamento.responsavel_telefone?.trim() || undefined,
    };
    if (canal === "telefone") input.telefone = value;
    await db.atualizarClienteContato(equipamento.responsavel_contato_id, input);
    return;
  }

  if (!equipamento.cliente_id) {
    throw new Error("Não foi possível identificar o cliente para salvar o contato.");
  }

  const cliente = await db.buscarCliente(equipamento.cliente_id);
  const { id: _id, ...clienteInput } = cliente;
  const input: Omit<Cliente, "id"> = {
    ...clienteInput,
    ...(canal === "email" ? { email: value } : { telefone: value }),
  };
  await db.atualizarCliente(equipamento.cliente_id, input);
}
