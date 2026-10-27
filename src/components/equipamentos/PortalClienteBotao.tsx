import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePortalCliente } from "@/components/equipamentos/portal-cliente-context";

/** Botão "Portal do Cliente" do cabeçalho do atendimento; o contador indica o que a equipe ainda precisa ver. */
export function PortalClienteBotao() {
  const { pendencias, abrirPainel } = usePortalCliente();
  return (
    <Button
      size="sm"
      variant="outline"
      className="relative"
      onClick={abrirPainel}
      aria-label={pendencias > 0 ? `Portal do Cliente, ${pendencias} pendência${pendencias > 1 ? "s" : ""}` : "Portal do Cliente"}
    >
      <Globe className="mr-2 h-4 w-4" /> Portal do Cliente
      {pendencias > 0 && (
        <span
          data-testid="portal-pendencias"
          className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground"
        >
          {pendencias}
        </span>
      )}
    </Button>
  );
}
