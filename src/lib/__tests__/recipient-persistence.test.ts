import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Equipamento } from "@/types";
import { mensagemEnvioFalhouComEmailSalvo, saveRecipientAddress } from "@/lib/recipient-persistence";

const db = vi.hoisted(() => ({ atualizarClienteContato: vi.fn(), buscarCliente: vi.fn(), atualizarCliente: vi.fn() }));
vi.mock("@/lib/db", () => ({ db }));

const equipamento = { id: 1, cliente_id: 9, empresa_id: 7 } as Equipamento;

beforeEach(() => {
  vi.clearAllMocks();
  db.buscarCliente.mockResolvedValue({ id: 9, empresa_id: 7, nome: "Cliente" });
});

describe("persistência do destinatário antes do envio", () => {
  it("grava o e-mail no cliente; uma falha posterior de SMTP não desfaz a gravação", async () => {
    const enviar = vi.fn().mockResolvedValue({ sucesso: false, erro: "SMTP indisponível" });
    // Mesma ordem usada pelas telas: salvar primeiro, enviar depois.
    await saveRecipientAddress(equipamento, "email", " novo@cliente.com ");
    const retorno = await enviar();
    expect(retorno.sucesso).toBe(false);
    expect(db.atualizarCliente).toHaveBeenCalledTimes(1);
    expect(db.atualizarCliente).toHaveBeenCalledWith(9, expect.objectContaining({ email: "novo@cliente.com" }));
    // Nenhuma reversão é feita após a falha do envio.
    expect(db.atualizarCliente).toHaveBeenCalledTimes(1);
  });

  it("grava no contato responsável quando o equipamento tem um", async () => {
    await saveRecipientAddress({ ...equipamento, responsavel_contato_id: 4, responsavel_nome: "Ana" } as Equipamento, "email", "ana@cliente.com");
    expect(db.atualizarClienteContato).toHaveBeenCalledWith(4, expect.objectContaining({ email: "ana@cliente.com", nome: "Ana" }));
    expect(db.atualizarClienteContato.mock.calls[0]?.[1]).not.toHaveProperty("preservar_identidade_portal", true);
    expect(db.atualizarCliente).not.toHaveBeenCalled();
  });

  it("grava o e-mail mesmo quando o responsável tem acesso ao portal", async () => {
    await saveRecipientAddress({
      ...equipamento,
      responsavel_contato_id: 4,
      responsavel_nome: "Ana Portal",
      responsavel_email: "ana@portal.test",
    } as Equipamento, "email", "ana.novo@cliente.com");
    expect(db.atualizarClienteContato).toHaveBeenCalledWith(4, expect.objectContaining({
      nome: "Ana Portal",
      email: "ana.novo@cliente.com",
    }));
    expect(db.atualizarClienteContato.mock.calls[0]?.[1]).not.toHaveProperty("preservar_identidade_portal", true);
  });

  it("não salva nada quando o endereço está vazio", async () => {
    await expect(saveRecipientAddress(equipamento, "email", "  ")).rejects.toThrow("Informe um endereço válido");
    expect(db.atualizarCliente).not.toHaveBeenCalled();
  });

  it("avisa que o e-mail foi salvo e que o envio falhou", () => {
    expect(mensagemEnvioFalhouComEmailSalvo("SMTP recusou a autenticação."))
      .toBe("O e-mail foi salvo no cadastro. O envio falhou: SMTP recusou a autenticação; tente reenviar.");
    expect(mensagemEnvioFalhouComEmailSalvo(undefined))
      .toBe("O e-mail foi salvo no cadastro. O envio falhou: falha desconhecida; tente reenviar.");
  });
});
