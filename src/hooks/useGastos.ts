import { useCallback, useEffect, useState } from "react";
import { db } from "@/lib/db";
import type { GastoFixo, GastoVariavel, GastoVariavelInput, GastoResumoMensal } from "@/types";

export function useGastosFixos() {
  const [gastosFixos, setGastosFixos] = useState<GastoFixo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await db.listarGastosFixos();
      setGastosFixos(data);
    } catch (err: any) {
      setError(err?.toString() || "Erro ao carregar gastos fixos");
      console.error("Erro ao carregar gastos fixos:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const criarGastoFixoMutation = async (input: Omit<GastoFixo, "id">) => {
    try {
      await db.criarGastoFixo(input);
      await carregar();
      return { sucesso: true as const };
    } catch (err: any) {
      return { sucesso: false as const, erro: err?.toString() };
    }
  };

  const atualizarGastoFixoMutation = async (id: number, input: Omit<GastoFixo, "id">) => {
    try {
      await db.atualizarGastoFixo(id, input);
      await carregar();
      return { sucesso: true as const };
    } catch (err: any) {
      return { sucesso: false as const, erro: err?.toString() };
    }
  };

  return {
    gastosFixos,
    loading,
    error,
    criarGastoFixoMutation,
    atualizarGastoFixoMutation,
    recarregar: carregar,
  };
}

export function useGastosVariaveis(mes: number, ano: number) {
  const [gastosVariaveis, setGastosVariaveis] = useState<GastoVariavel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await db.listarGastosVariaveis(mes, ano);
      setGastosVariaveis(data);
    } catch (err: any) {
      setError(err?.toString() || "Erro ao carregar gastos variáveis");
      console.error("Erro ao carregar gastos variáveis:", err);
    } finally {
      setLoading(false);
    }
  }, [mes, ano]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const criarGastoVariavelMutation = async (input: GastoVariavelInput) => {
    try {
      await db.criarGastoVariavel(input);
      await carregar();
      return { sucesso: true as const };
    } catch (err: any) {
      return { sucesso: false as const, erro: err?.toString() };
    }
  };

  return {
    gastosVariaveis,
    loading,
    error,
    criarGastoVariavelMutation,
    recarregar: carregar,
  };
}

export function useResumoMensal(mes: number, ano: number) {
  const [resumo, setResumo] = useState<GastoResumoMensal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await db.resumoMensal(mes, ano);
      setResumo(data);
    } catch (err: any) {
      setError(err?.toString() || "Erro ao carregar resumo mensal");
      console.error("Erro ao carregar resumo mensal:", err);
    } finally {
      setLoading(false);
    }
  }, [mes, ano]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return { resumo, loading, error, recarregar: carregar };
}
