/**
 * Ponte entre os avisos de erro (fora dos componentes) e a página Suporte. O Layout registra
 * a função de abrir só enquanto o banco está conectado: sem banco o chamado não pode ser
 * gravado, e o erro fica só com "Copiar relatório".
 */
type AbrirSuporte = (relatorioErro: string) => void;

let abrir: AbrirSuporte | null = null;

export function registrarAbrirSuporte(funcao: AbrirSuporte | null) {
  abrir = funcao;
}

export function suporteDisponivel(): boolean {
  return abrir != null;
}

export function enviarErroAoSuporte(relatorioErro: string) {
  abrir?.(relatorioErro);
}
