import { BrowserRouter, Navigate, NavLink, Route, Routes } from "react-router-dom";
import { LockKeyhole, LogOut, Printer, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import SaasClientesPage from "@/pages/SaasClientesPage";
import Equipamentos from "@/pages/Equipamentos";
import type { SaasOperationalProfile, SaasSession } from "@/types/saas-auth";

interface SaasOperationalShellProps {
  session: SaasSession;
  profile: SaasOperationalProfile;
  onLock: () => void;
  onSignOut: () => void;
  onRemoveDevice: () => void;
}

/** Shell mínimo do plano Online: só expõe domínios que já possuem adapter SaaS. */
export function SaasOperationalShell({ session, profile, onLock, onSignOut, onRemoveDevice }: SaasOperationalShellProps) {
  return (
    <BrowserRouter>
      <SaasOperationalRoutes
        session={session}
        profile={profile}
        onLock={onLock}
        onSignOut={onSignOut}
        onRemoveDevice={onRemoveDevice}
      />
    </BrowserRouter>
  );
}

function SaasOperationalRoutes({ session, profile, onLock, onSignOut, onRemoveDevice }: SaasOperationalShellProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10 bg-slate-900/90">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-lg font-semibold">AutoOS</p>
            <p className="text-sm text-slate-400">Plano Online · {session.identity.email}{profile ? ` · ${profile.name}` : ""}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="border-slate-500 bg-slate-800 text-slate-100 hover:bg-slate-700 hover:text-white" onClick={onLock}><LockKeyhole className="mr-2 h-4 w-4" />Bloquear</Button>
            <Button variant="destructive" onClick={onSignOut}><LogOut className="mr-2 h-4 w-4" />Sair</Button>
            <Button variant="outline" className="border-rose-800 bg-rose-950/60 text-rose-100 hover:bg-rose-900 hover:text-white" onClick={onRemoveDevice}><Trash2 className="mr-2 h-4 w-4" />Remover máquina</Button>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl gap-6 px-6 py-6">
        <nav aria-label="Navegação SaaS" className="w-48 shrink-0">
          <NavLink to="/clientes" className={({ isActive }) => `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${isActive ? "bg-slate-700 text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}>
            <Users className="h-4 w-4" />Clientes
          </NavLink>
          <NavLink to="/equipamentos" className={({ isActive }) => `mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${isActive ? "bg-slate-700 text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}>
            <Printer className="h-4 w-4" />Equipamentos
          </NavLink>
          <p className="mt-5 text-xs leading-5 text-slate-500">Outros módulos serão liberados quando receberem adapters SaaS tenant-safe.</p>
        </nav>
        <main className="min-w-0 flex-1 rounded-xl bg-background p-6 text-foreground">
          <Routes>
            <Route path="/clientes" element={<SaasClientesPage />} />
            <Route path="/equipamentos" element={<Equipamentos operationalProfile={profile} />} />
            <Route path="*" element={<Navigate to="/clientes" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
