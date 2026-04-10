/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  Configuracoes.tsx — Página de Configurações do Sistema      ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  Permite configurar integrações e parâmetros do sistema.    ║
 * ║  Atualmente implementado: Configuração SMTP para envio de   ║
 * ║  emails (orçamentos e notificações).                         ║
 * ║                                                              ║
 * ║  FUNCIONALIDADES:                                            ║
 * ║  - Formulário de configuração SMTP (host, porta, usuário)   ║
 * ║  - Armazenamento seguro de senha via keyring do SO          ║
 * ║  - Indicador de senha já configurada (has_password)         ║
 * ║                                                              ║
 * ║  DEPENDE DE:                                                 ║
 * ║  - lib/smtp-config.ts (buscar/salvar config)                ║
 * ║  - types/index.ts (SmtpConfig, SmtpConfigInput)             ║
 * ║  - react-hook-form (formulário)                              ║
 * ║                                                              ║
 * ║  USADO POR: App.tsx (rota /configuracoes)                   ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { useForm, Controller } from "react-hook-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { db } from "@/lib/db";
import { SmtpConfigService } from "@/lib/smtp-config";
import { WhatsappConfigService } from "@/lib/whatsapp-config";
import { SensitiveAccessService } from "@/lib/sensitive-access";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import {
  SENSITIVE_PERMISSIONS,
  SENSITIVE_PERMISSION_LABELS,
  type DatabaseSchemaStatus,
  type PostgresBackupToolsStatus,
  type SecurityAuditEvent,
  type SecurityProfile,
  type SensitivePermission,
  type SmtpConfigInput,
  type WhatsappConfigInput,
} from "@/types";

interface SmtpFormValues {
  host: string;
  port: number;
  username: string;
  from_name: string;
  from_email: string;
  use_tls: boolean;
  password: string;
}

interface WhatsappFormValues {
  provider: string;
  api_url: string;
  token: string;
}

