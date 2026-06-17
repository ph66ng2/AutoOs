import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TabsContent } from "@/components/ui/tabs";
import type { DatabaseSchemaStatus, PostgresBackupToolsStatus } from "@/types";
import type { RestoreMode } from "./detect-restore-mode";

export type ConfiguracoesTabInfraProps = {
  canManageProfiles: boolean;
  schemaLoading: boolean;
  schemaStatus: DatabaseSchemaStatus | null;
  schemaError: string | null;
  loadSchemaStatus: () => void | Promise<void>;
  backupLoading: boolean;
  backupToolsStatus: PostgresBackupToolsStatus | null;
  backupError: string | null;
  backupMessage: string | null;
  backupBusy: boolean;
  restoreFilePath: string;
  setRestoreFilePath: (value: string) => void;
  restoreConfirmText: string;
  setRestoreConfirmText: (value: string) => void;
  restoreBusy: boolean;
  restoreError: string | null;
  restoreMessage: string | null;
  restoreMode: RestoreMode;
  restoreReady: boolean;
  loadBackupToolsStatus: () => void | Promise<void>;
  gerarBackupBanco: () => void | Promise<void>;
  restaurarBackupBanco: () => void | Promise<void>;
};

export function ConfiguracoesTabInfra({
  canManageProfiles,
  schemaLoading,
  schemaStatus,
  schemaError,
  loadSchemaStatus,
  backupLoading,
  backupToolsStatus,
  backupError,
  backupMessage,
  backupBusy,
  restoreFilePath,
  setRestoreFilePath,
  restoreConfirmText,
  setRestoreConfirmText,
  restoreBusy,
  restoreError,
  restoreMessage,
  restoreMode,
  restoreReady,
  loadBackupToolsStatus,
  gerarBackupBanco,
  restaurarBackupBanco,
}: ConfiguracoesTabInfraProps) {
  return (
    <TabsContent value="infra" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Banco e schema</CardTitle>
          <CardDescription>
            Painel de conferência da versão do schema aplicada no PostgreSQL e das migrações conhecidas pelo AutoOS.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {schemaLoading && !schemaStatus ? (
            <div className="flex items-center justify-center h-24">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
            </div>
          ) : schemaError ? (
            <ErrorAlert variant="warning" context="Schema" message={schemaError} />
          ) : schemaStatus ? (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                  <div className="text-muted-foreground">Banco</div>
                  <div className="font-medium">{schemaStatus.database_name}</div>
                  <div className="text-xs text-muted-foreground">schema {schemaStatus.schema_name}</div>
                </div>
                <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                  <div className="text-muted-foreground">Versão aplicada</div>
                  <div className="font-medium">{schemaStatus.latest_applied_version ?? "—"}</div>
                </div>
                <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                  <div className="text-muted-foreground">Versão conhecida</div>
                  <div className="font-medium">{schemaStatus.latest_known_version ?? "—"}</div>
                </div>
                <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                  <div className="text-muted-foreground">Migrações</div>
                  <div className="font-medium">{schemaStatus.applied_count} de {schemaStatus.known_count}</div>
                  <div className={`text-xs ${schemaStatus.pending_count === 0 ? "text-emerald-600" : "text-amber-600"}`}>
                    {schemaStatus.pending_count === 0 ? "schema atualizado" : `${schemaStatus.pending_count} pendente(s)`}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {schemaStatus.migrations.map((migration) => (
                  <div key={migration.version} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">v{migration.version} • {migration.description}</div>
                      <span className={migration.applied && migration.success ? "text-emerald-600" : "text-amber-600"}>
                        {migration.applied && migration.success ? "aplicada" : "pendente"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {migration.installed_on ? `Instalada em ${new Date(migration.installed_on).toLocaleString("pt-BR")}` : "Ainda não aplicada neste banco"}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => void loadSchemaStatus()} disabled={schemaLoading}>
              {schemaLoading ? "Atualizando..." : "Atualizar status do schema"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Backup e restore do banco</CardTitle>
          <CardDescription>
            Gera backup .dump, valida pg_dump, pg_restore e psql, e permite restore manual com confirmação explícita.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canManageProfiles ? (
            <ErrorAlert
              variant="warning"
              message="O perfil ativo nao possui permissao para validar ferramentas, gerar backups ou executar restore do banco."
            />
          ) : (
            <>
              {backupLoading && !backupToolsStatus ? (
                <div className="flex items-center justify-center h-24">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                </div>
              ) : backupToolsStatus ? (
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                    <div className="text-muted-foreground">Banco</div>
                    <div className="font-medium">{backupToolsStatus.database_name}</div>
                  </div>
                  <div className="rounded-lg border bg-muted/40 p-4 text-sm">
                    <div className="text-muted-foreground">Host</div>
                    <div className="font-medium">
                      {backupToolsStatus.host || "localhost"}
                      {backupToolsStatus.port ? `:${backupToolsStatus.port}` : ""}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-muted/40 p-4 text-sm md:col-span-2">
                    <div className="text-muted-foreground">Pasta de backup</div>
                    <div className="font-medium break-all">{backupToolsStatus.backup_directory}</div>
                  </div>
                  <div className="rounded-lg border bg-muted/40 p-4 text-sm md:col-span-4">
                    <div className="text-muted-foreground mb-2">Ferramentas PostgreSQL</div>
                    <div className="grid gap-2 md:grid-cols-3">
                      <div className={backupToolsStatus.pg_dump_available ? "text-emerald-600" : "text-amber-600"}>
                        pg_dump: {backupToolsStatus.pg_dump_available ? "disponivel" : "ausente"}
                      </div>
                      <div className={backupToolsStatus.pg_restore_available ? "text-emerald-600" : "text-amber-600"}>
                        pg_restore: {backupToolsStatus.pg_restore_available ? "disponivel" : "ausente"}
                      </div>
                      <div className={backupToolsStatus.psql_available ? "text-emerald-600" : "text-amber-600"}>
                        psql: {backupToolsStatus.psql_available ? "disponivel" : "ausente"}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {backupError && (
                <ErrorAlert variant="error" context="Backup" message={backupError} />
              )}

              {backupMessage && (
                <ErrorAlert variant="success" context="Backup" message={backupMessage} />
              )}

              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => void loadBackupToolsStatus()} disabled={backupLoading || backupBusy || restoreBusy}>
                  {backupLoading ? "Validando..." : "Validar ferramentas"}
                </Button>
                <Button
                  type="button"
                  onClick={() => void gerarBackupBanco()}
                  disabled={backupBusy || backupLoading || restoreBusy || !backupToolsStatus?.pg_dump_available}
                >
                  {backupBusy ? "Gerando backup..." : "Gerar backup agora"}
                </Button>
              </div>

              <div className="space-y-4 border-t pt-4">
                <div>
                  <div className="font-medium">Restore manual</div>
                  <p className="text-sm text-muted-foreground">
                    Use apenas em manutenção controlada. O restore substitui os dados atuais do banco configurado na DATABASE_URL.
                  </p>
                </div>

                <ErrorAlert
                  variant="warning"
                  message="Aceita arquivos .dump via pg_restore e .sql via psql. Feche outras rotinas operacionais antes de restaurar."
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="restore-file-path">Caminho do arquivo de backup</Label>
                    <Input
                      id="restore-file-path"
                      placeholder="C:/Users/Usuario/Documents/AutoOS/backups/autoos-20260406-153000.dump"
                      value={restoreFilePath}
                      onChange={(event) => setRestoreFilePath(event.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Informe o caminho absoluto completo. O app aceita somente .dump e .sql.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="restore-confirm-text">Confirmação</Label>
                    <Input
                      id="restore-confirm-text"
                      placeholder="Digite RESTAURAR"
                      value={restoreConfirmText}
                      onChange={(event) => setRestoreConfirmText(event.target.value.toUpperCase())}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Ferramenta detectada</Label>
                    <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                      {restoreMode === "pg_restore"
                        ? "pg_restore (.dump)"
                        : restoreMode === "psql"
                          ? "psql (.sql)"
                          : "aguardando arquivo .dump ou .sql"}
                    </div>
                  </div>
                </div>

                {restoreError && (
                  <ErrorAlert variant="error" context="Restore" message={restoreError} />
                )}

                {restoreMessage && (
                  <ErrorAlert variant="success" context="Restore" message={restoreMessage} />
                )}

                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => void restaurarBackupBanco()}
                    disabled={
                      restoreBusy
                      || backupBusy
                      || backupLoading
                      || !restoreMode
                      || !restoreReady
                      || !restoreFilePath.trim()
                      || restoreConfirmText.trim().toUpperCase() !== "RESTAURAR"
                    }
                  >
                    {restoreBusy ? "Restaurando backup..." : "Restaurar backup agora"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

    </TabsContent>
  );
}
