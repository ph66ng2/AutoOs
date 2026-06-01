import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ShieldAlert, ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileSessionDialog } from "@/components/ProfileSessionDialog";
import { SensitiveAccessService } from "@/lib/sensitive-access";
import {
  SENSITIVE_PERMISSION_LABELS,
  SENSITIVE_PERMISSIONS,
  type SensitiveAccessStatus,
  type SensitivePermission,
} from "@/types";

interface SensitiveAccessPromptOptions {
  title?: string;
  description?: string;
  permission?: SensitivePermission;
}

interface ProfileSelectorOptions {
  title?: string;
  description?: string;
  mandatory?: boolean;
}

type SensitiveDialogMode = "startup" | "selector" | "sensitive";

interface SensitiveAccessContextValue {
  status: SensitiveAccessStatus | null;
  loading: boolean;
  /** 0–100 durante o primeiro arranque (conexão com backend / status sensível). */
  bootProgress: number;
  refreshStatus: () => Promise<void>;
  ensureSensitiveAccess: (options?: SensitiveAccessPromptOptions) => Promise<boolean>;
  openProfileSelector: (options?: ProfileSelectorOptions) => Promise<boolean>;
  lockSensitiveAccess: () => Promise<void>;
  hasPermission: (permission: SensitivePermission) => boolean;
  setActiveProfile: (profileId: number) => Promise<void>;
}

const defaultPrompt: SensitiveAccessPromptOptions = {
  title: "Acesso sensível",
  description: "Informe o PIN para continuar com esta ação.",
};

const EMPTY_STATUS: SensitiveAccessStatus = {
  pin_configured: false,
  unlocked: false,
  expires_at: null,
  active_profile_id: null,
  active_profile_name: null,
  active_role: null,
  permissions: [],
  can_manage_profiles: false,
  profiles: [],
};

function profileHasPermission(status: SensitiveAccessStatus | null, permission?: SensitivePermission) {
  if (!permission) {
    return true;
  }

  if (!status) {
    return false;
  }

  return status.permissions.includes(permission);
}

function permissionDescription(permission?: SensitivePermission) {
  return permission ? SENSITIVE_PERMISSION_LABELS[permission] : "executar esta ação";
}

const SensitiveAccessContext = createContext<SensitiveAccessContextValue | null>(null);

