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
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db } from "@/lib/db";
import { SmtpConfigService } from "@/lib/smtp-config";
import { WhatsappConfigService } from "@/lib/whatsapp-config";
import { SensitiveAccessService } from "@/lib/sensitive-access";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { ConfiguracoesTabInfra } from "@/pages/configuracoes/ConfiguracoesTabInfra";
import { ConfiguracoesTabIntegracoes } from "@/pages/configuracoes/ConfiguracoesTabIntegracoes";
import { ConfiguracoesTabObservabilidade } from "@/pages/configuracoes/ConfiguracoesTabObservabilidade";
import { ConfiguracoesTabSeguranca } from "@/pages/configuracoes/ConfiguracoesTabSeguranca";
import { SMTP_DEFAULTS, type SmtpFormValues, type WhatsappFormValues } from "@/pages/configuracoes/configuracoes-shared";
import { detectRestoreMode } from "@/pages/configuracoes/detect-restore-mode";
import {
  SENSITIVE_PERMISSIONS,
  type DatabaseSchemaStatus,
  type LocalSupportBundleResult,
  type LocalSupportStatus,
  type PostgresBackupToolsStatus,
  type SecurityAuditEvent,
  type SecurityProfile,
  type SensitivePermission,
  type SmtpConfigInput,
  type WhatsappConfigInput,
} from "@/types";

