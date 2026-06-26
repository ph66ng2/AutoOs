import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DatabaseConnectionConfig, ServicoNecessario, PecaNecessaria } from "@/types";

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import { db } from "@/lib/db";

describe("db — new functions (inactivity, db credentials, budget)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("verificarConfigInatividade", () => {
    it("retorna ConfigInatividade com inactivity_lock_enabled=true", async () => {
      mockInvoke.mockResolvedValue(true);

      const result = await db.verificarConfigInatividade();

      expect(mockInvoke).toHaveBeenCalledTimes(1);
      expect(mockInvoke).toHaveBeenCalledWith("verificar_config_inatividade");
      expect(result).toEqual({ inactivity_lock_enabled: true });
    });

    it("retorna inactivity_lock_enabled=false quando Rust retorna false", async () => {
      mockInvoke.mockResolvedValue(false);

      const result = await db.verificarConfigInatividade();

      expect(result).toEqual({ inactivity_lock_enabled: false });
    });
  });

  describe("salvarConfigInatividade", () => {
    it("chama invoke com enabled e retorna ConfigInatividade", async () => {
      mockInvoke.mockResolvedValue(true);

      const result = await db.salvarConfigInatividade(true);

      expect(mockInvoke).toHaveBeenCalledWith("salvar_config_inatividade", { enabled: true });
      expect(result).toEqual({ inactivity_lock_enabled: true });
    });

    it("propaga false do Rust", async () => {
      mockInvoke.mockResolvedValue(false);

      const result = await db.salvarConfigInatividade(false);

      expect(result).toEqual({ inactivity_lock_enabled: false });
    });
  });

  describe("verificarCredenciaisBanco", () => {
    const creds: DatabaseConnectionConfig = {
      host: "localhost",
      port: 5432,
      database: "autoos",
      username: "admin",
      password: "secret",
    };

    it("retorna success=true quando credenciais sao validas", async () => {
      mockInvoke.mockResolvedValue(true);

      const result = await db.verificarCredenciaisBanco(creds);

      expect(mockInvoke).toHaveBeenCalledWith("verificar_credenciais_banco", {
        host: "localhost",
        port: 5432,
        database: "autoos",
        username: "admin",
        password: "secret",
      });
      expect(result).toEqual({ success: true });
    });

    it("retorna success=false quando credenciais sao invalidas", async () => {
      mockInvoke.mockResolvedValue(false);

      const result = await db.verificarCredenciaisBanco(creds);

      expect(result).toEqual({ success: false });
    });

    it("captura erro do invoke e retorna success=false com mensagem", async () => {
      mockInvoke.mockRejectedValue(new Error("Timeout na conexao"));

      const result = await db.verificarCredenciaisBanco(creds);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain("Timeout na conexao");
    });
  });

  describe("redefinirPinViaDb", () => {
    const creds: DatabaseConnectionConfig = {
      host: "localhost",
      port: 5432,
      database: "autoos",
      username: "admin",
      password: "secret",
    };

    it("chama invoke com credenciais, profileId e newPin", async () => {
      mockInvoke.mockResolvedValue(true);

      const result = await db.redefinirPinViaDb(creds, 1, "1234");

      expect(mockInvoke).toHaveBeenCalledWith("redefinir_pin_via_db", {
        host: "localhost",
        port: 5432,
        database: "autoos",
        username: "admin",
        password: "secret",
        profileId: 1,
        newPin: "1234",
      });
      expect(result).toEqual({ success: true });
    });

    it("retorna erro quando invoke rejeita", async () => {
      mockInvoke.mockRejectedValue(new Error("PIN muito curto"));

      const result = await db.redefinirPinViaDb(creds, 1, "12");

      expect(result.success).toBe(false);
      expect(result.error).toContain("PIN muito curto");
    });
  });

  describe("atualizarServicosVerificacao", () => {
    it("serializa servicos e pecas como JSON na chamada invoke", async () => {
      const servicos: ServicoNecessario[] = [
        { id: "s1", catalogo_id: 2, descricao: "Limpeza cabeca termica", valor: 80 },
      ];
      const pecas: PecaNecessaria[] = [
        { id: "p1", nome: "Cabeca de impressao", quantidade: 1, valorUnitario: 350, valorTotal: 350 },
      ];
      mockInvoke.mockResolvedValue({
        id: 10,
        equipamento_id: 5,
        tecnico_nome: "Tecnico Teste",
        problema_relatado: "Teste",
        itens_verificados: null,
        servicos_necessarios: JSON.stringify(servicos),
        pecas_necessarias: JSON.stringify(pecas),
        custo_total: 430,
        concluida: true,
      });

      const result = await db.atualizarServicosVerificacao(
        { equipamento_id: 5, servicos, pecas, custo_total: 430 },
        3,
      );

      expect(mockInvoke).toHaveBeenCalledWith("atualizar_servicos_verificacao", {
        equipamentoId: 5,
        servicosJson: JSON.stringify(servicos),
        pecasJson: JSON.stringify(pecas),
        custoTotal: 430,
        profileId: 3,
        divergence: false,
      });
      expect(result).toBeDefined();
      expect(result.equipamento_id).toBe(5);
      expect(result.custo_total).toBe(430);
    });

    it("funciona com arrays vazios", async () => {
      mockInvoke.mockResolvedValue({
        id: 11,
        equipamento_id: 6,
        tecnico_nome: "Tecnico",
        problema_relatado: "Teste",
        servicos_necessarios: "[]",
        pecas_necessarias: "[]",
        custo_total: 0,
        concluida: false,
      });

      const result = await db.atualizarServicosVerificacao(
        { equipamento_id: 6, servicos: [], pecas: [], custo_total: 0 },
        1,
      );

      expect(mockInvoke).toHaveBeenCalledWith("atualizar_servicos_verificacao", {
        equipamentoId: 6,
        servicosJson: "[]",
        pecasJson: "[]",
        custoTotal: 0,
        profileId: 1,
        divergence: false,
      });
      expect(result.custo_total).toBe(0);
    });
  });

  describe("listarServicosCatalogoAtivos", () => {
    it("retorna lista de servicos ativos", async () => {
      const mockServicos = [
        { id: 1, nome: "Limpeza interna", descricao: "Limpeza completa", preco_padrao: 50, ativo: true },
        { id: 2, nome: "Troca de toner", descricao: "Substituicao de toner", preco_padrao: 30, ativo: true },
      ];
      mockInvoke.mockResolvedValue(mockServicos);

      const result = await db.listarServicosCatalogoAtivos();

      expect(mockInvoke).toHaveBeenCalledWith("listar_servicos_catalogo_ativos");
      expect(result).toHaveLength(2);
      expect(result[0].nome).toBe("Limpeza interna");
    });

    it("retorna array vazio quando nao ha servicos ativos", async () => {
      mockInvoke.mockResolvedValue([]);

      const result = await db.listarServicosCatalogoAtivos();

      expect(result).toEqual([]);
    });
  });
});
