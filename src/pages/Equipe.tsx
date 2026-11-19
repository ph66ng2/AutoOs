import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { TeamAccessManager } from "@/components/TeamAccessManager";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";

/** "Equipe e acessos" como página própria (canvas Administração); o perfil pessoal segue em /perfil. */
export default function Equipe() {
  const { status, refreshStatus, openProfileSelector } = useSensitiveAccess();

  if (!status) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Carregando equipe...</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader titulo="Equipe e acessos" />
      {!status.unlocked ? (
        <Card>
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-3 text-sm text-muted-foreground">
              <Lock className="mt-0.5 h-5 w-5" /> Informe seu PIN para ver a equipe.
            </p>
            <Button type="button" onClick={() => void openProfileSelector({ title: "Quem está usando?", description: "Escolha o perfil e informe o PIN para entrar." })}>
              Desbloquear
            </Button>
          </CardContent>
        </Card>
      ) : !status.can_manage_profiles ? (
        <Card>
          <CardContent className="space-y-2 p-6 text-sm text-muted-foreground">
            <p>Só quem gerencia perfis cria pessoas, gera códigos de acesso e muda permissões.</p>
            <Link to="/perfil" className="font-semibold text-primary hover:underline">Ver o meu perfil</Link>
          </CardContent>
        </Card>
      ) : (
        <TeamAccessManager activeProfileId={status.active_profile_id} onChanged={refreshStatus} />
      )}
    </div>
  );
}
