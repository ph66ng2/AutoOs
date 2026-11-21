import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useGarantiaServicos } from "@/hooks/useGarantiaServicos";
import { mensagemVisivelAoOperador } from "@/lib/operator-errors";

/**
 * Política da empresa (Configurações › Segurança, só administrador): prazo de garantia dos
 * serviços. A Nova entrada usa para avisar quando a impressora volta dentro dele.
 */
export function GarantiaServicosCard() {
  const { dias, salvar } = useGarantiaServicos();
  const [valor, setValor] = useState("");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (dias != null) setValor(String(dias));
  }, [dias]);
  const numero = Number(valor);
  const valido = valor.trim() !== "" && Number.isInteger(numero) && numero >= 0 && numero <= 3650;

  async function gravar() {
    if (!valido) return;
    setSalvando(true);
    try {
      await salvar(numero);
      toast.success("Prazo de garantia salvo.");
    } catch (causa) {
      toast.error(mensagemVisivelAoOperador(causa) ?? "Não foi possível salvar o prazo de garantia.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Garantia dos serviços</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Contada de quando a impressora fica pronta para retirada.</p>
        <div className="flex items-center gap-2">
          <Input
            aria-label="Garantia dos serviços em dias"
            inputMode="numeric"
            className="h-9 w-20 text-right tabular-nums"
            value={valor}
            disabled={dias == null || salvando}
            onChange={(evento) => setValor(evento.target.value.replace(/\D/g, "").slice(0, 4))}
          />
          <span className="text-sm text-muted-foreground">dias</span>
          <Button type="button" size="sm" variant="outline" disabled={!valido || numero === dias || salvando} onClick={() => void gravar()}>
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
