import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { SaasProfilePinGate } from "@/components/SaasProfilePinGate";
import { Button } from "@/components/ui/button";
import { auditSaasOperationalProfileSelection, listSaasOperationalProfiles } from "@/lib/saas-auth";
import { tauriSaasProfilePinStore } from "@/lib/saas-profile-pin-store";
import type { SaasOperationalProfile, SaasSession } from "@/types/saas-auth";

interface SaasProfileSelectorProps {
  session: SaasSession;
  onUnlocked: (profile: SaasOperationalProfile) => void;
}

export function SaasProfileSelector({ session, onUnlocked }: SaasProfileSelectorProps) {
  const [profiles, setProfiles] = useState<SaasOperationalProfile[] | null>(null);
  const [selected, setSelected] = useState<SaasOperationalProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const items = await listSaasOperationalProfiles(session);
        // A resposta cloud é a autoridade: perfis inativos perdem o PIN/counter local imediatamente.
        await tauriSaasProfilePinStore.syncAuthorizedProfiles(items.map((profile) => profile.id));
        if (!alive) return;
        setProfiles(items);
        if (items.length === 1) {
          await auditSaasOperationalProfileSelection(session, items[0].id);
          if (alive) setSelected(items[0]);
        }
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : "Não foi possível sincronizar perfis.");
      }
    })();
    return () => { alive = false; };
  }, [session]);

  if (selected) return <SaasProfilePinGate profile={selected} session={session} onUnlocked={() => onUnlocked(selected)} onBack={() => setSelected(null)} />;

  const selectProfile = async (profile: SaasOperationalProfile) => {
    setError(null);
    try {
      await auditSaasOperationalProfileSelection(session, profile.id);
      setSelected(profile);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível confirmar o perfil operacional.");
    }
  };

  return (
    <main className="fixed inset-0 grid place-items-center bg-slate-950 p-5 text-white">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-7 shadow-2xl">
        <h1 className="font-semibold">Selecione o perfil operacional</h1>
        <p className="mt-1 text-sm text-slate-400">A identidade cloud continua sendo {session.identity.email}.</p>
        {error ? <p role="alert" className="mt-5 text-sm text-rose-200">{error}</p> : null}
        {!error && profiles === null ? <p className="mt-5 text-sm text-slate-400">Sincronizando perfis autorizados…</p> : null}
        {!error && profiles?.length === 0 ? <p role="alert" className="mt-5 text-sm text-rose-200">Nenhum perfil ativo está autorizado para esta empresa.</p> : null}
        {profiles && profiles.length > 0 ? <div className="mt-5 space-y-2">{profiles.map((profile) => (
          <Button key={profile.id} variant="outline" className="h-auto w-full justify-start border-slate-600 bg-slate-800 p-4 text-left text-slate-100 hover:bg-slate-700" onClick={() => void selectProfile(profile)}>
            <UserRound className="mr-3 h-4 w-4" />
            <span><span className="block font-medium">{profile.name}</span><span className="block text-xs text-slate-400">{profile.role}</span></span>
          </Button>
        ))}</div> : null}
      </section>
    </main>
  );
}
