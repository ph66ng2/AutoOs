/**
 * IPC de screenshot. Os registros vêm do JSON exportado do Postgres local
 * descartável (test_autoos). Não abre Tauri, keyring nem banco de produção.
 * O PIN 1234 existe só neste mock: o desktop guarda PIN no keyring do SO.
 */
export class Resource {}
export class Channel<T> {
  onmessage: ((message: T) => void) | null = null;
}

export function isTauri(): boolean {
  return false;
}

const SCREENSHOT_PIN = "1234";

interface Profile {
  id: number;
  nome: string;
  role: string;
  permissions: string[];
  pin_configured: boolean;
  pin_required: boolean;
  is_default: boolean;
  ativo: boolean;
  onboarding_pendente?: boolean;
  tour_permissoes_vistas?: string[] | null;
}

interface Seed {
  marker: string;
  profiles: Profile[];
  clientes: Array<Record<string, unknown>>;
  equipamentos: Array<Record<string, unknown>>;
  produtos: Array<Record<string, unknown> & {
    nome?: string;
    codigo?: string;
    categoria?: string;
    quantidade_estoque?: number;
    quantidade_minima?: number;
  }>;
  portal: {
    portalAtivo: boolean;
    respostasAtivas: boolean;
    respostasAtrasadas: number;
    contato: Record<string, unknown>;
  };
  schema: Record<string, unknown>;
}

let seedPromise: Promise<Seed> | null = null;

function loadSeed(): Promise<Seed> {
  if (!seedPromise) {
    seedPromise = fetch("/__ui-screenshot-seed.json").then(async (response) => {
      if (!response.ok) {
        throw new Error(
          "Fixture de screenshots indisponível. Rode node scripts/prepare-ui-screenshot-db.mjs antes do Vite.",
        );
      }
      const data = (await response.json()) as Seed;
      if (data.marker !== "CI-UI-SCREENSHOT") {
        throw new Error("Fixture de screenshots sem o marcador sintético CI-UI-SCREENSHOT.");
      }
      return data;
    });
  }
  return seedPromise;
}

function activeProfile(seed: Seed): Profile {
  return seed.profiles.find((profile) => profile.nome === "CI Admin Screenshot") ?? seed.profiles[0];
}

/** Perfis de demonstração já concluíram o primeiro acesso e já viram o tour: sem oferta de tour nas capturas. */
function withTourSeen(profile: Profile): Profile {
  return { ...profile, onboarding_pendente: false, tour_permissoes_vistas: profile.permissions };
}

function status(seed: Seed) {
  const profile = activeProfile(seed);
  return {
    pin_configured: true,
    unlocked: true,
    expires_at: null,
    active_profile_id: profile.id,
    active_profile_name: profile.nome,
    active_role: profile.role,
    permissions: profile.permissions,
    can_manage_profiles: profile.permissions.includes("MANAGE_PROFILES"),
    profiles: seed.profiles.filter((item) => item.ativo).map(withTourSeen),
  };
}

function pageOf<T>(items: T[], page: number) {
  const start = Math.max(0, page) * 10;
  return { items: items.slice(start, start + 10), total: items.length };
}

function includes(value: unknown, busca: string) {
  return String(value ?? "").toLowerCase().includes(busca);
}

