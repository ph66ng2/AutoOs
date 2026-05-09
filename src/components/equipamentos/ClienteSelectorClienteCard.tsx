import {
  Building2,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Printer,
  User,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { nomeExibicaoCliente } from "@/components/clientes/cliente-display-utils";
import type { Cliente, Equipamento } from "@/types";
import { formatarDocumento, formatarTelefone } from "@/lib/validations";

export function ClienteSelectorClienteCard({
  cliente,
  equipamentosCliente,
  carregandoEquip,
  readOnly,
  onRemover,
}: {
  cliente: Cliente;
  equipamentosCliente: Equipamento[];
  carregandoEquip: boolean;
  readOnly: boolean;
  onRemover: () => void;
}) {
  const c = cliente;
  return (
    <Card className="border-green-200 bg-green-50/30">
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Check className="h-4 w-4 text-green-600" />
            Cliente Vinculado
            {c.tipo_pessoa === "PJ" ? (
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-xs">
                <Building2 className="h-3 w-3 mr-1" />PJ
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                <User className="h-3 w-3 mr-1" />PF
              </Badge>
            )}
          </CardTitle>
          {!readOnly && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRemover} title="Remover vínculo">
              <X className="h-4 w-4 text-muted-foreground" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">Nome:</span>
            <p className="font-medium">{nomeExibicaoCliente(c)}</p>
            {c.tipo_pessoa === "PJ" && c.razao_social && (
              <p className="text-xs text-muted-foreground">{c.razao_social}</p>
            )}
          </div>
          <div>
            <span className="text-muted-foreground">Documento:</span>
            <p className="font-medium font-mono text-xs">
              {formatarDocumento(c.documento || c.cpf_cnpj || "")}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-1">
            <Phone className="h-3 w-3 text-muted-foreground" />
            <span>{c.telefone ? formatarTelefone(c.telefone) : "—"}</span>
          </div>
          {c.email && (
            <div className="flex items-center gap-1">
              <Mail className="h-3 w-3 text-muted-foreground" />
              <span className="truncate">{c.email}</span>
            </div>
          )}
        </div>
        {(c.cidade || c.uf) && (
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3 w-3" />
            <span>{c.cidade && c.uf ? `${c.cidade}/${c.uf}` : c.cidade || c.uf}</span>
          </div>
        )}

        {carregandoEquip ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Carregando equipamentos...
          </div>
        ) : equipamentosCliente.length > 0 ? (
          <div className="border-t pt-2 mt-2">
            <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
              <Printer className="h-3 w-3" />
              {equipamentosCliente.length} equipamento(s) anterior(es)
            </p>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {equipamentosCliente.map((eq) => (
                <div key={eq.id} className="flex items-center justify-between text-xs bg-white/50 p-1.5 rounded border">
                  <span className="font-medium">{eq.marca} {eq.modelo}</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                    (eq.status === "ENTREGUE" || eq.status === "PRONTO") ? "bg-green-100 text-green-700" :
                    eq.status === "EM_MANUTENCAO" ? "bg-indigo-100 text-indigo-700" :
                    "bg-gray-100 text-gray-700"
                  }`}>
                    {eq.status.replace(/_/g, " ")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
