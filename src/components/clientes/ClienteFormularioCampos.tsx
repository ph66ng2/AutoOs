/**
 * Campos compartilhados do formulário de cliente (PF/PJ).
 * Usado pela página Clientes e pelo ClienteSelector no fluxo de equipamento.
 */
import {
  Phone,
  User,
  Building2,
  MapPin,
  Loader2,
} from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ClienteFormData } from "@/lib/validations";
import { formatarCEP, formatarDocumento, formatarTelefone } from "@/lib/validations";

export interface ClienteFormularioCamposProps {
  form: UseFormReturn<ClienteFormData>;
  tipoPessoa: "PF" | "PJ" | null;
  buscarCep: (cep: string) => void | Promise<void>;
  buscandoCep: boolean;
}

export function ClienteFormularioCampos({
  form,
  tipoPessoa,
  buscarCep,
  buscandoCep,
}: ClienteFormularioCamposProps) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>CPF ou CNPJ *</Label>
        <div className="flex gap-3 items-start">
          <div className="flex-1 space-y-1">
            <Input
              value={form.watch("documento")}
              onChange={(e) => {
                const formatted = formatarDocumento(e.target.value);
                form.setValue("documento", formatted, { shouldValidate: false });
              }}
              placeholder="Digite CPF ou CNPJ"
              maxLength={18}
            />
            {form.formState.errors.documento && (
              <p className="text-xs text-red-500">{form.formState.errors.documento.message}</p>
            )}
          </div>
          {tipoPessoa && (
            <div className="pt-1">
              {tipoPessoa === "PF" ? (
                <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                  <User className="h-3 w-3 mr-1" />
                  Pessoa Física
                </Badge>
              ) : (
                <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">
                  <Building2 className="h-3 w-3 mr-1" />
                  Pessoa Jurídica
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>

      {tipoPessoa === "PF" && (
        <div className="space-y-2 p-4 rounded-lg border border-blue-200 bg-blue-50/50">
          <Label>Nome Completo *</Label>
          <Input {...form.register("nome")} placeholder="Nome completo do cliente" />
          {form.formState.errors.nome && (
            <p className="text-xs text-red-500">{form.formState.errors.nome.message}</p>
          )}
        </div>
      )}

      {tipoPessoa === "PJ" && (
        <div className="space-y-4 p-4 rounded-lg border border-purple-200 bg-purple-50/50">
          <div className="space-y-2">
            <Label>Razão Social *</Label>
            <Input {...form.register("razao_social")} placeholder="Razão Social da empresa" />
            {form.formState.errors.razao_social && (
              <p className="text-xs text-red-500">{form.formState.errors.razao_social.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome Fantasia</Label>
              <Input {...form.register("nome_fantasia")} placeholder="Nome fantasia" />
            </div>
            <div className="space-y-2">
              <Label>Inscrição Estadual</Label>
              <Input {...form.register("inscricao_estadual")} placeholder="ISENTO ou número" />
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          <Phone className="h-4 w-4" /> Contato
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Telefone *</Label>
            <Input
              value={form.watch("telefone")}
              onChange={(e) => {
                const formatted = formatarTelefone(e.target.value);
                form.setValue("telefone", formatted, { shouldValidate: false });
              }}
              placeholder="(11) 99999-9999"
              maxLength={15}
            />
            {form.formState.errors.telefone && (
              <p className="text-xs text-red-500">{form.formState.errors.telefone.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Telefone Secundário</Label>
            <Input
              value={form.watch("telefone_secundario") || ""}
              onChange={(e) => {
                const formatted = formatarTelefone(e.target.value);
                form.setValue("telefone_secundario", formatted, { shouldValidate: false });
              }}
              placeholder="(11) 3333-3333"
              maxLength={15}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input {...form.register("email")} placeholder="email@exemplo.com" type="email" />
          {form.formState.errors.email && (
            <p className="text-xs text-red-500">{form.formState.errors.email.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          <MapPin className="h-4 w-4" /> Endereço
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>CEP</Label>
            <div className="relative">
              <Input
                value={form.watch("cep") || ""}
                onChange={(e) => {
                  const formatted = formatarCEP(e.target.value);
                  form.setValue("cep", formatted, { shouldValidate: false });
                }}
                onBlur={(e) => void buscarCep(e.target.value)}
                placeholder="00000-000"
                maxLength={9}
              />
              {buscandoCep && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
          </div>
          <div className="col-span-2 space-y-2">
            <Label>Logradouro</Label>
            <Input {...form.register("endereco")} placeholder="Rua, Avenida..." />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>Número</Label>
            <Input {...form.register("numero")} placeholder="123" />
          </div>
          <div className="space-y-2">
            <Label>Complemento</Label>
            <Input {...form.register("complemento")} placeholder="Apto, Sala..." />
          </div>
          <div className="col-span-2 space-y-2">
            <Label>Bairro</Label>
            <Input {...form.register("bairro")} placeholder="Bairro" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 space-y-2">
            <Label>Cidade</Label>
            <Input {...form.register("cidade")} />
          </div>
          <div className="space-y-2">
            <Label>UF</Label>
            <Input {...form.register("uf")} placeholder="SP" maxLength={2} className="uppercase" />
          </div>
        </div>
      </div>

<div className="space-y-2">
          <Label>Complemento de Endereço</Label>
          <Input {...form.register("complemento")} placeholder="Apto, sala, ponto de referência..." />
        </div>

        <div className="space-y-2">
          <Label>Observações</Label>
          <Textarea {...form.register("observacoes")} placeholder="Observações sobre o cliente..." rows={3} />
        </div>
    </div>
  );
}