export function SensitiveAccessProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SensitiveAccessStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootProgress, setBootProgress] = useState(6);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMandatory, setDialogMandatory] = useState(false);
  const [dialogMode, setDialogMode] = useState<SensitiveDialogMode>("sensitive");
  const [promptOptions, setPromptOptions] = useState<SensitiveAccessPromptOptions>(defaultPrompt);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const resolverRef = useRef<((value: boolean) => void) | null>(null);
  const startupPromptedRef = useRef(false);
  const bootPhasesTrackedRef = useRef(true);

  const refreshStatus = useCallback(async () => {
    if (bootPhasesTrackedRef.current) {
      setBootProgress((p) => Math.max(p, 14));
    }
    try {
      if (bootPhasesTrackedRef.current) {
        setBootProgress((p) => Math.max(p, 38));
      }
      const nextStatus = await SensitiveAccessService.status();
      if (bootPhasesTrackedRef.current) {
        setBootProgress((p) => Math.max(p, 86));
      }
      setStatus(nextStatus);
      setSelectedProfileId(nextStatus.active_profile_id ? String(nextStatus.active_profile_id) : "");

      if (!startupPromptedRef.current && nextStatus.profiles.length > 0) {
        startupPromptedRef.current = true;
        setDialogMode("startup");
        setPromptOptions({
          title: "Selecionar perfil da sessão",
          description: "Escolha com clareza qual perfil local vai abrir esta sessão e confirme o PIN antes de entrar no AutoOS.",
        });
        setDialogMandatory(true);
        setPin("");
        setConfirmPin("");
        setError(null);
        setBusy(false);
        setDialogOpen(true);
      }
    } catch (refreshError: any) {
      setStatus(EMPTY_STATUS);
      setError(refreshError?.message || refreshError?.toString() || "Não foi possível verificar o acesso sensível.");
    } finally {
      if (bootPhasesTrackedRef.current) {
        setBootProgress(100);
        bootPhasesTrackedRef.current = false;
      }
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();

    const intervalId = window.setInterval(() => {
      void refreshStatus();
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, [refreshStatus]);

  const resolvePending = useCallback((value: boolean) => {
    if (resolverRef.current) {
      resolverRef.current(value);
      resolverRef.current = null;
    }
  }, []);

  const resetDialogState = useCallback(() => {
    setPin("");
    setConfirmPin("");
    setError(null);
    setBusy(false);
    setSelectedProfileId(status?.active_profile_id ? String(status.active_profile_id) : "");
  }, [status?.active_profile_id]);

  const closeDialog = useCallback((result: boolean) => {
    if (!result && dialogMandatory) {
      return;
    }

    setDialogMandatory(false);
    setDialogOpen(false);
    resetDialogState();
    resolvePending(result);
  }, [dialogMandatory, resetDialogState, resolvePending]);

  const ensureSensitiveAccess = useCallback(async (options?: SensitiveAccessPromptOptions) => {
    const currentStatus = await SensitiveAccessService.status().catch(() => status);
    if (currentStatus) {
      setStatus(currentStatus);
      setSelectedProfileId(currentStatus.active_profile_id ? String(currentStatus.active_profile_id) : "");
      if (currentStatus.unlocked && profileHasPermission(currentStatus, options?.permission)) {
        return true;
      }
    }

    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setDialogMode("sensitive");
      setDialogMandatory(false);
      setPromptOptions({
        ...defaultPrompt,
        ...options,
      });
      setError(null);
      setPin("");
      setConfirmPin("");
      if (currentStatus?.unlocked && !profileHasPermission(currentStatus, options?.permission)) {
        setError(`O perfil ativo não possui permissão para ${permissionDescription(options?.permission)}. Troque o perfil para continuar.`);
      }
      setDialogOpen(true);
    });
  }, [status]);

  const openProfileSelector = useCallback(async (options?: ProfileSelectorOptions) => {
    const currentStatus = await SensitiveAccessService.status().catch(() => status);
    if (!currentStatus || currentStatus.profiles.length === 0) {
      return false;
    }

    setStatus(currentStatus);
    setSelectedProfileId(currentStatus.active_profile_id ? String(currentStatus.active_profile_id) : String(currentStatus.profiles[0].id));

    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setDialogMode(options?.mandatory ? "startup" : "selector");
      setDialogMandatory(Boolean(options?.mandatory));
      setPromptOptions({
        title: options?.title || "Perfis da sessão",
        description: options?.description || "Veja as contas locais disponíveis e decida se quer continuar no perfil atual ou trocar de perfil.",
      });
      setPin("");
      setConfirmPin("");
      setError(null);
      setBusy(false);
      setDialogOpen(true);
    });
  }, [status]);

  const lockSensitiveAccess = useCallback(async () => {
    try {
      await SensitiveAccessService.lock();
    } finally {
      await refreshStatus();
    }
  }, [refreshStatus]);

  const setActiveProfile = useCallback(async (profileId: number) => {
    const nextStatus = await SensitiveAccessService.setActiveProfile(profileId);
    setStatus(nextStatus);
    setSelectedProfileId(nextStatus.active_profile_id ? String(nextStatus.active_profile_id) : "");
  }, []);

  const hasPermission = useCallback((permission: SensitivePermission) => {
    return profileHasPermission(status, permission);
  }, [status]);

  const submitSensitiveAccess = useCallback(async () => {
    setBusy(true);
    setError(null);

    try {
      const targetProfileId = selectedProfileId ? Number(selectedProfileId) : status?.active_profile_id ?? null;
      if (!targetProfileId) {
        setError("Selecione um perfil para continuar.");
        setBusy(false);
        return;
      }

      const isCurrentSelection = targetProfileId === status?.active_profile_id;
      const targetProfile =
        status?.profiles.find((profile) => profile.id === targetProfileId) ?? null;
      const shouldAskForPin =
        dialogMode !== "selector" || !isCurrentSelection || !!targetProfile?.pin_configured;

      if (!shouldAskForPin) {
        closeDialog(true);
        return;
      }

      let workingStatus = status;

      if (targetProfileId && targetProfileId !== status?.active_profile_id) {
        workingStatus = await SensitiveAccessService.setActiveProfile(targetProfileId);
        setStatus(workingStatus);
      }

      const activeProfile = workingStatus?.profiles.find((profile) => profile.id === (workingStatus.active_profile_id ?? targetProfileId)) ?? null;
      let nextStatus: SensitiveAccessStatus;
      if (activeProfile?.pin_configured) {
        nextStatus = await SensitiveAccessService.unlock(pin);
      } else {
        if (pin !== confirmPin) {
          setError("Os PINs informados não conferem.");
          setBusy(false);
          return;
        }

        nextStatus = await SensitiveAccessService.configurePin(pin);
      }

      if (!profileHasPermission(nextStatus, promptOptions.permission)) {
        setStatus(nextStatus);
        setError(`O perfil ativo não possui permissão para ${permissionDescription(promptOptions.permission)}.`);
        setBusy(false);
        return;
      }

      setStatus(nextStatus);
      closeDialog(true);
    } catch (submitError: any) {
      setError(submitError?.message || submitError?.toString() || "Falha ao validar o acesso sensível.");
      setBusy(false);
    }
  }, [closeDialog, confirmPin, pin, promptOptions.permission, selectedProfileId, status]);

  const value = useMemo<SensitiveAccessContextValue>(() => ({
    status,
    loading,
    bootProgress,
    refreshStatus,
    ensureSensitiveAccess,
    openProfileSelector,
    lockSensitiveAccess,
    hasPermission,
    setActiveProfile,
  }), [bootProgress, ensureSensitiveAccess, hasPermission, loading, lockSensitiveAccess, openProfileSelector, refreshStatus, setActiveProfile, status]);

  const activeProfile = status?.profiles.find((profile) => profile.id === status.active_profile_id) ?? null;
  const selectedProfile = status?.profiles.find((profile) => String(profile.id) === selectedProfileId) ?? activeProfile ?? null;

  return (
    <SensitiveAccessContext.Provider value={value}>
      {children}

      <ProfileSessionDialog
        open={dialogOpen}
        mandatory={dialogMandatory}
        mode={dialogMode}
        title={promptOptions.title || defaultPrompt.title || "Perfis"}
        description={promptOptions.description || defaultPrompt.description || ""}
        profiles={status?.profiles || []}
        activeProfileId={status?.active_profile_id}
        unlocked={Boolean(status?.unlocked)}
        selectedProfileId={selectedProfileId}
        selectedProfile={selectedProfile}
        pin={pin}
        confirmPin={confirmPin}
        busy={busy}
        error={error}
        onClose={() => closeDialog(false)}
        onSelectProfile={(profileId) => {
          setSelectedProfileId(profileId);
          setError(null);
        }}
        onPinChange={setPin}
        onConfirmPinChange={setConfirmPin}
        onSubmit={() => void submitSensitiveAccess()}
      />
    </SensitiveAccessContext.Provider>
  );
}

