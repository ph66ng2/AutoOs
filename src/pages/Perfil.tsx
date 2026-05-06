import { ArrowRightLeft, ShieldAlert, ShieldCheck, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";

export default function Perfil() {
  const { status: accessStatus, openProfileSelector } = useSensitiveAccess();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Perfil</h1>
        <p className="text-muted-foreground">Gerencie a sessão e troque de perfil quando necessário.</p>
      </div>

      <Card className="overflow-hidden border-slate-200 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 text-white shadow-lg">
        <CardContent className="p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-4">
              <div className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-white/70">
                Sessao e perfis
              </div>

              <div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  {accessStatus?.active_profile_name || "Perfil da sessão"}
                </h2>
                <p className="mt-1 max-w-2xl text-sm text-white/70">
                  Abra a lista de perfis para ver as contas locais disponiveis e decidir se quer continuar no perfil atual ou trocar de perfil.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {accessStatus?.profiles.slice(0, 4).map((profile) => (
                  <Badge
                    key={profile.id}
                    className={profile.id === accessStatus.active_profile_id
                      ? "border-emerald-300/40 bg-emerald-500/20 text-emerald-50"
                      : "border-white/15 bg-white/10 text-white/85"
                    }
                    variant="outline"
                  >
                    {profile.nome}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="w-full max-w-md rounded-3xl border border-white/15 bg-white/10 p-5 backdrop-blur-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
                  <UserRound className="h-7 w-7 text-white" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-white/50">Conta em uso</p>
                  <p className="text-lg font-semibold">{accessStatus?.active_profile_name || "Perfil nao definido"}</p>
                  <p className="text-sm text-white/65">{accessStatus?.active_role || "Sem papel definido"}</p>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm">
                <span className="flex items-center gap-2 text-white/80">
                  {accessStatus?.unlocked ? <ShieldCheck className="h-4 w-4 text-emerald-300" /> : <ShieldAlert className="h-4 w-4 text-amber-300" />}
                  {accessStatus?.unlocked ? "Sessao sensivel ativa" : "Sessao sensivel bloqueada"}
                </span>
                <span className="text-white/50">{accessStatus?.profiles.length || 0} perfis</span>
              </div>

              <Button
                type="button"
                className="mt-5 w-full bg-white text-slate-900 hover:bg-white/90"
                onClick={() => void openProfileSelector({
                  title: "Perfis da sessão",
                  description: "Veja os perfis disponiveis, escolha se quer continuar com a conta atual ou trocar para outra conta local.",
                })}
              >
                <ArrowRightLeft className="mr-2 h-4 w-4" />
                Ver perfis e decidir
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
