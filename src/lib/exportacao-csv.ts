import { isTauri } from "@tauri-apps/api/core";
import { db } from "@/lib/db";

export async function baixarCsv(linhas: string[], nome: string): Promise<string> {
  const conteudo = `\uFEFF${linhas.join("\n")}`;
  if (isTauri()) {
    return db.salvarExportacaoCsv(Array.from(new TextEncoder().encode(conteudo)), nome);
  }

  const url = URL.createObjectURL(new Blob([conteudo], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return nome;
}
