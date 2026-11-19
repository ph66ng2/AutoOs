import { useCallback } from "react";
import { db } from "@/lib/db";
import { STATUS_LABELS, type StatusEquipamento } from "@/types";

function campoCsv(valor: unknown) {
  const texto = valor == null ? "" : String(valor);
  return `"${texto.replace(/"/g, '""')}"`;
}

interface FiltrosExportacao {
  busca?: string;
  status?: string;
  tecnico?: string;
  ordenacao?: "ATUALIZACAO_RECENTE" | "CADASTRO_RECENTE";
}

/**
 * Baixa em CSV a lista de equipamentos com os filtros da tela (todas as páginas), na pasta
 * temporária do app, como a exportação de Finanças. Devolve o nome do arquivo.
 */
export function useExportarEquipamentos() {
  return useCallback(async (filtros: FiltrosExportacao) => {
    const status = filtros.status && filtros.status !== "TODOS" ? filtros.status : undefined;
    const buscar = (pagina: number) =>
      db.listarEquipamentosPaginados(filtros.busca, status, pagina, filtros.ordenacao ?? "ATUALIZACAO_RECENTE", filtros.tecnico);
    const primeira = await buscar(0);
    const itens = [...primeira.items];
    const tamanho = Math.max(primeira.items.length, 1);
    const paginas = Math.ceil(primeira.total / tamanho);
    for (let pagina = 1; pagina < paginas; pagina += 1) {
      itens.push(...(await buscar(pagina)).items);
    }
    const linhas = [
      ["equipamento", "serie", "patrimonio", "cliente", "contato", "status", "tecnico", "entrada", "orcamento"].map(campoCsv).join(","),
      ...itens.map((eq) => [
        `${eq.marca} ${eq.modelo}`.trim(),
        eq.serial_number,
        eq.patrimonio ?? "",
        eq.cliente_nome ?? "",
        eq.responsavel_nome ?? "",
        STATUS_LABELS[eq.status as StatusEquipamento] ?? eq.status,
        eq.tecnico_nome ?? "",
        eq.data_entrada,
        eq.valor_orcamento != null ? eq.valor_orcamento.toFixed(2) : "",
      ].map(campoCsv).join(",")),
    ];
    const hoje = new Date();
    const nome = `equipamentos-${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}.csv`;
    await db.salvarArquivoTemp(Array.from(new TextEncoder().encode(`﻿${linhas.join("\n")}`)), nome);
    return nome;
  }, []);
}
