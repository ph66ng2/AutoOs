/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  lib/smtp-config.ts — Serviço de Configuração SMTP          ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  Ponte para os comandos Rust de configuração SMTP.          ║
 * ║  Armazena credenciais no keyring do sistema operacional.   ║
 * ║                                                              ║
 * ║  DEPENDE DE:                                                 ║
 * ║  - @tauri-apps/api/core (invoke)                             ║
 * ║  - types/index.ts (SmtpConfig, SmtpConfigInput)             ║
 * ║                                                              ║
 * ║  USADO POR:                                                  ║
 * ║  - pages/Configuracoes.tsx (tela de configurações)         ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
import { invoke } from "@tauri-apps/api/core";
import type { SmtpConfig, SmtpConfigInput } from "@/types";

export const SmtpConfigService = {
  /** Busca configuração SMTP salva (sem a senha, apenas has_password) */
  async buscar(): Promise<SmtpConfig | null> {
    return invoke<SmtpConfig | null>("carregar_config_smtp");
  },

  /** Salva configuração SMTP (senha vai para o keyring do SO) */
  async salvar(config: SmtpConfigInput): Promise<void> {
    return invoke<void>("salvar_config_smtp", { config });
  },
};