export function useSensitiveAccess() {
  const context = useContext(SensitiveAccessContext);
  if (!context) {
    throw new Error("useSensitiveAccess deve ser usado dentro de SensitiveAccessProvider");
  }

  return context;
}

export function SensitiveRoute({
  children,
  title,
  description,
}: {
  children: ReactNode;
  title?: string;
  description?: string;
}) {
  const { loading, status, ensureSensitiveAccess, hasPermission } = useSensitiveAccess();

  if (loading || !status) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!status.unlocked) {
    const actionLabel = status.pin_configured ? "Desbloquear acesso sensível" : "Configurar PIN sensível";
    const Icon = status.pin_configured ? ShieldAlert : ShieldOff;

    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="max-w-lg w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon className="h-5 w-5 text-amber-600" />
              {title || "Configurações protegidas"}
            </CardTitle>
            <CardDescription>
              {description || "Esta área exige desbloqueio com o PIN do acesso sensível."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              SMTP, exclusões e alterações críticas ficam disponíveis apenas durante a sessão sensível desbloqueada.
            </div>
            <Button
              className="w-full"
              onClick={() =>
                void ensureSensitiveAccess({
                  title,
                  description,
                  permission: SENSITIVE_PERMISSIONS.MANAGE_PROFILES,
                })
              }
            >
              {actionLabel}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!hasPermission(SENSITIVE_PERMISSIONS.MANAGE_PROFILES)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="max-w-lg w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-600" />
              Acesso restrito
            </CardTitle>
            <CardDescription>
              O perfil ativo não possui permissão para acessar as configurações administrativas do sistema.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}

export function SensitiveAccessBadge() {
  const { status } = useSensitiveAccess();

  if (!status) {
    return null;
  }

  const profileName = status.active_profile_name || "Perfil ativo";

  if (!status.pin_configured) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900">
        <ShieldOff className="h-3.5 w-3.5" />
        {profileName}: PIN pendente
      </span>
    );
  }

  return status.unlocked ? (
    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
      <ShieldCheck className="h-3.5 w-3.5" />
      {profileName}: acesso ativo
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
      <ShieldAlert className="h-3.5 w-3.5" />
      {profileName}: bloqueado
    </span>
  );
}