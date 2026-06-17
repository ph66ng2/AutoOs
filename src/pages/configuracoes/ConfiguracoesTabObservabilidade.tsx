import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TabsContent } from "@/components/ui/tabs";
import type { LocalSupportStatus, SecurityAuditEvent } from "@/types";

export type ConfiguracoesTabObservabilidadeProps = {
  supportLoading: boolean;
  supportStatus: LocalSupportStatus | null;
  supportError: string | null;
  supportMessage: string | null;
  supportBusy: boolean;
  loadSupportStatus: () => void | Promise<void>;
  exportarPacoteSuporte: () => void | Promise<void>;
  auditSearch: string;
  setAuditSearch: (value: string) => void;
  auditOutcomeFilter: string;
  setAuditOutcomeFilter: (value: string) => void;
  auditProfileFilter: string;
  setAuditProfileFilter: (value: string) => void;
  auditProfileOptions: [string, string][];
  filteredAuditEvents: SecurityAuditEvent[];
  exportarAuditoriaCsv: () => void | Promise<void>;
};

export function ConfiguracoesTabObservabilidade({
  supportLoading,
  supportStatus,
  supportError,
  supportMessage,
  supportBusy,
  loadSupportStatus,
  exportarPacoteSuporte,
  auditSearch,
  setAuditSearch,
  auditOutcomeFilter,
  setAuditOutcomeFilter,
  auditProfileFilter,
  setAuditProfileFilter,
  auditProfileOptions,
  filteredAuditEvents,
  exportarAuditoriaCsv,
}: ConfiguracoesTabObservabilidadeProps) {
  return (
    <TabsContent value="observabilidade" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Suporte local e observabilidade</CardTitle>
          <CardDescription>
            Snapshot operacional mínimo para suporte assistido: diretórios locais, logs recentes, housekeeping e prontidão do bundle Windows.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {supportLoading && !supportStatus ? (
            <div className="flex items-center justify-center h-24">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
            </div>
          ) : supportStatus ? (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                  <div className="text-muted-foreground">App</div>
                  <div className="font-medium">{supportStatus.product_name}</div>
                  <div className="text-xs text-muted-foreground">
                    v{supportStatus.app_version} • {supportStatus.build_profile}
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                  <div className="text-muted-foreground">Logs locais</div>
                  <div className="font-medium">{supportStatus.recent_log_files.length} arquivo(s)</div>
                  <div className="text-xs text-muted-foreground break-all">{supportStatus.log_directory}</div>
                </div>
                <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                  <div className="text-muted-foreground">Pacotes de suporte</div>
                  <div className="font-medium">{supportStatus.recent_support_files.length} arquivo(s)</div>
                  <div className="text-xs text-muted-foreground break-all">{supportStatus.support_directory}</div>
                </div>
                <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                  <div className="text-muted-foreground">Housekeeping</div>
                  <div className="font-medium">
                    {supportStatus.housekeeping.temp_files_removed
                      + supportStatus.housekeeping.log_files_removed
                      + supportStatus.housekeeping.support_files_removed} remoções nesta rodada
                  </div>
                  <div className="text-xs text-muted-foreground">
                    temp {supportStatus.housekeeping.temp_files_removed} • logs {supportStatus.housekeeping.log_files_removed} • suporte {supportStatus.housekeeping.support_files_removed}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border p-4 text-sm space-y-2">
                  <div className="font-medium">Logs recentes</div>
                  {supportStatus.recent_log_files.length === 0 ? (
                    <div className="text-muted-foreground">Nenhum log local encontrado ainda.</div>
                  ) : supportStatus.recent_log_files.map((file) => (
                    <div key={file.file_path} className="text-muted-foreground">
                      <div className="font-medium text-foreground">{file.file_name}</div>
                      <div>{file.modified_at ? new Date(file.modified_at).toLocaleString("pt-BR") : "sem data"}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg border p-4 text-sm space-y-2">
                  <div className="font-medium">Pacotes recentes</div>
                  {supportStatus.recent_support_files.length === 0 ? (
                    <div className="text-muted-foreground">Nenhum pacote de suporte exportado ainda.</div>
                  ) : supportStatus.recent_support_files.map((file) => (
                    <div key={file.file_path} className="text-muted-foreground">
                      <div className="font-medium text-foreground">{file.file_name}</div>
                      <div>{file.modified_at ? new Date(file.modified_at).toLocaleString("pt-BR") : "sem data"}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg border p-4 text-sm space-y-2">
                  <div className="font-medium">Checklist mínimo em incidente</div>
                  <div className="text-muted-foreground">1. Confirmar versão/build do app e perfil ativo.</div>
                  <div className="text-muted-foreground">2. Exportar pacote local de suporte e anexar ao chamado.</div>
                  <div className="text-muted-foreground">3. Informar banco/schema, arquivo afetado e passos de reprodução.</div>
                  <div className="text-muted-foreground">4. Verificar backups disponíveis antes de qualquer ação destrutiva.</div>
                </div>
              </div>
            </>
          ) : null}

          {supportError && (
            <ErrorAlert variant="error" context="Suporte" message={supportError} />
          )}

          {supportMessage && (
            <ErrorAlert variant="success" context="Suporte" message={supportMessage} />
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => void loadSupportStatus()} disabled={supportLoading || supportBusy}>
              {supportLoading ? "Atualizando..." : "Atualizar diagnóstico"}
            </Button>
            <Button type="button" onClick={() => void exportarPacoteSuporte()} disabled={supportBusy || supportLoading}>
              {supportBusy ? "Exportando..." : "Exportar pacote de suporte"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Auditoria recente</CardTitle>
          <CardDescription>Eventos sensiveis recentes de desbloqueio, troca de PIN e gestao de perfis.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4 mb-4">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="audit-search">Buscar evento</Label>
              <Input
                id="audit-search"
                value={auditSearch}
                onChange={(event) => setAuditSearch(event.target.value)}
                placeholder="Evento, perfil ou detalhe"
              />
            </div>
            <div className="space-y-2">
              <Label>Resultado</Label>
              <Select value={auditOutcomeFilter} onValueChange={setAuditOutcomeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  <SelectItem value="SUCCESS">Somente sucesso</SelectItem>
                  <SelectItem value="FAILED">Somente falha</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Perfil</Label>
              <Select value={auditProfileFilter} onValueChange={setAuditProfileFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os perfis" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos os perfis</SelectItem>
                  {auditProfileOptions.map(([profileId, profileName]) => (
                    <SelectItem key={`audit-${profileId}`} value={profileId}>
                      {profileName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end mb-4">
            <Button type="button" variant="outline" onClick={() => void exportarAuditoriaCsv()}>
              Exportar CSV filtrado
            </Button>
          </div>

          <div className="space-y-3">
            {filteredAuditEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum evento de auditoria encontrado para os filtros atuais.</p>
            ) : filteredAuditEvents.map((event) => (
              <div key={event.id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">{event.event_type}</div>
                  <span className={event.success ? "text-emerald-600" : "text-red-600"}>
                    {event.success ? "sucesso" : "falha"}
                  </span>
                </div>
                <div className="text-muted-foreground">Perfil: {event.profile_name || "sistema"}</div>
                {event.details && <div className="text-muted-foreground">{event.details}</div>}
                <div className="text-xs text-muted-foreground mt-1">
                  {event.created_at ? new Date(event.created_at).toLocaleString("pt-BR") : "sem data"}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