export default function Configuracoes() {
  const { status: accessStatus, refreshStatus, hasPermission, setActiveProfile } = useSensitiveAccess();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [whatsappLoading, setWhatsappLoading] = useState(true);
  const [savingWhatsapp, setSavingWhatsapp] = useState(false);
  const [whatsappHasToken, setWhatsappHasToken] = useState(false);
  const [whatsappStatus, setWhatsappStatus] = useState<string | null>(null);
  const [securityMessage, setSecurityMessage] = useState<string | null>(null);
  const [tab, setTab] = useState("smtp");
  const [auditEvents, setAuditEvents] = useState<SecurityAuditEvent[]>([]);
  const [profilesCatalog, setProfilesCatalog] = useState<SecurityProfile[]>([]);
  const [securityBusy, setSecurityBusy] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [managedProfileId, setManagedProfileId] = useState<number | null>(null);
  const [editProfileName, setEditProfileName] = useState("");
  const [editProfileRole, setEditProfileRole] = useState("CUSTOM");
  const [editPermissions, setEditPermissions] = useState<SensitivePermission[]>([]);
  const [resetPin, setResetPin] = useState("");
  const [resetPinConfirm, setResetPinConfirm] = useState("");
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileRole, setNewProfileRole] = useState("CUSTOM");
  const [newProfilePermissions, setNewProfilePermissions] = useState<SensitivePermission[]>([]);
  const [newProfilePin, setNewProfilePin] = useState("");
  const [newProfilePinConfirm, setNewProfilePinConfirm] = useState("");
  const [auditSearch, setAuditSearch] = useState("");
  const [auditOutcomeFilter, setAuditOutcomeFilter] = useState("ALL");
  const [auditProfileFilter, setAuditProfileFilter] = useState("ALL");
  const [schemaStatus, setSchemaStatus] = useState<DatabaseSchemaStatus | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [backupToolsStatus, setBackupToolsStatus] = useState<PostgresBackupToolsStatus | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [restoreFilePath, setRestoreFilePath] = useState("");
  const [restoreConfirmText, setRestoreConfirmText] = useState("");
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);

  const permissionOptions = Object.values(SENSITIVE_PERMISSIONS);
  const canConfigureSmtp = hasPermission(SENSITIVE_PERMISSIONS.CONFIG_SMTP);
  const canConfigureWhatsapp = hasPermission(SENSITIVE_PERMISSIONS.CONFIG_WHATSAPP);
  const canConfigureIntegrations = canConfigureSmtp || canConfigureWhatsapp;
  const canManageProfiles = hasPermission(SENSITIVE_PERMISSIONS.MANAGE_PROFILES);
  const restoreMode = detectRestoreMode(restoreFilePath);
  const restoreReady = restoreMode === "pg_restore"
    ? !!backupToolsStatus?.pg_restore_available
    : restoreMode === "psql"
      ? !!backupToolsStatus?.psql_available
      : false;
  const managedProfile = profilesCatalog.find((profile) => profile.id === managedProfileId)
    ?? accessStatus?.profiles.find((profile) => profile.id === managedProfileId)
    ?? null;
  const auditProfileOptions = Array.from(new Map(
    auditEvents
      .filter((event) => event.profile_id && event.profile_name)
      .map((event) => [String(event.profile_id), event.profile_name as string])
  ).entries());
  const filteredAuditEvents = auditEvents.filter((event) => {
    const search = auditSearch.trim().toLowerCase();
    const matchesSearch = !search || [event.event_type, event.profile_name, event.details]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search));
    const matchesOutcome = auditOutcomeFilter === "ALL"
      || (auditOutcomeFilter === "SUCCESS" && event.success)
      || (auditOutcomeFilter === "FAILED" && !event.success);
    const matchesProfile = auditProfileFilter === "ALL"
      || String(event.profile_id ?? "") === auditProfileFilter;

    return matchesSearch && matchesOutcome && matchesProfile;
  });

  const { register, handleSubmit, setValue, control } = useForm<SmtpFormValues>({
    defaultValues: {
      host: "",
      port: 587,
      username: "",
      from_name: "",
      from_email: "",
      use_tls: true,
      password: "",
    },
  });

  const {
    register: registerWhatsapp,
    handleSubmit: handleSubmitWhatsapp,
    setValue: setWhatsappValue,
  } = useForm<WhatsappFormValues>({
    defaultValues: {
      provider: "EVOLUTION",
      api_url: "",
      token: "",
    },
  });

  function permissionsForRole(role: string, permissions: SensitivePermission[]) {
    return role === "ADMIN" ? permissionOptions : permissions;
  }

  function togglePermission(
    currentPermissions: SensitivePermission[],
    permission: SensitivePermission,
    setter: (value: SensitivePermission[]) => void,
  ) {
    if (currentPermissions.includes(permission)) {
      setter(currentPermissions.filter((value) => value !== permission));
      return;
    }

    setter([...currentPermissions, permission]);
  }

  function detectRestoreMode(filePath: string): "pg_restore" | "psql" | null {
    const normalized = filePath.trim().toLowerCase();
    if (normalized.endsWith(".dump")) {
      return "pg_restore";
    }
    if (normalized.endsWith(".sql")) {
      return "psql";
    }
    return null;
  }

  async function loadAuditEvents() {
    if (!canManageProfiles) {
      setAuditEvents([]);
      return;
    }

    try {
      const events = await SensitiveAccessService.listAuditEvents(100);
      setAuditEvents(events);
    } catch (error: any) {
      setSecurityMessage(error?.message || error?.toString() || "Falha ao carregar a auditoria de segurança.");
    }
  }

  async function loadProfilesCatalog() {
    if (!canManageProfiles) {
      setProfilesCatalog([]);
      return;
    }

    try {
      const profiles = await SensitiveAccessService.listProfiles(true);
      setProfilesCatalog(profiles);
    } catch (error: any) {
      setSecurityMessage(error?.message || error?.toString() || "Falha ao carregar os perfis de segurança.");
    }
  }

  async function loadSchemaStatus() {
    setSchemaLoading(true);
    setSchemaError(null);
    try {
      const nextStatus = await db.obterStatusSchemaBanco();
      setSchemaStatus(nextStatus);
    } catch (error: any) {
      setSchemaError(error?.message || error?.toString() || "Falha ao consultar a versão do schema do banco.");
    } finally {
      setSchemaLoading(false);
    }
  }

  async function loadBackupToolsStatus() {
    if (!canManageProfiles) {
      setBackupToolsStatus(null);
      setBackupError(null);
      return;
    }

    setBackupLoading(true);
    setBackupError(null);
    try {
      const nextStatus = await db.obterStatusFerramentasBackupPostgres();
      setBackupToolsStatus(nextStatus);
    } catch (error: any) {
      setBackupToolsStatus(null);
      setBackupError(error?.message || error?.toString() || "Falha ao validar as ferramentas de backup.");
    } finally {
      setBackupLoading(false);
    }
  }

  useEffect(() => {
    async function loadConfig() {
      if (!canConfigureSmtp) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const config = await SmtpConfigService.buscar();
        if (config) {
          setValue("host", config.host);
          setValue("port", config.port);
          setValue("username", config.username);
          setValue("from_name", config.from_name);
          setValue("from_email", config.from_email);
          setValue("use_tls", config.use_tls);
          setHasPassword(!!config.has_password);
        }
      } catch (error) {
        console.error("Erro ao carregar config SMTP:", error);
      } finally {
        setLoading(false);
      }
    }

    void loadConfig();
  }, [canConfigureSmtp, setValue, accessStatus?.active_profile_id]);

  useEffect(() => {
    async function loadWhatsappConfig() {
      if (!canConfigureWhatsapp) {
        setWhatsappLoading(false);
        return;
      }

      setWhatsappLoading(true);

      try {
        const config = await WhatsappConfigService.buscar();
        if (config) {
          setWhatsappValue("provider", config.provider);
          setWhatsappValue("api_url", config.api_url);
          setWhatsappHasToken(!!config.has_token);
        }
      } catch (error) {
        console.error("Erro ao carregar config WhatsApp:", error);
      } finally {
        setWhatsappLoading(false);
      }
    }

    void loadWhatsappConfig();
  }, [canConfigureWhatsapp, setWhatsappValue, accessStatus?.active_profile_id]);

  useEffect(() => {
    if (!canConfigureIntegrations) {
      setTab("seguranca");
    }
  }, [canConfigureIntegrations]);

  useEffect(() => {
    if (!accessStatus?.profiles.length) {
      setManagedProfileId(null);
      return;
    }

    setManagedProfileId((current) => {
      if (current && accessStatus.profiles.some((profile) => profile.id === current)) {
        return current;
      }

      return accessStatus.active_profile_id ?? accessStatus.profiles[0].id;
    });
  }, [accessStatus]);

  useEffect(() => {
    if (!managedProfile) {
      return;
    }

    setEditProfileName(managedProfile.nome);
    setEditProfileRole(managedProfile.role === "ADMIN" ? "ADMIN" : "CUSTOM");
    setEditPermissions(managedProfile.permissions);
    setResetPin("");
    setResetPinConfirm("");
  }, [managedProfile?.id]);

  useEffect(() => {
    void loadAuditEvents();
  }, [canManageProfiles, accessStatus?.active_profile_id]);

  useEffect(() => {
    void loadProfilesCatalog();
  }, [canManageProfiles, accessStatus?.active_profile_id]);

  useEffect(() => {
    void loadSchemaStatus();
  }, []);

  useEffect(() => {
    void loadBackupToolsStatus();
  }, [canManageProfiles, accessStatus?.active_profile_id]);

  async function onSubmit(values: SmtpFormValues) {
    setSaving(true);
    setStatus(null);
    try {
      const payload: SmtpConfigInput = {
        host: values.host.trim(),
        port: Number(values.port),
        username: values.username.trim(),
        from_name: values.from_name.trim(),
        from_email: values.from_email.trim(),
        use_tls: values.use_tls,
        password: values.password.trim() || undefined,
      };

      await SmtpConfigService.salvar(payload);
      setHasPassword(!!payload.password || hasPassword);
      setStatus("Configuracao SMTP salva com sucesso.");
    } catch (error: any) {
      const msg = typeof error === "string" ? error : (error?.message || "Falha ao salvar configuracao SMTP.");
      setStatus(msg);
    } finally {
      setSaving(false);
    }
  }

  async function onSubmitWhatsapp(values: WhatsappFormValues) {
    setSavingWhatsapp(true);
    setWhatsappStatus(null);

    try {
      const payload: WhatsappConfigInput = {
        provider: "EVOLUTION",
        api_url: values.api_url.trim(),
        token: values.token.trim() || undefined,
      };

      await WhatsappConfigService.salvar(payload);
      setWhatsappHasToken(!!payload.token || whatsappHasToken);
      setWhatsappStatus("Configuração do WhatsApp salva com sucesso.");
    } catch (error: any) {
      const msg = typeof error === "string" ? error : (error?.message || "Falha ao salvar configuração do WhatsApp.");
      setWhatsappStatus(msg);
    } finally {
      setSavingWhatsapp(false);
    }
  }

  async function atualizarEstadoSeguranca() {
    await refreshStatus();
    await loadAuditEvents();
    await loadProfilesCatalog();
    await loadSchemaStatus();
    await loadBackupToolsStatus();
  }

  async function abrirPastaBackups() {
    setBackupError(null);

    try {
      let nextStatus = backupToolsStatus;
      if (!nextStatus) {
        nextStatus = await db.obterStatusFerramentasBackupPostgres();
        setBackupToolsStatus(nextStatus);
      }

      await open(nextStatus.backup_directory);
    } catch (error: any) {
      setBackupError(error?.message || error?.toString() || "Falha ao abrir a pasta de backup.");
    }
  }

  async function gerarBackupBanco() {
    setBackupBusy(true);
    setBackupError(null);
    setBackupMessage(null);

    try {
      const result = await db.gerarBackupPostgres();
      setBackupMessage(`Backup gerado com sucesso em ${result.file_path}.`);
      await loadBackupToolsStatus();
    } catch (error: any) {
      setBackupError(error?.message || error?.toString() || "Falha ao gerar o backup PostgreSQL.");
    } finally {
      setBackupBusy(false);
      await loadAuditEvents();
    }
  }

  async function restaurarBackupBanco() {
    if (!restoreFilePath.trim()) {
      setRestoreError("Informe o caminho completo do arquivo de backup.");
      return;
    }

    if (!restoreMode) {
      setRestoreError("Use um arquivo com extensão .dump ou .sql para o restore.");
      return;
    }

    if (restoreConfirmText.trim().toUpperCase() !== "RESTAURAR") {
      setRestoreError("Digite RESTAURAR para confirmar a substituição da base atual.");
      return;
    }

    setRestoreBusy(true);
    setRestoreError(null);
    setRestoreMessage(null);

    try {
      const result = await db.restaurarBackupPostgres(restoreFilePath.trim());
      setRestoreMessage(`Restore concluído via ${result.restored_with} em ${new Date(result.restored_at).toLocaleString("pt-BR")}.`);
      setRestoreConfirmText("");
      await loadSchemaStatus();
      await loadBackupToolsStatus();
    } catch (error: any) {
      setRestoreError(error?.message || error?.toString() || "Falha ao restaurar o backup PostgreSQL.");
    } finally {
      setRestoreBusy(false);
      await loadAuditEvents();
    }
  }

  async function trocarPerfilAtivo(profileId: number) {
    setSecurityBusy(true);
    setSecurityMessage(null);
    try {
      await setActiveProfile(profileId);
      setSecurityMessage("Perfil ativo alterado. O PIN desse perfil será exigido na próxima ação sensível e na próxima abertura do app.");
    } catch (error: any) {
      setSecurityMessage(error?.message || error?.toString() || "Falha ao alterar o perfil ativo.");
    } finally {
      setSecurityBusy(false);
    }
  }

  async function trocarMeuPin() {
    if (newPin.length < 4) {
      setSecurityMessage("O novo PIN deve ter entre 4 e 8 dígitos.");
      return;
    }

    if (newPin !== confirmPin) {
      setSecurityMessage("A confirmação do novo PIN não confere.");
      return;
    }

    setSecurityBusy(true);
    setSecurityMessage(null);
    try {
      await SensitiveAccessService.configurePin(newPin, currentPin || undefined);
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      setSecurityMessage("PIN do perfil ativo atualizado com sucesso.");
      await atualizarEstadoSeguranca();
    } catch (error: any) {
      setSecurityMessage(error?.message || error?.toString() || "Falha ao atualizar o PIN do perfil ativo.");
    } finally {
      setSecurityBusy(false);
    }
  }

  async function salvarPerfilAtual() {
    if (!managedProfileId) return;

    const permissions = permissionsForRole(editProfileRole, editPermissions);
    setSecurityBusy(true);
    setSecurityMessage(null);
    try {
      await SensitiveAccessService.updateProfile(managedProfileId, {
        nome: editProfileName.trim(),
        role: editProfileRole,
        permissions,
      });
      setSecurityMessage("Perfil atualizado com sucesso.");
      await atualizarEstadoSeguranca();
    } catch (error: any) {
      setSecurityMessage(error?.message || error?.toString() || "Falha ao atualizar o perfil.");
    } finally {
      setSecurityBusy(false);
    }
  }

  async function criarPerfil() {
    if (newProfilePin.length < 4) {
      setSecurityMessage("O PIN inicial do novo perfil deve ter entre 4 e 8 dígitos.");
      return;
    }

    if (newProfilePin !== newProfilePinConfirm) {
      setSecurityMessage("A confirmação do PIN do novo perfil não confere.");
      return;
    }

    const permissions = permissionsForRole(newProfileRole, newProfilePermissions);
    setSecurityBusy(true);
    setSecurityMessage(null);
    try {
      await SensitiveAccessService.createProfile({
        nome: newProfileName.trim(),
        role: newProfileRole,
        permissions,
      }, newProfilePin);
      setNewProfileName("");
      setNewProfileRole("CUSTOM");
      setNewProfilePermissions([]);
      setNewProfilePin("");
      setNewProfilePinConfirm("");
      setSecurityMessage("Novo perfil criado com sucesso.");
      await atualizarEstadoSeguranca();
    } catch (error: any) {
      setSecurityMessage(error?.message || error?.toString() || "Falha ao criar o perfil.");
    } finally {
      setSecurityBusy(false);
    }
  }

  async function resetarPinPerfil() {
    if (!managedProfileId) return;

    if (resetPin.length < 4) {
      setSecurityMessage("O novo PIN deve ter entre 4 e 8 dígitos.");
      return;
    }

    if (resetPin !== resetPinConfirm) {
      setSecurityMessage("A confirmação do reset de PIN não confere.");
      return;
    }

    setSecurityBusy(true);
    setSecurityMessage(null);
    try {
      await SensitiveAccessService.resetProfilePin(managedProfileId, resetPin);
      setResetPin("");
      setResetPinConfirm("");
      setSecurityMessage("PIN do perfil selecionado redefinido com sucesso.");
      await atualizarEstadoSeguranca();
    } catch (error: any) {
      setSecurityMessage(error?.message || error?.toString() || "Falha ao redefinir o PIN do perfil.");
    } finally {
      setSecurityBusy(false);
    }
  }

  async function desativarPerfilSelecionado() {
    if (!managedProfileId) return;

    setSecurityBusy(true);
    setSecurityMessage(null);
    try {
      await SensitiveAccessService.deactivateProfile(managedProfileId);
      setSecurityMessage("Perfil desativado com sucesso.");
      await atualizarEstadoSeguranca();
    } catch (error: any) {
      setSecurityMessage(error?.message || error?.toString() || "Falha ao desativar o perfil selecionado.");
    } finally {
      setSecurityBusy(false);
    }
  }

  async function reativarPerfilSelecionado() {
    if (!managedProfileId) return;

    setSecurityBusy(true);
    setSecurityMessage(null);
    try {
      await SensitiveAccessService.reactivateProfile(managedProfileId);
      setSecurityMessage("Perfil reativado com sucesso.");
      await atualizarEstadoSeguranca();
    } catch (error: any) {
      setSecurityMessage(error?.message || error?.toString() || "Falha ao reativar o perfil selecionado.");
    } finally {
      setSecurityBusy(false);
    }
  }

  async function exportarAuditoriaCsv() {
    if (!filteredAuditEvents.length) {
      setSecurityMessage("Nenhum evento de auditoria corresponde aos filtros atuais.");
      return;
    }

    const escapeCsv = (value: unknown) => {
      const text = value == null ? "" : String(value);
      return `"${text.replace(/"/g, '""')}"`;
    };

    const lines = [
      ["id", "evento", "perfil", "sucesso", "detalhes", "data"].map(escapeCsv).join(","),
      ...filteredAuditEvents.map((event) => [
        event.id,
        event.event_type,
        event.profile_name || "sistema",
        event.success ? "sucesso" : "falha",
        event.details || "",
        event.created_at || "",
      ].map(escapeCsv).join(",")),
    ];

    const bytes = Array.from(new TextEncoder().encode(`\uFEFF${lines.join("\n")}`));
    const timestamp = new Date().toISOString().replace(/[.:]/g, "-");

    try {
      await db.salvarArquivoTemp(bytes, `auditoria-seguranca-${timestamp}.csv`);
      await SensitiveAccessService.registerAuditExport({
        search: auditSearch.trim() || undefined,
        outcome: auditOutcomeFilter === "ALL" ? undefined : auditOutcomeFilter,
        profileId: auditProfileFilter === "ALL" ? undefined : Number(auditProfileFilter),
        exportedCount: filteredAuditEvents.length,
      });
      setSecurityMessage("CSV da auditoria exportado para a pasta temporária do app.");
    } catch (error: any) {
      setSecurityMessage(error?.message || error?.toString() || "Falha ao exportar a auditoria.");
    }
  }

  if ((canConfigureSmtp && loading) || (canConfigureWhatsapp && whatsappLoading)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configuracoes</h1>
        <p className="text-muted-foreground">Defina parametros do sistema e integracoes.</p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="smtp" disabled={!canConfigureIntegrations}>Integracoes</TabsTrigger>
          <TabsTrigger value="seguranca">Seguranca</TabsTrigger>
        </TabsList>

        <TabsContent value="smtp" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>SMTP (Email Real)</CardTitle>
              <CardDescription>Credenciais e parametros de envio protegidos por permissao de SMTP.</CardDescription>
            </CardHeader>
            <CardContent>
              {canConfigureSmtp ? (
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="host">Host</Label>
                      <Input id="host" placeholder="smtp.gmail.com" {...register("host")} />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="port">Porta</Label>
                      <Input id="port" type="number" min={1} max={65535} {...register("port", { valueAsNumber: true })} />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="username">Usuario</Label>
                      <Input id="username" placeholder="email@dominio.com" {...register("username")} />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="from_name">Nome do Remetente</Label>
                      <Input id="from_name" placeholder="BMITAG" {...register("from_name")} />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="from_email">Email do Remetente</Label>
                      <Input id="from_email" placeholder="contato@dominio.com" {...register("from_email")} />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password">Senha / App Password</Label>
                      <Input id="password" type="password" placeholder={hasPassword ? "Senha ja configurada" : "Digite a senha"} {...register("password")} />
                      {hasPassword && (
                        <p className="text-xs text-muted-foreground">Deixe em branco para manter a senha atual.</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Controller
                      name="use_tls"
                      control={control}
                      render={({ field }) => (
                        <Checkbox checked={field.value} onCheckedChange={(value) => field.onChange(!!value)} />
                      )}
                    />
                    <Label>Usar TLS/STARTTLS</Label>
                  </div>

                  {status && (
                    <p className="text-sm text-muted-foreground">{status}</p>
                  )}

                  <div className="flex justify-end">
                    <Button type="submit" disabled={saving}>
                      {saving ? "Salvando..." : "Salvar configuracao"}
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  O perfil ativo nao possui permissao para configurar SMTP. Troque para um perfil com essa permissao para editar este bloco.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>WhatsApp API</CardTitle>
              <CardDescription>
                Provider padrao: Evolution API self-hosted. Configure a URL completa do endpoint de envio e o token da API.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {canConfigureWhatsapp ? (
                <form onSubmit={handleSubmitWhatsapp(onSubmitWhatsapp)} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="whatsapp-provider">Provider</Label>
                      <Input id="whatsapp-provider" readOnly {...registerWhatsapp("provider")} />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="whatsapp-api-url">API URL</Label>
                      <Input
                        id="whatsapp-api-url"
                        placeholder="http://localhost:8080/message/sendText/minha-instancia"
                        {...registerWhatsapp("api_url")}
                      />
                      <p className="text-xs text-muted-foreground">
                        Informe a URL final do endpoint sendText da sua instância Evolution.
                      </p>
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="whatsapp-token">Token da API</Label>
                      <Input
                        id="whatsapp-token"
                        type="password"
                        placeholder={whatsappHasToken ? "Token ja configurado" : "Digite o token da API"}
                        {...registerWhatsapp("token")}
                      />
                      {whatsappHasToken && (
                        <p className="text-xs text-muted-foreground">Deixe em branco para manter o token atual.</p>
                      )}
                    </div>
                  </div>

                  {whatsappStatus && (
                    <p className="text-sm text-muted-foreground">{whatsappStatus}</p>
                  )}

                  <div className="flex justify-end">
                    <Button type="submit" disabled={savingWhatsapp}>
                      {savingWhatsapp ? "Salvando..." : "Salvar configuracao"}
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  O perfil ativo nao possui permissao para configurar a API de WhatsApp. Troque para um perfil com essa permissao para editar este bloco.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="seguranca" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Banco e schema</CardTitle>
              <CardDescription>
                Painel de conferência da versão do schema aplicada no PostgreSQL e das migrações conhecidas pelo AutoOS.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {schemaLoading && !schemaStatus ? (
                <div className="flex items-center justify-center h-24">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                </div>
              ) : schemaError ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  {schemaError}
                </div>
              ) : schemaStatus ? (
                <>
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                      <div className="text-muted-foreground">Banco</div>
                      <div className="font-medium">{schemaStatus.database_name}</div>
                      <div className="text-xs text-muted-foreground">schema {schemaStatus.schema_name}</div>
                    </div>
                    <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                      <div className="text-muted-foreground">Versão aplicada</div>
                      <div className="font-medium">{schemaStatus.latest_applied_version ?? "—"}</div>
                    </div>
                    <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                      <div className="text-muted-foreground">Versão conhecida</div>
                      <div className="font-medium">{schemaStatus.latest_known_version ?? "—"}</div>
                    </div>
                    <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                      <div className="text-muted-foreground">Migrações</div>
                      <div className="font-medium">{schemaStatus.applied_count} de {schemaStatus.known_count}</div>
                      <div className={`text-xs ${schemaStatus.pending_count === 0 ? "text-emerald-600" : "text-amber-600"}`}>
                        {schemaStatus.pending_count === 0 ? "schema atualizado" : `${schemaStatus.pending_count} pendente(s)`}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {schemaStatus.migrations.map((migration) => (
                      <div key={migration.version} className="rounded-lg border p-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium">v{migration.version} • {migration.description}</div>
                          <span className={migration.applied && migration.success ? "text-emerald-600" : "text-amber-600"}>
                            {migration.applied && migration.success ? "aplicada" : "pendente"}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {migration.installed_on ? `Instalada em ${new Date(migration.installed_on).toLocaleString("pt-BR")}` : "Ainda não aplicada neste banco"}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}

              <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={() => void loadSchemaStatus()} disabled={schemaLoading}>
                  {schemaLoading ? "Atualizando..." : "Atualizar status do schema"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Backup e restore do banco</CardTitle>
              <CardDescription>
                Gera backup .dump, valida pg_dump, pg_restore e psql, e permite restore manual com confirmação explícita.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!canManageProfiles ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  O perfil ativo nao possui permissao para validar ferramentas, gerar backups ou executar restore do banco.
                </div>
              ) : (
                <>
                  {backupLoading && !backupToolsStatus ? (
                    <div className="flex items-center justify-center h-24">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                    </div>
                  ) : backupToolsStatus ? (
                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                        <div className="text-muted-foreground">Banco</div>
                        <div className="font-medium">{backupToolsStatus.database_name}</div>
                      </div>
                      <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                        <div className="text-muted-foreground">Host</div>
                        <div className="font-medium">
                          {backupToolsStatus.host || "localhost"}
                          {backupToolsStatus.port ? `:${backupToolsStatus.port}` : ""}
                        </div>
                      </div>
                      <div className="rounded-lg border bg-muted/40 p-4 text-sm md:col-span-2">
                        <div className="text-muted-foreground">Pasta de backup</div>
                        <div className="font-medium break-all">{backupToolsStatus.backup_directory}</div>
                      </div>
                      <div className="rounded-lg border bg-muted/40 p-4 text-sm md:col-span-4">
                        <div className="text-muted-foreground mb-2">Ferramentas PostgreSQL</div>
                        <div className="grid gap-2 md:grid-cols-3">
                          <div className={backupToolsStatus.pg_dump_available ? "text-emerald-600" : "text-amber-600"}>
                            pg_dump: {backupToolsStatus.pg_dump_available ? "disponivel" : "ausente"}
                          </div>
                          <div className={backupToolsStatus.pg_restore_available ? "text-emerald-600" : "text-amber-600"}>
                            pg_restore: {backupToolsStatus.pg_restore_available ? "disponivel" : "ausente"}
                          </div>
                          <div className={backupToolsStatus.psql_available ? "text-emerald-600" : "text-amber-600"}>
                            psql: {backupToolsStatus.psql_available ? "disponivel" : "ausente"}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {backupError && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      {backupError}
                    </div>
                  )}

                  {backupMessage && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                      {backupMessage}
                    </div>
                  )}

                  <div className="flex flex-wrap justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => void loadBackupToolsStatus()} disabled={backupLoading || backupBusy || restoreBusy}>
                      {backupLoading ? "Validando..." : "Validar ferramentas"}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => void abrirPastaBackups()} disabled={backupBusy || restoreBusy}>
                      Abrir pasta de backup
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void gerarBackupBanco()}
                      disabled={backupBusy || backupLoading || restoreBusy || !backupToolsStatus?.pg_dump_available}
                    >
                      {backupBusy ? "Gerando backup..." : "Gerar backup agora"}
                    </Button>
                  </div>

                  <div className="space-y-4 border-t pt-4">
                    <div>
                      <div className="font-medium">Restore manual</div>
                      <p className="text-sm text-muted-foreground">
                        Use apenas em manutenção controlada. O restore substitui os dados atuais do banco configurado na DATABASE_URL.
                      </p>
                    </div>

                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      Aceita arquivos .dump via pg_restore e .sql via psql. Feche outras rotinas operacionais antes de restaurar.
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="restore-file-path">Caminho do arquivo de backup</Label>
                        <Input
                          id="restore-file-path"
                          placeholder="C:/Users/Usuario/Documents/AutoOS/backups/autoos-20260406-153000.dump"
                          value={restoreFilePath}
                          onChange={(event) => setRestoreFilePath(event.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Informe o caminho absoluto completo. O app aceita somente .dump e .sql.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="restore-confirm-text">Confirmação</Label>
                        <Input
                          id="restore-confirm-text"
                          placeholder="Digite RESTAURAR"
                          value={restoreConfirmText}
                          onChange={(event) => setRestoreConfirmText(event.target.value.toUpperCase())}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Ferramenta detectada</Label>
                        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                          {restoreMode === "pg_restore"
                            ? "pg_restore (.dump)"
                            : restoreMode === "psql"
                              ? "psql (.sql)"
                              : "aguardando arquivo .dump ou .sql"}
                        </div>
                      </div>
                    </div>

                    {restoreError && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                        {restoreError}
                      </div>
                    )}

                    {restoreMessage && (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                        {restoreMessage}
                      </div>
                    )}

                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() => void restaurarBackupBanco()}
                        disabled={
                          restoreBusy
                          || backupBusy
                          || backupLoading
                          || !restoreMode
                          || !restoreReady
                          || !restoreFilePath.trim()
                          || restoreConfirmText.trim().toUpperCase() !== "RESTAURAR"
                        }
                      >
                        {restoreBusy ? "Restaurando backup..." : "Restaurar backup agora"}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Perfil ativo</CardTitle>
              <CardDescription>
                O acesso sensivel atual esta associado ao perfil {accessStatus?.active_profile_name || "selecionado"}.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                <div className="font-medium">{accessStatus?.active_profile_name || "Perfil sem nome"}</div>
                <div className="text-muted-foreground">Papel: {accessStatus?.active_role || "-"}</div>
                <div className="mt-2 text-muted-foreground">
                  Permissoes: {accessStatus?.permissions.length ? accessStatus.permissions.join(", ") : "nenhuma"}
                </div>
                <div className="mt-4 space-y-2">
                  <Label>Selecionar perfil da sessão</Label>
                  <Select
                    value={accessStatus?.active_profile_id ? String(accessStatus.active_profile_id) : undefined}
                    onValueChange={(value) => void trocarPerfilAtivo(Number(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um perfil" />
                    </SelectTrigger>
                    <SelectContent>
                      {accessStatus?.profiles.map((profile) => (
                        <SelectItem key={`active-${profile.id}`} value={String(profile.id)}>
                          {profile.nome} ({profile.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    A troca do perfil ativo encerra o desbloqueio atual e passa a usar o PIN do perfil escolhido.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="current-pin">PIN atual</Label>
                  <Input id="current-pin" type="password" inputMode="numeric" value={currentPin} onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, "").slice(0, 8))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-pin">Novo PIN</Label>
                  <Input id="new-pin" type="password" inputMode="numeric" value={newPin} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, "").slice(0, 8))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-new-pin">Confirmar novo PIN</Label>
                  <Input id="confirm-new-pin" type="password" inputMode="numeric" value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 8))} />
                </div>
                <div className="flex justify-end">
                  <Button type="button" onClick={() => void trocarMeuPin()} disabled={securityBusy}>
                    {securityBusy ? "Processando..." : "Trocar meu PIN"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {canManageProfiles && (
            <Card>
              <CardHeader>
                <CardTitle>Perfis e permissoes</CardTitle>
                <CardDescription>Crie perfis locais, ajuste permissoes sensiveis e redefina PINs quando necessario.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Perfil para editar</Label>
                    <Select value={managedProfileId ? String(managedProfileId) : undefined} onValueChange={(value) => setManagedProfileId(Number(value))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um perfil" />
                      </SelectTrigger>
                      <SelectContent>
                        {profilesCatalog.map((profile) => (
                          <SelectItem key={profile.id} value={String(profile.id)}>
                            {profile.nome} ({profile.role}){profile.ativo ? "" : " • inativo"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-profile-name">Nome</Label>
                    <Input id="edit-profile-name" value={editProfileName} onChange={(event) => setEditProfileName(event.target.value)} />
                    {managedProfile && (
                      <p className="text-xs text-muted-foreground">
                        {managedProfile.pin_configured ? "PIN configurado" : "PIN pendente"}
                        {managedProfile.ativo ? "" : " • perfil inativo"}
                        {managedProfile.is_default ? " • perfil ativo padrão" : ""}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Papel</Label>
                    <Select value={editProfileRole} onValueChange={(value) => {
                      setEditProfileRole(value);
                      if (value === "ADMIN") {
                        setEditPermissions(permissionOptions);
                      }
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um papel" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ADMIN">ADMIN</SelectItem>
                        <SelectItem value="CUSTOM">CUSTOM</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
                    O perfil ADMIN recebe todas as permissoes automaticamente. No papel CUSTOM, voce escolhe cada permissao abaixo.
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {permissionOptions.map((permission) => (
                    <label key={permission} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                      <Checkbox
                        checked={editProfileRole === "ADMIN" ? true : editPermissions.includes(permission)}
                        disabled={editProfileRole === "ADMIN" || !managedProfile?.ativo}
                        onCheckedChange={() => togglePermission(editPermissions, permission, setEditPermissions)}
                      />
                      <span>{SENSITIVE_PERMISSION_LABELS[permission]}</span>
                    </label>
                  ))}
                </div>

                <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-center">
                  {managedProfile?.ativo ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="border-red-200 text-red-700 hover:bg-red-50"
                      onClick={() => void desativarPerfilSelecionado()}
                      disabled={securityBusy || !managedProfileId}
                    >
                      Desativar perfil
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                      onClick={() => void reativarPerfilSelecionado()}
                      disabled={securityBusy || !managedProfileId}
                    >
                      Reativar perfil
                    </Button>
                  )}
                  <Button type="button" onClick={() => void salvarPerfilAtual()} disabled={securityBusy || !managedProfileId || !managedProfile?.ativo}>
                    {securityBusy ? "Salvando..." : "Salvar perfil"}
                  </Button>
                </div>

                <div className="border-t pt-6 space-y-4">
                  <h3 className="text-lg font-semibold">Resetar PIN do perfil selecionado</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="reset-pin">Novo PIN</Label>
                      <Input id="reset-pin" type="password" inputMode="numeric" value={resetPin} onChange={(event) => setResetPin(event.target.value.replace(/\D/g, "").slice(0, 8))} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reset-pin-confirm">Confirmar novo PIN</Label>
                      <Input id="reset-pin-confirm" type="password" inputMode="numeric" value={resetPinConfirm} onChange={(event) => setResetPinConfirm(event.target.value.replace(/\D/g, "").slice(0, 8))} />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button type="button" variant="outline" onClick={() => void resetarPinPerfil()} disabled={securityBusy || !managedProfileId || !managedProfile?.ativo}>
                      Redefinir PIN do perfil
                    </Button>
                  </div>
                </div>

                <div className="border-t pt-6 space-y-4">
                  <h3 className="text-lg font-semibold">Criar novo perfil</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="new-profile-name">Nome</Label>
                      <Input id="new-profile-name" value={newProfileName} onChange={(event) => setNewProfileName(event.target.value)} placeholder="Ex.: Estoque Local" />
                    </div>
                    <div className="space-y-2">
                      <Label>Papel</Label>
                      <Select value={newProfileRole} onValueChange={(value) => {
                        setNewProfileRole(value);
                        if (value === "ADMIN") {
                          setNewProfilePermissions(permissionOptions);
                        }
                      }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um papel" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ADMIN">ADMIN</SelectItem>
                          <SelectItem value="CUSTOM">CUSTOM</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    {permissionOptions.map((permission) => (
                      <label key={`new-${permission}`} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                        <Checkbox
                          checked={newProfileRole === "ADMIN" ? true : newProfilePermissions.includes(permission)}
                          disabled={newProfileRole === "ADMIN"}
                          onCheckedChange={() => togglePermission(newProfilePermissions, permission, setNewProfilePermissions)}
                        />
                        <span>{SENSITIVE_PERMISSION_LABELS[permission]}</span>
                      </label>
                    ))}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="new-profile-pin">PIN inicial</Label>
                      <Input id="new-profile-pin" type="password" inputMode="numeric" value={newProfilePin} onChange={(event) => setNewProfilePin(event.target.value.replace(/\D/g, "").slice(0, 8))} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-profile-pin-confirm">Confirmar PIN inicial</Label>
                      <Input id="new-profile-pin-confirm" type="password" inputMode="numeric" value={newProfilePinConfirm} onChange={(event) => setNewProfilePinConfirm(event.target.value.replace(/\D/g, "").slice(0, 8))} />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button type="button" onClick={() => void criarPerfil()} disabled={securityBusy}>
                      Criar perfil
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {canManageProfiles && (
            <Card>
              <CardHeader>
                <CardTitle>Auditoria recente</CardTitle>
                <CardDescription>Eventos sensiveis recentes de desbloqueio, troca de PIN e gestao de perfis.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-4 mb-4">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="audit-search">Buscar evento</Label>
                    <Input
                      id="audit-search"
                      value={auditSearch}
                      onChange={(event) => setAuditSearch(event.target.value)}
                      placeholder="Evento, perfil ou detalhe"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Resultado</Label>
                    <Select value={auditOutcomeFilter} onValueChange={setAuditOutcomeFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">Todos</SelectItem>
                        <SelectItem value="SUCCESS">Somente sucesso</SelectItem>
                        <SelectItem value="FAILED">Somente falha</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Perfil</Label>
                    <Select value={auditProfileFilter} onValueChange={setAuditProfileFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Todos os perfis" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">Todos os perfis</SelectItem>
                        {auditProfileOptions.map(([profileId, profileName]) => (
                          <SelectItem key={`audit-${profileId}`} value={profileId}>
                            {profileName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex justify-end mb-4">
                  <Button type="button" variant="outline" onClick={() => void exportarAuditoriaCsv()}>
                    Exportar CSV filtrado
                  </Button>
                </div>

                <div className="space-y-3">
                  {filteredAuditEvents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum evento de auditoria encontrado para os filtros atuais.</p>
                  ) : filteredAuditEvents.map((event) => (
                    <div key={event.id} className="rounded-lg border p-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium">{event.event_type}</div>
                        <span className={event.success ? "text-emerald-600" : "text-red-600"}>
                          {event.success ? "sucesso" : "falha"}
                        </span>
                      </div>
                      <div className="text-muted-foreground">Perfil: {event.profile_name || "sistema"}</div>
                      {event.details && <div className="text-muted-foreground">{event.details}</div>}
                      <div className="text-xs text-muted-foreground mt-1">
                        {event.created_at ? new Date(event.created_at).toLocaleString("pt-BR") : "sem data"}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {securityMessage && (
            <p className="text-sm text-muted-foreground">{securityMessage}</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
