import { TabsContent } from "@/components/ui/tabs";
import { PortalFuncionamentoCard } from "@/components/configuracoes/PortalFuncionamentoCard";
import { PortalContatoEmpresaCard } from "@/components/configuracoes/PortalContatoEmpresaCard";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { SENSITIVE_PERMISSIONS } from "@/types";

/** Configurações › Portal do Cliente: funcionamento (liga/desliga) e contato exibido aos clientes. */
export function ConfiguracoesTabPortal() {
  const { hasPermission } = useSensitiveAccess();
  return (
    <TabsContent value="portal" className="mt-0 space-y-4 p-5 md:p-6">
      <h2 className="text-xl font-bold">Portal do Cliente</h2>
      <PortalFuncionamentoCard />
      {hasPermission(SENSITIVE_PERMISSIONS.MANAGE_STATUS_LINKS) && <PortalContatoEmpresaCard />}
    </TabsContent>
  );
}
