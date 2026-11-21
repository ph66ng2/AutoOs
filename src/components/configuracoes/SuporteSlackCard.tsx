import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfigSuporte } from "@/hooks/useSuporte";
import { mensagemVisivelAoOperador } from "@/lib/operator-errors";

/**
 * Configurações › Integrações: canal do Slack (vale para a empresa) e token do bot (fica no
 * cofre deste computador; cada computador que abre chamados precisa do seu).
 */
export function SuporteSlackCard() {
  const { config, error, salvar } = useConfigSuporte();
  const [canal, setCanal] = useState("");
  const [token, setToken] = useState("");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (config?.canal) setCanal(config.canal);
  }, [config?.canal]);

  async function gravar() {
    setSalvando(true);
    try {
      await salvar(canal.trim(), token.trim() || null);
      setToken("");
      toast.success("Suporte configurado neste computador.");
    } catch (causa) {
      toast.error(mensagemVisivelAoOperador(causa) ?? "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  const precisaToken = !config?.token_neste_computador;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Suporte (Slack)</CardTitle>
        <span className="text-xs font-semibold text-muted-foreground">
          {config?.token_neste_computador && config.canal ? "Configurado neste computador" : "Não configurado neste computador"}
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="suporte-canal">ID do canal</Label>
            <Input id="suporte-canal" value={canal} onChange={(e) => setCanal(e.target.value)} placeholder="C0CE5M6GTRV" className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="suporte-token">Token do bot {precisaToken ? "" : "(guardado; preencha só para trocar)"}</Label>
            <Input id="suporte-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="xoxb-…" />
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="button" onClick={() => void gravar()} disabled={salvando || !canal.trim() || (precisaToken && !token.trim())}>
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