export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const seed = await loadSeed();
  const page = Math.max(0, Number(args?.page ?? 0));
  const busca = String(args?.busca ?? "").trim().toLowerCase();

  switch (command) {
    case "verificar_status_banco":
      return true as T;
    case "get_sensitive_access_status":
    case "unlock_session_without_pin":
      return structuredClone(status(seed)) as T;
    case "unlock_sensitive_access":
    case "set_active_security_profile":
      if (String(args?.pin ?? "") !== SCREENSHOT_PIN) {
        throw new Error("PIN inválido no mock de screenshot.");
      }
      return structuredClone(status(seed)) as T;
    case "lock_sensitive_access":
      return true as T;
    case "list_security_profiles":
      return structuredClone(seed.profiles.map(withTourSeen)) as T;
    case "list_security_audit_events":
    case "listar_minhas_acoes":
      return [] as T;
    case "registrar_tour_visto":
      return structuredClone(status(seed)) as T;
    case "verificar_config_inatividade":
      return false as T;
    case "listar_clientes":
      return structuredClone(seed.clientes) as T;
    case "listar_clientes_paginados": {
      const items = seed.clientes.filter((cliente) => {
        if (!busca) return true;
        return [cliente.nome, cliente.nome_fantasia, cliente.razao_social, cliente.documento, cliente.email]
          .some((value) => includes(value, busca));
      });
      return pageOf(items, page) as T;
    }
    case "buscar_cliente":
      return structuredClone(seed.clientes.find((cliente) => cliente.id === args?.id) ?? seed.clientes[0]) as T;
    case "listar_equipamentos_cliente":
      return structuredClone(seed.equipamentos.filter((equipamento) => equipamento.cliente_id === args?.clienteId)) as T;
    case "listar_equipamentos": {
      const statusFiltro = args?.status as string | undefined;
      const items = seed.equipamentos.filter((equipamento) =>
        !statusFiltro || statusFiltro === "TODOS" || equipamento.status === statusFiltro,
      );
      return structuredClone(items) as T;
    }
    case "listar_equipamentos_paginados": {
      const statusFiltro = args?.status as string | undefined;
      const items = seed.equipamentos.filter((equipamento) => {
        const matchesStatus = !statusFiltro || statusFiltro === "TODOS" || equipamento.status === statusFiltro;
        const matchesSearch = !busca || [equipamento.serial_number, equipamento.patrimonio, equipamento.marca, equipamento.modelo, equipamento.cliente_nome]
          .some((value) => includes(value, busca));
        return matchesStatus && matchesSearch;
      });
      return pageOf(items, page) as T;
    }
    case "buscar_equipamento":
      return structuredClone(
        seed.equipamentos.find((equipamento) => equipamento.id === args?.id) ?? seed.equipamentos[0],
      ) as T;
    case "buscar_equipamentos_por_serial":
      return structuredClone(seed.equipamentos) as T;
    case "listar_produtos":
      return structuredClone(seed.produtos) as T;
    case "listar_produtos_paginados": {
      const categoria = String(args?.categoria ?? "TODOS");
      const baixo = Boolean(args?.apenasEstoqueBaixo);
      const items = seed.produtos.filter((produto) =>
        (!busca || includes(produto.nome, busca) || includes(produto.codigo, busca)) &&
        (categoria === "TODOS" || !categoria || produto.categoria === categoria) &&
        (!baixo || Number(produto.quantidade_estoque) < Number(produto.quantidade_minima)),
      );
      const belowMinimum = seed.produtos.filter((produto) =>
        Number(produto.quantidade_estoque) < Number(produto.quantidade_minima),
      ).length;
      return { ...pageOf(items, page), belowMinimum } as T;
    }
    case "obter_estado_portal":
      return {
        portalAtivo: seed.portal.portalAtivo,
        respostasAtivas: seed.portal.respostasAtivas,
        respostasAtrasadas: seed.portal.respostasAtrasadas,
      } as T;
    case "obter_contato_portal_empresa":
      return structuredClone(seed.portal.contato) as T;
    case "obter_status_schema_banco":
      return structuredClone(seed.schema) as T;
    case "obter_status_ferramentas_backup_postgres":
      return {
        database_name: "test_autoos",
        host: "127.0.0.1",
        port: 5432,
        backup_directory: "/tmp/autoos-screenshot-backups",
        pg_dump_available: false,
        pg_restore_available: false,
        psql_available: true,
      } as T;
    case "obter_diagnostico_suporte_local":
      return {
        product_name: "AutoOS",
        app_version: "0.6.0",
        app_identifier: "com.bmitag.autoos",
        target_os: "linux",
        build_profile: "screenshot",
        log_directory: "/tmp/autoos-screenshot-logs",
        support_directory: "/tmp/autoos-screenshot-support",
        temp_directory: "/tmp/autoos-screenshot-temp",
        backup_directory: "/tmp/autoos-screenshot-backups",
        capability_permissions: [],
        capability_review: "Screenshot sintético. Sem pacote de suporte.",
        recent_log_files: [],
        recent_support_files: [],
        recent_temp_files: [],
        windows_bundle: {
          product_name: "AutoOS",
          version: "0.6.0",
          identifier: "com.bmitag.autoos",
          targets: "nsis",
          has_certificate_thumbprint: false,
          has_timestamp_url: false,
          icon_count: 0,
          blockers: [],
        },
        housekeeping: {
          temp_files_removed: 0,
          log_files_removed: 0,
          support_files_removed: 0,
        },
      } as T;
    case "carregar_config_smtp":
    case "carregar_config_whatsapp":
    case "carregar_config_photo_tunnel":
    case "carregar_config_banco":
    case "obter_config_banco_atual":
    case "obter_erro_inicializacao_banco":
    case "buscar_verificacao_tecnica":
    case "obter_decisao_orcamento":
    case "obter_link_status_publico":
      return null as T;
    case "contar_alertas_portal_nao_lidos":
      return 0 as T;
    case "listar_alertas_portal":
    case "listar_imagens_equipamento":
    case "listar_historico_equipamento":
    case "listar_comunicacoes":
    case "listar_cliente_contatos":
      return [] as T;
    default:
      if (command.startsWith("listar_") || command.startsWith("list_")) return [] as T;
      if (command.startsWith("contar_")) return 0 as T;
      if (command.startsWith("verificar_")) return false as T;
      return null as T;
  }
}
