import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAtualizacaoAoVivo } from "@/hooks/useAtualizacaoAoVivo";
import { argSegundoPlano } from "@/lib/ao-vivo";
import { db } from "@/lib/db";
import type { GastoFixo, GastoVariavel, GastoVariavelInput, GastoResumoMensal } from "@/types";

function useLeituraGastos<T>(
  inicial: T,
  buscar: (segundoPlano: boolean) => Promise<T>,
  mensagemErro: string,
  tabelas: string[],
) {
  const [dados, setDados] = useState(inicial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const carregouUmaVez = useRef(false);
  const cargaVisivelPendente = useRef(false);
  const pedido = useRef(0);
  const buscarAtual = useRef<typeof buscar | null>(null);

  useLayoutEffect(() => {
    buscarAtual.current = buscar;
    return () => {
      buscarAtual.current = null;
      cargaVisivelPendente.current = false;
      ++pedido.current;
    };
  }, [buscar]);

  const carregar = useCallback(async (silencioso = false) => {
    const leitura = buscarAtual.current;
    if (!leitura || (silencioso && cargaVisivelPendente.current)) return;
    const meu = ++pedido.current;
    if (!silencioso) {
      cargaVisivelPendente.current = true;
      setLoading(true);
      setError(null);
    }
    try {
      const dados = await leitura(silencioso);
      if (meu !== pedido.current) return;
      carregouUmaVez.current = true;
      setDados(dados);
      setError(null);
    } catch (err) {
      if (meu !== pedido.current || (silencioso && carregouUmaVez.current)) return;
      setError(String(err) || mensagemErro);
      console.error(mensagemErro, err);
    } finally {
      if (meu === pedido.current) {
        cargaVisivelPendente.current = false;
        setLoading(false);
      }
    }
  }, [mensagemErro]);

  const recarregar = useCallback(() => carregar(), [carregar]);
  useEffect(() => {
    void recarregar();
  }, [buscar, recarregar]);
  useAtualizacaoAoVivo(tabelas, () => { void carregar(true); });

  return { dados, loading, error, recarregar };
}

const buscarFixos = (segundoPlano: boolean) => db.listarGastosFixos(...argSegundoPlano(segundoPlano));

export function useGastosFixos() {
  const { dados: gastosFixos, loading, error, recarregar } = useLeituraGastos<GastoFixo[]>(
    [], buscarFixos, "Erro ao carregar gastos fixos", ["gastos_fixos"],
  );

  const criarGastoFixoMutation = async (input: Omit<GastoFixo, "id">) => {
    try {
      await db.criarGastoFixo(input);
      await recarregar();
      return { sucesso: true as const };
    } catch (err: any) {
      return { sucesso: false as const, erro: err?.toString() };
    }
  };

  const atualizarGastoFixoMutation = async (id: number, input: Omit<GastoFixo, "id">) => {
    try {
      await db.atualizarGastoFixo(id, input);
      await recarregar();
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
    recarregar,
  };
}

export function useGastosVariaveis(mes: number, ano: number) {
  const buscar = useCallback((segundoPlano: boolean) => (
    db.listarGastosVariaveis(mes, ano, ...argSegundoPlano(segundoPlano))
  ), [mes, ano]);
  const { dados: gastosVariaveis, loading, error, recarregar } = useLeituraGastos<GastoVariavel[]>(
    [], buscar, "Erro ao carregar gastos variáveis", ["gastos_variaveis"],
  );

  const criarGastoVariavelMutation = async (input: GastoVariavelInput) => {
    try {
      await db.criarGastoVariavel(input);
      await recarregar();
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
    recarregar,
  };
}

export function useResumoMensal(mes: number, ano: number) {
  const buscar = useCallback((segundoPlano: boolean) => (
    db.resumoMensal(mes, ano, ...argSegundoPlano(segundoPlano))
  ), [mes, ano]);
  const { dados: resumo, loading, error, recarregar } = useLeituraGastos<GastoResumoMensal | null>(
    null, buscar, "Erro ao carregar resumo mensal", ["gastos_fixos", "gastos_variaveis"],
  );

  return { resumo, loading, error, recarregar };
}
