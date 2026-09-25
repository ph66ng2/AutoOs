import { db } from "@/lib/db";
import { IS_SAAS_BUILD } from "@/lib/runtime-mode";
import { carregarRepositorioClientes } from "@/lib/data/clientes-repository";
import { carregarRepositorioClienteContatos } from "@/lib/data/cliente-contatos-repository";
import type { Cliente, ClienteContatoInput, Equipamento, EquipamentoId } from "@/types";
import type { RecipientChannel } from "@/lib/recipient-resolver";

/** Persiste um endereço digitado somente após confirmação explícita do operador. */
export async function saveRecipientAddress(
  equipamento: Equipamento<EquipamentoId>,
  canal: RecipientChannel,
  endereco: string,
) {
  const value = endereco.trim();
  if (!value) throw new Error("Informe um endereço válido para salvar.");

  if (IS_SAAS_BUILD) {
    if (typeof equipamento.cliente_id !== "string" || typeof equipamento.empresa_id !== "string") {
      throw new Error("Não foi possível identificar o cliente Online para salvar o contato.");
    }
    if (typeof equipamento.responsavel_contato_id === "string") {
      const repository = await carregarRepositorioClienteContatos();
      await repository.atualizar(equipamento.responsavel_contato_id, {
        empresa_id: equipamento.empresa_id,
        cliente_id: equipamento.cliente_id,
        nome: equipamento.responsavel_nome?.trim() || "Responsável pelo equipamento",
        email: canal === "email" ? value : equipamento.responsavel_email?.trim() || undefined,
        telefone: canal === "telefone" ? value : equipamento.responsavel_telefone?.trim() || undefined,
      });
      return;
    }

    const repository = await carregarRepositorioClientes();
    const cliente = await repository.buscar(equipamento.cliente_id);
    const { id: _id, ...clienteInput } = cliente;
    await repository.atualizar(equipamento.cliente_id, {
      ...clienteInput,
      ...(canal === "email" ? { email: value } : { telefone: value }),
    });
    return;
  }

  if (typeof equipamento.responsavel_contato_id === "number" && equipamento.empresa_id && typeof equipamento.cliente_id === "number") {
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

  if (typeof equipamento.cliente_id !== "number") {
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