export default function Configuracoes() {
  const { status: accessStatus, refreshStatus, hasPermission, setActiveProfile, ensureSensitiveAccess } = useSensitiveAccess();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [smtpEditUnlocked, setSmtpEditUnlocked] = useState(false);
  const [whatsappLoading, setWhatsappLoading] = useState(true);
  const [savingWhatsapp, setSavingWhatsapp] = useState(false);
  const [whatsappHasToken, setWhatsappHasToken] = useState(false);
  const [whatsappStatus, setWhatsappStatus] = useState<string | null>(null);
  const [securityMessage, setSecurityMessage] = useState<string | null>(null);
  const [securityAdminUnlocked, setSecurityAdminUnlocked] = useState(false);
  const [tab, setTab] = useState("smtp");
  const [auditEvents, setAuditEvents] = useState<SecurityAuditEvent[]>([]);
  const [profilesCatalog, setProfilesCatalog] = useState<SecurityProfile[]>([]);
  const [securityBusy, setSecurityBusy] = useState(false);
  const [inactivityLockEnabled, setInactivityLockEnabled] = useState(false);
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
  const [newProfileNoPin, setNewProfileNoPin] = useState(false);
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
  const [supportStatus, setSupportStatus] = useState<LocalSupportStatus | null>(null);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportBusy, setSupportBusy] = useState(false);
  const [supportError, setSupportError] = useState<string | null>(null);
  const [supportMessage, setSupportMessage] = useState<string | null>(null);

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
      ...SMTP_DEFAULTS,
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

  async function loadSupportStatus() {
    if (!canManageProfiles) {
      setSupportStatus(null);
      setSupportError(null);
      return;
    }

    setSupportLoading(true);
    setSupportError(null);
    try {
      const nextStatus = await db.obterDiagnosticoSuporteLocal();
      setSupportStatus(nextStatus);
    } catch (error: any) {
      setSupportStatus(null);
      setSupportError(error?.message || error?.toString() || "Falha ao montar o diagnóstico local de suporte.");
    } finally {
      setSupportLoading(false);
    }
  }

  async function loadInactivityConfig() {
    try {
      const config = await db.verificarConfigInatividade();
      setInactivityLockEnabled(config.inactivity_lock_enabled);
    } catch (error: any) {
      setSecurityMessage(error?.message || error?.toString() || "Falha ao carregar configuração de inatividade.");
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
        } else {
          setValue("host", SMTP_DEFAULTS.host);
          setValue("port", SMTP_DEFAULTS.port);
          setValue("username", SMTP_DEFAULTS.username);
          setValue("from_name", SMTP_DEFAULTS.from_name);
          setValue("from_email", SMTP_DEFAULTS.from_email);
          setValue("use_tls", SMTP_DEFAULTS.use_tls);
          setHasPassword(false);
        }
      } catch (error) {
        console.error("Erro ao carregar config SMTP:", error);
        setValue("host", SMTP_DEFAULTS.host);
        setValue("port", SMTP_DEFAULTS.port);
        setValue("username", SMTP_DEFAULTS.username);
        setValue("from_name", SMTP_DEFAULTS.from_name);
        setValue("from_email", SMTP_DEFAULTS.from_email);
        setValue("use_tls", SMTP_DEFAULTS.use_tls);
        setHasPassword(false);
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

  useEffect(() => {
    void loadSupportStatus();
  }, [canManageProfiles, accessStatus?.active_profile_id]);

  useEffect(() => {
    void loadInactivityConfig();
  }, [canManageProfiles, accessStatus?.active_profile_id]);

  async function onSubmit(values: SmtpFormValues) {
    if (!smtpEditUnlocked) {
      setStatus("Libere a edição com PIN de administrador para alterar a configuração SMTP.");
      return;
    }

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

  async function handleSmtpEditToggle(nextValue: boolean) {
    if (!nextValue) {
      setSmtpEditUnlocked(false);
      return;
    }

    const liberado = await ensureSensitiveAccess({
      title: "Liberar edição de SMTP",
      description: "Informe o PIN para permitir alterações na configuração padrão de SMTP.",
      permission: SENSITIVE_PERMISSIONS.CONFIG_SMTP,
    });

    if (!liberado) {
      setSmtpEditUnlocked(false);
      setStatus("Edição SMTP não liberada. PIN/Admin necessário.");
      return;
    }

    setSmtpEditUnlocked(true);
    setStatus("Edição SMTP liberada para esta sessão.");
  }

  async function onSubmitWhatsapp(values: WhatsappFormValues) {
    const liberado = await ensureSensitiveAccess({
      title: "Salvar configuração do WhatsApp",
      description: "Informe o PIN para salvar credenciais e parâmetros do WhatsApp.",
      permission: SENSITIVE_PERMISSIONS.CONFIG_WHATSAPP,
    });
    if (!liberado) {
      setWhatsappStatus("Salvamento do WhatsApp não autorizado. PIN/permissão necessários.");
      return;
    }

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
    await loadSupportStatus();
  }

  async function gerarBackupBanco() {
    const liberado = await ensureSensitiveAccess({
      title: "Gerar backup do banco",
      description: "Informe o PIN de administrador para gerar um backup PostgreSQL.",
      permission: SENSITIVE_PERMISSIONS.MANAGE_PROFILES,
    });
    if (!liberado) {
      return;
    }

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

    const liberado = await ensureSensitiveAccess({
      title: "Restaurar backup do banco",
      description: "Informe o PIN de administrador para restaurar um backup PostgreSQL.",
      permission: SENSITIVE_PERMISSIONS.MANAGE_PROFILES,
    });
    if (!liberado) {
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
    const liberado = await ensureSensitiveAccess({
      title: "Trocar perfil ativo",
      description: "Informe o PIN de administrador para alterar o perfil de segurança ativo.",
      permission: SENSITIVE_PERMISSIONS.MANAGE_PROFILES,
    });
    if (!liberado) {
      return;
    }

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
    if (!securityAdminUnlocked) {
      setSecurityMessage("Desbloqueie a gestão de segurança com PIN/Admin para alterar PINs e perfis.");
      return;
    }

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
    if (!securityAdminUnlocked) {
      setSecurityMessage("Desbloqueie a gestão de segurança com PIN/Admin para alterar perfis.");
      return;
    }

    if (editProfileRole === "CUSTOM" && editPermissions.length === 0) {
      setSecurityMessage("Um perfil CUSTOM deve ter pelo menos uma permissão.");
      return;
    }

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
    if (!securityAdminUnlocked) {
      setSecurityMessage("Desbloqueie a gestão de segurança com PIN/Admin para criar perfis.");
      return;
    }

    const skipPin = newProfileRole === "CUSTOM" && newProfileNoPin;

    if (!skipPin && newProfilePin.length < 4) {
      setSecurityMessage("O PIN inicial do novo perfil deve ter entre 4 e 8 dígitos.");
      return;
    }

    if (!skipPin && newProfilePin !== newProfilePinConfirm) {
      setSecurityMessage("A confirmação do PIN do novo perfil não confere.");
      return;
    }

    if (newProfileRole === "CUSTOM" && newProfilePermissions.length === 0) {
      setSecurityMessage("Um perfil CUSTOM deve ter pelo menos uma permissão.");
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
      }, skipPin ? "" : newProfilePin);
      setNewProfileName("");
      setNewProfileRole("CUSTOM");
      setNewProfilePermissions([]);
      setNewProfilePin("");
      setNewProfilePinConfirm("");
      setNewProfileNoPin(false);
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
    if (!securityAdminUnlocked) {
      setSecurityMessage("Desbloqueie a gestão de segurança com PIN/Admin para resetar PINs.");
      return;
    }

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
    if (!securityAdminUnlocked) {
      setSecurityMessage("Desbloqueie a gestão de segurança com PIN/Admin para alterar perfis.");
      return;
    }

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
    if (!securityAdminUnlocked) {
      setSecurityMessage("Desbloqueie a gestão de segurança com PIN/Admin para alterar perfis.");
      return;
    }

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

  async function exportarPacoteSuporte() {
    setSupportBusy(true);
    setSupportError(null);
    setSupportMessage(null);
    try {
      const result: LocalSupportBundleResult = await db.exportarPacoteSuporteLocal();
      setSupportMessage(`Pacote de suporte exportado com sucesso em ${result.file_path}.`);
      await loadSupportStatus();
      await loadAuditEvents();
    } catch (error: any) {
      setSupportError(error?.message || error?.toString() || "Falha ao exportar o pacote de suporte local.");
    } finally {
      setSupportBusy(false);
    }
  }

  async function handleSecurityAdminToggle(nextValue: boolean) {
    if (!nextValue) {
      setSecurityAdminUnlocked(false);
      setSecurityMessage("Gestão de segurança bloqueada novamente.");
      return;
    }

    const liberado = await ensureSensitiveAccess({
      title: "Desbloquear gestão de segurança",
      description: "Informe o PIN do administrador para liberar alterações de perfis e PINs.",
      permission: SENSITIVE_PERMISSIONS.MANAGE_PROFILES,
    });

    if (!liberado) {
      setSecurityAdminUnlocked(false);
      setSecurityMessage("Desbloqueio não autorizado. PIN/Admin obrigatório.");
      return;
    }

    setSecurityAdminUnlocked(true);
    setSecurityMessage("Gestão de segurança liberada para esta sessão.");
  }

  async function handleInactivityToggle(enabled: boolean) {
    setSecurityBusy(true);
    try {
      const result = await db.salvarConfigInatividade(enabled);
      setInactivityLockEnabled(result.inactivity_lock_enabled);
      toast.success("Configuração salva");
    } catch (error: any) {
      setSecurityMessage(error?.message || error?.toString() || "Falha ao salvar configuração de inatividade.");
    } finally {
      setSecurityBusy(false);
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
          <TabsTrigger value="infra">Banco</TabsTrigger>
          <TabsTrigger value="seguranca">Seguranca</TabsTrigger>
          {canManageProfiles && <TabsTrigger value="observabilidade">Suporte e Logs</TabsTrigger>}
        </TabsList>

        <ConfiguracoesTabIntegracoes
          canConfigureSmtp={canConfigureSmtp}
          canConfigureWhatsapp={canConfigureWhatsapp}
          register={register}
          handleSubmit={handleSubmit}
          control={control}
          onSubmit={onSubmit}
          saving={saving}
          status={status}
          smtpEditUnlocked={smtpEditUnlocked}
          handleSmtpEditToggle={handleSmtpEditToggle}
          hasPassword={hasPassword}
          registerWhatsapp={registerWhatsapp}
          handleSubmitWhatsapp={handleSubmitWhatsapp}
          onSubmitWhatsapp={onSubmitWhatsapp}
          savingWhatsapp={savingWhatsapp}
          whatsappStatus={whatsappStatus}
          whatsappHasToken={whatsappHasToken}
        />

        <ConfiguracoesTabInfra
          canManageProfiles={canManageProfiles}
          schemaLoading={schemaLoading}
          schemaStatus={schemaStatus}
          schemaError={schemaError}
          loadSchemaStatus={loadSchemaStatus}
          backupLoading={backupLoading}
          backupToolsStatus={backupToolsStatus}
          backupError={backupError}
          backupMessage={backupMessage}
          backupBusy={backupBusy}
          restoreFilePath={restoreFilePath}
          setRestoreFilePath={setRestoreFilePath}
          restoreConfirmText={restoreConfirmText}
          setRestoreConfirmText={setRestoreConfirmText}
          restoreBusy={restoreBusy}
          restoreError={restoreError}
          restoreMessage={restoreMessage}
          restoreMode={restoreMode}
          restoreReady={restoreReady}
          loadBackupToolsStatus={loadBackupToolsStatus}
          gerarBackupBanco={gerarBackupBanco}
          restaurarBackupBanco={restaurarBackupBanco}
        />

        {canManageProfiles && (
          <ConfiguracoesTabObservabilidade
            supportLoading={supportLoading}
            supportStatus={supportStatus}
            supportError={supportError}
            supportMessage={supportMessage}
            supportBusy={supportBusy}
            loadSupportStatus={loadSupportStatus}
            exportarPacoteSuporte={exportarPacoteSuporte}
            auditSearch={auditSearch}
            setAuditSearch={setAuditSearch}
            auditOutcomeFilter={auditOutcomeFilter}
            setAuditOutcomeFilter={setAuditOutcomeFilter}
            auditProfileFilter={auditProfileFilter}
            setAuditProfileFilter={setAuditProfileFilter}
            auditProfileOptions={auditProfileOptions}
            filteredAuditEvents={filteredAuditEvents}
            exportarAuditoriaCsv={exportarAuditoriaCsv}
          />
        )}

        <ConfiguracoesTabSeguranca
          canManageProfiles={canManageProfiles}
          securityAdminUnlocked={securityAdminUnlocked}
          securityBusy={securityBusy}
          handleSecurityAdminToggle={handleSecurityAdminToggle}
          accessStatus={accessStatus}
          trocarPerfilAtivo={trocarPerfilAtivo}
          currentPin={currentPin}
          setCurrentPin={setCurrentPin}
          newPin={newPin}
          setNewPin={setNewPin}
          confirmPin={confirmPin}
          setConfirmPin={setConfirmPin}
          trocarMeuPin={trocarMeuPin}
          managedProfileId={managedProfileId}
          setManagedProfileId={setManagedProfileId}
          profilesCatalog={profilesCatalog}
          managedProfile={managedProfile}
          editProfileName={editProfileName}
          setEditProfileName={setEditProfileName}
          editProfileRole={editProfileRole}
          setEditProfileRole={setEditProfileRole}
          editPermissions={editPermissions}
          setEditPermissions={setEditPermissions}
          permissionOptions={permissionOptions}
          togglePermission={togglePermission}
          desativarPerfilSelecionado={desativarPerfilSelecionado}
          reativarPerfilSelecionado={reativarPerfilSelecionado}
          salvarPerfilAtual={salvarPerfilAtual}
          resetPin={resetPin}
          setResetPin={setResetPin}
          resetPinConfirm={resetPinConfirm}
          setResetPinConfirm={setResetPinConfirm}
          resetarPinPerfil={resetarPinPerfil}
          newProfileName={newProfileName}
          setNewProfileName={setNewProfileName}
          newProfileRole={newProfileRole}
          setNewProfileRole={setNewProfileRole}
          newProfilePermissions={newProfilePermissions}
          setNewProfilePermissions={setNewProfilePermissions}
          newProfilePin={newProfilePin}
          setNewProfilePin={setNewProfilePin}
          newProfilePinConfirm={newProfilePinConfirm}
          setNewProfilePinConfirm={setNewProfilePinConfirm}
          newProfileNoPin={newProfileNoPin}
          setNewProfileNoPin={setNewProfileNoPin}
          criarPerfil={criarPerfil}
          securityMessage={securityMessage}
          inactivityLockEnabled={inactivityLockEnabled}
          onToggleInactivityLock={handleInactivityToggle}
        />

      </Tabs>
    </div>
  );
}
