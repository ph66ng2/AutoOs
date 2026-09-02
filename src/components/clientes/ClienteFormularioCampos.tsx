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
  Search,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormValidationError } from "@/components/ui/form-validation-error";
import { ErrorAlert } from "@/components/ui/error-alert";
import type { ClienteFormData } from "@/lib/validations";
import {
  formatarCEP,
  formatarDocumento,
  formatarTelefone,
  validarCNPJ,
} from "@/lib/validations";
import {
  consultarCnpj,
  CnpjLookupError,
  type CnpjLookupResult,
} from "@/lib/cnpj-service";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface ClienteFormularioCamposProps {
  form: UseFormReturn<ClienteFormData>;
  tipoPessoa: "PF" | "PJ" | null;
  buscarCep: (cep: string) => void | Promise<void>;
  buscandoCep: boolean;
}

type CnpjFormField =
  | "razao_social"
  | "nome_fantasia"
  | "telefone"
  | "email"
  | "cep"
  | "endereco"
  | "numero"
  | "complemento"
  | "bairro"
  | "cidade"
  | "uf";

const CNPJ_FIELD_VALUES: Record<CnpjFormField, (result: CnpjLookupResult) => string> = {
  razao_social: (result) => result.razao_social,
  nome_fantasia: (result) => result.nome_fantasia,
  telefone: (result) => formatarTelefone(result.telefone),
  email: (result) => result.email,
  cep: (result) => formatarCEP(result.cep),
  endereco: (result) => result.endereco,
  numero: (result) => result.numero,
  complemento: (result) => result.complemento,
  bairro: (result) => result.bairro,
  cidade: (result) => result.cidade,
  uf: (result) => result.uf.toUpperCase(),
};

interface CnpjFeedback {
  kind: "success" | "warning" | "error";
  message: string;
  technicalDetails?: string;
}

export function ClienteFormularioCampos({
  form,
  tipoPessoa,
  buscarCep,
  buscandoCep,
}: ClienteFormularioCamposProps) {
  const documento = form.watch("documento") || "";
  const cnpjNumeros = documento.replace(/\D/g, "");
  const cnpjValido = validarCNPJ(cnpjNumeros);
  const [consultandoCnpj, setConsultandoCnpj] = useState(false);
  const [cnpjFeedback, setCnpjFeedback] = useState<CnpjFeedback | null>(null);
  const [feedbackCnpj, setFeedbackCnpj] = useState<string | null>(null);

  useEffect(() => {
    if (feedbackCnpj && feedbackCnpj !== cnpjNumeros) {
      setCnpjFeedback(null);
      setFeedbackCnpj(null);
    }
  }, [cnpjNumeros, feedbackCnpj]);

  async function buscarDadosCnpj() {
    if (!cnpjValido || consultandoCnpj) return;

    const cnpjConsultado = cnpjNumeros;
    const startedAt = performance.now();
    setConsultandoCnpj(true);
    setCnpjFeedback(null);
    setFeedbackCnpj(cnpjConsultado);

    try {
      const result = await consultarCnpj(cnpjConsultado);
      const documentoAtual = (form.getValues("documento") || "").replace(/\D/g, "");
      if (documentoAtual !== cnpjConsultado) return;

      for (const [field, getValue] of Object.entries(CNPJ_FIELD_VALUES) as [CnpjFormField, (result: CnpjLookupResult) => string][]) {
        const currentValue = form.getValues(field);
        if (typeof currentValue === "string" && currentValue.trim()) continue;

        const value = getValue(result).trim();
        if (!value) continue;

        form.setValue(field, value, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: false,
        });
      }

      await form.trigger();
      const situacao = result.situacao_cadastral.trim() || "não informada";
      const ativa = situacao.toUpperCase() === "ATIVA";
      const durationMs = Math.round(performance.now() - startedAt);
      console.info("[Consulta CNPJ] sucesso", {
        cnpj: cnpjConsultado,
        durationMs,
        situacao,
        fonte: result.fonte,
      });
      setCnpjFeedback({
        kind: ativa ? "success" : "warning",
        message: "Dados do CNPJ foram preenchidos. Revise as informações antes de salvar.",
      });
    } catch (error: unknown) {
      const documentoAtual = (form.getValues("documento") || "").replace(/\D/g, "");
      if (documentoAtual !== cnpjConsultado) return;

      const code = error instanceof CnpjLookupError ? error.code : "unavailable";
      const durationMs = Math.round(performance.now() - startedAt);
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
      const log = `Falha após ${durationMs} ms. Código: ${code}. Detalhe: ${errorMessage}`;
      console.error("[Consulta CNPJ] falha", {
        cnpj: cnpjConsultado,
        durationMs,
        code,
        error,
      });
      setCnpjFeedback({
        kind: "error",
        message: "Não foi possível consultar o CNPJ agora. Você pode preencher os dados manualmente.",
        technicalDetails: log,
      });
    } finally {
      setConsultandoCnpj(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="cliente-documento">CPF ou CNPJ *</Label>
        <div className="flex gap-3 items-start">
          <div className="flex-1 space-y-1">
            <Input
              id="cliente-documento"
              value={form.watch("documento")}
              onChange={(e) => {
                const formatted = formatarDocumento(e.target.value);
                form.setValue("documento", formatted, {
                  shouldDirty: true,
                  shouldValidate: false,
                });
              }}
              placeholder="Digite CPF ou CNPJ"
              maxLength={18}
            />
            <FormValidationError message={form.formState.errors.documento?.message} />
          </div>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => void buscarDadosCnpj()}
                  disabled={!cnpjValido || consultandoCnpj}
                  aria-label="Buscar dados do CNPJ"
                >
                  {consultandoCnpj ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      <span className="sr-only">Consultando dados do CNPJ</span>
                    </>
                  ) : (
                    <Search className="h-4 w-4" aria-hidden="true" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Buscar dados do CNPJ</TooltipContent>
            </Tooltip>
          </TooltipProvider>
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
        {cnpjFeedback && (
          <ErrorAlert
            variant={cnpjFeedback.kind}
            context="Consulta de CNPJ"
            action={cnpjFeedback.kind === "error" ? "Não concluída" : "Concluída"}
            message={cnpjFeedback.message}
            technicalDetails={cnpjFeedback.technicalDetails}
          />
        )}
      </div>

      {tipoPessoa === "PF" && (
        <div className="space-y-2 p-4 rounded-lg border border-blue-200 bg-blue-50/50">
          <Label>Nome Completo *</Label>
          <Input {...form.register("nome")} placeholder="Nome completo do cliente" />
            <FormValidationError message={form.formState.errors.nome?.message} />
        </div>
      )}

      {tipoPessoa === "PJ" && (
        <div className="space-y-4 p-4 rounded-lg border border-purple-200 bg-purple-50/50">
          <div className="space-y-2">
            <Label>Razão Social *</Label>
            <Input {...form.register("razao_social")} placeholder="Razão Social da empresa" />
              <FormValidationError message={form.formState.errors.razao_social?.message} />
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
            <Label>Telefone</Label>
            <Input
              value={form.watch("telefone")}
              onChange={(e) => {
                const formatted = formatarTelefone(e.target.value);
                form.setValue("telefone", formatted, { shouldValidate: false });
              }}
              placeholder="(11) 99999-9999"
              maxLength={15}
            />
              <FormValidationError message={form.formState.errors.telefone?.message} />
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
            <FormValidationError message={form.formState.errors.email?.message} />
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
          <Label>Observações</Label>
          <Textarea {...form.register("observacoes")} placeholder="Observações sobre o cliente..." rows={3} />
        </div>
    </div>
  );
}
