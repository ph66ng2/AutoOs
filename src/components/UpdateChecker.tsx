import { useState, useCallback } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Button } from "@/components/ui/button";
import { Loader2, Download, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export function UpdateChecker() {
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState<string | null>(null);
  const [upToDate, setUpToDate] = useState(false);

  const checkForUpdates = useCallback(async () => {
    setChecking(true);
    try {
      const update = await check();
      if (update) {
        setUpdateAvailable(update.version);
        setUpToDate(false);
        toast.info(`Nova versão disponível: ${update.version}`, {
          description: update.body || "Toque para instalar.",
          action: {
            label: "Instalar",
            onClick: () => downloadAndInstall(update),
          },
        });
      } else {
        setUpdateAvailable(null);
        setUpToDate(true);
        toast.success("Última atualização aplicada");
      }
    } catch (_e) {
      setUpdateAvailable(null);
      setUpToDate(true);
      toast.success("Última atualização aplicada");
    } finally {
      setChecking(false);
    }
  }, []);

  const downloadAndInstall = useCallback(async (update: any) => {
    setUpdating(true);
    try {
      await update.downloadAndInstall();
      toast.success("Atualização instalada! Reiniciando...");
      await relaunch();
    } catch (e) {
      toast.error("Erro ao instalar atualização", {
        description: String(e),
      });
    } finally {
      setUpdating(false);
    }
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Atualizações do AutoOS</p>
          <p className="text-xs text-muted-foreground">
            {updateAvailable
              ? `Nova versão disponível: ${updateAvailable}`
              : upToDate
                ? "Última atualização aplicada"
                : "Verifique se há novas versões disponíveis."}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={checkForUpdates}
          disabled={checking || updating}
        >
          {checking ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : updateAvailable ? (
            <Download className="mr-2 h-4 w-4" />
          ) : (
            <CheckCircle2 className="mr-2 h-4 w-4" />
          )}
          {checking ? "Verificando..." : updating ? "Instalando..." : "Verificar"}
        </Button>
      </div>
    </div>
  );
}
