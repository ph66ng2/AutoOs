/** Demonstration-only IPC for the team UI. Never used by production builds. */
import { invoke as baseInvoke } from "./tauri-core";
import { SENSITIVE_PERMISSIONS, type SecurityProfile, type SecurityProfileInput } from "../../src/types";
export { Resource, Channel, isTauri } from "./tauri-core";
const all = Object.values(SENSITIVE_PERMISSIONS);
const profiles: SecurityProfile[] = [
  { id: 1, nome: "Paulo Medeiros", role: "ADMIN", permissions: all, pin_configured: true, pin_required: true, is_default: true, ativo: true },
  { id: 2, nome: "Ivan Santos", role: "TECNICO", permissions: ["STOCK_CONTROL"], pin_configured: true, pin_required: true, is_default: false, ativo: true },
  { id: 3, nome: "Maria Oliveira", role: "ATENDENTE", permissions: [], pin_configured: true, pin_required: true, is_default: false, ativo: true },
  { id: 4, nome: "Recepção 2", role: "FINANCEIRO", permissions: ["FINANCIAL_ACTIONS", "VIEW_EXPENSES"], pin_configured: false, pin_required: true, is_default: false, ativo: true, onboarding_pendente: true },
];
// Visual e tour já escolhidos pelos perfis ativos da demonstração.
Object.assign(profiles[0], { avatar_icone: "star", avatar_cor: "#7C3AED", tour_permissoes_vistas: all });
Object.assign(profiles[1], { avatar_icone: "wrench", avatar_cor: "#0F766E", tour_permissoes_vistas: [] });
Object.assign(profiles[2], { avatar_icone: "coffee", avatar_cor: "#EA580C", tour_permissoes_vistas: [] });
const demoCode = (profile: SecurityProfile) => ({ profile_id: profile.id, nome: profile.nome, codigo: "K7Q-42M", expira_em: new Date(Date.now() + 86_400_000).toISOString() });
let active = profiles[0];
function status() { return { pin_configured: active.pin_configured, unlocked: true, active_profile_id: active.id, active_profile_name: active.nome, active_role: active.role, permissions: active.permissions, can_manage_profiles: active.permissions.includes("MANAGE_PROFILES"), expires_at: null, profiles: profiles.filter(p => p.ativo) }; }
export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (command === "unlock_sensitive_access") return structuredClone(status()) as T;
  if (command === "get_sensitive_access_status") return structuredClone(status()) as T;
  if (command === "list_security_profiles") return structuredClone(profiles) as T;
  if (command === "set_active_security_profile") { const profile = profiles.find(p => p.id === args?.profileId)!; if (profile.pin_required && !profile.pin_configured) throw new Error("PIN pendente neste computador"); active = profile; return structuredClone(status()) as T; }
  if (command === "criar_perfil_com_codigo") { const input = args?.input as SecurityProfileInput; const created: SecurityProfile = { ...input, id: Math.max(...profiles.map(p => p.id)) + 1, pin_configured: false, pin_required: true, is_default: false, ativo: true, onboarding_pendente: true }; profiles.push(created); return structuredClone(demoCode(created)) as T; }
  if (command === "gerar_codigo_primeiro_acesso") return structuredClone(demoCode(profiles.find(p => p.id === args?.profileId)!)) as T;
  if (command === "ativar_perfil_com_codigo") { const profile = profiles.find(p => p.id === args?.profileId)!; if (String(args?.codigo).replace(/\W/g, "").toUpperCase() !== "K7Q42M") throw new Error("Código inválido ou expirado. Peça um novo código ao administrador."); profile.pin_configured = true; active = profile; return structuredClone(status()) as T; }
  if (command === "salvar_personalizacao_perfil") { const input = args?.input as { nome: string; avatar_icone: string; avatar_cor: string; tema: "light" | "dark"; concluir_onboarding: boolean }; Object.assign(active, { nome: input.nome, avatar_icone: input.avatar_icone, avatar_cor: input.avatar_cor, tema: input.tema }); if (input.concluir_onboarding) active.onboarding_pendente = false; return structuredClone(status()) as T; }
  if (command === "registrar_tour_visto") { active.tour_permissoes_vistas = [...active.permissions]; return structuredClone(status()) as T; }
  if (command === "listar_minhas_acoes") return [{ id: 1, event_type: "PROFILE_SWITCH", profile_id: active.id, profile_name: active.nome, success: true, created_at: new Date().toISOString() }] as T;
  if (command === "create_security_profile") { const input = args?.input as SecurityProfileInput; profiles.push({ ...input, id: Math.max(...profiles.map(p => p.id)) + 1, pin_configured: true, pin_required: true, is_default: false, ativo: true }); return structuredClone(status()) as T; }
  const target = profiles.find(p => p.id === args?.profileId);
  if (command === "update_security_profile" && target) Object.assign(target, args?.input);
  else if (command === "reset_security_profile_pin" && target) target.pin_configured = true;
  else if (command === "deactivate_security_profile" && target) target.ativo = false;
  else if (command === "reactivate_security_profile" && target) target.ativo = true;
  else return baseInvoke<T>(command, args);
  return structuredClone(status()) as T;
}
