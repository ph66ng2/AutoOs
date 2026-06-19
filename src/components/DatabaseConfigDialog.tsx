import { useState } from "react";
import { Database, TestTube, Save, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatabaseConfigService } from "@/lib/db-config";
import type { DatabaseConnectionConfig } from "@/types";

interface DatabaseConfigDialogProps {
  onConfigured: () => void;
}

export function DatabaseConfigDialog({ onConfigured }: DatabaseConfigDialogProps) {
  const [config, setConfig] = useState<DatabaseConnectionConfig>({
    host: "localhost",
    port: 5432,
    database: "autoos",
    username: "autoos_user",
    password: "",
  });
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testSuccess, setTestSuccess] = useState(false);

  const updateField = (field: keyof DatabaseConnectionConfig, value: string | number) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
    setError(null);
    setTestSuccess(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setError(null);
    setTestSuccess(false);
    try {
      const ok = await DatabaseConfigService.test(config);
      if (ok) {
        setTestSuccess(true);
      } else {
        setError("Não foi possível conectar ao banco de dados.");
      }
    } catch (e: any) {
      setError(e?.message || e?.toString() || "Erro ao testar conexão");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await DatabaseConfigService.save(config);
      const restarted = await DatabaseConfigService.restartWithConfig(config);
      if (restarted) {
        onConfigured();
      } else {
        setError("Configuração salva, mas não foi possível reiniciar a conexão.");
      }
    } catch (e: any) {
      setError(e?.message || e?.toString() || "Erro ao salvar configuração");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-[#050608] px-4">
      <Card className="w-full max-w-md border-white/10 bg-[#0a0c10]">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-cyan-400" />
            <CardTitle className="text-white">Configurar Conexão PostgreSQL</CardTitle>
          </div>
          <CardDescription className="text-[#5a7490]">
            Informe os dados do servidor PostgreSQL para conectar o AutoOS.
            <br />
            <span className="text-xs">
              Dica: em VM VirtualBox com NAT, use <strong>10.0.2.2</strong> como host.
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="db-host" className="text-[#7a94b0]">Host</Label>
              <Input
                id="db-host"
                value={config.host}
                onChange={(e) => updateField("host", e.target.value)}
                placeholder="localhost ou 10.0.2.2"
                className="border-white/10 bg-white/5 text-white placeholder:text-white/20"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="db-port" className="text-[#7a94b0]">Porta</Label>
              <Input
                id="db-port"
                type="number"
                value={config.port}
                onChange={(e) => updateField("port", Number(e.target.value))}
                className="border-white/10 bg-white/5 text-white"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="db-database" className="text-[#7a94b0]">Banco de Dados</Label>
            <Input
              id="db-database"
              value={config.database}
              onChange={(e) => updateField("database", e.target.value)}
              className="border-white/10 bg-white/5 text-white"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="db-username" className="text-[#7a94b0]">Usuário</Label>
            <Input
              id="db-username"
              value={config.username}
              onChange={(e) => updateField("username", e.target.value)}
              className="border-white/10 bg-white/5 text-white"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="db-password" className="text-[#7a94b0]">Senha</Label>
            <Input
              id="db-password"
              type="password"
              value={config.password}
              onChange={(e) => updateField("password", e.target.value)}
              className="border-white/10 bg-white/5 text-white"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {testSuccess && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300">
              Conexão testada com sucesso!
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1 border-white/10 bg-white/10 text-white hover:bg-white/20"
              onClick={() => void handleTest()}
              disabled={testing || saving}
            >
              {testing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <TestTube className="mr-2 h-4 w-4" />
              )}
              Testar
            </Button>
            <Button
              className="flex-1 bg-cyan-500 text-black hover:bg-cyan-400"
              onClick={() => void handleSave()}
              disabled={saving || testing}
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Salvar e Continuar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
