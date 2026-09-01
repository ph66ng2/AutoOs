import { MonitorCog, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AppMode } from "@/lib/app-mode";

export function AppModeSelector({ onSelect }: { onSelect: (mode: AppMode) => void }) {
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950 p-6 text-slate-50">
      <section className="w-full max-w-4xl">
        <p className="mb-2 text-center text-lg text-cyan-300">AutoOS</p>
        <h1 className="text-center text-3xl font-bold">Como deseja trabalhar nesta máquina?</h1>
        <p className="mt-3 text-center text-base text-slate-300">A escolha pode ser alterada a qualquer momento no cabeçalho.</p>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <Button type="button" onClick={() => onSelect("counter")} className="h-64 flex-col gap-5 rounded-2xl bg-cyan-600 text-xl hover:bg-cyan-500">
            <Store className="h-16 w-16" />
            <span>Modo Balcão</span>
            <span className="text-base font-normal text-cyan-50">Atendimentos rápidos, toque e teclado</span>
          </Button>
          <Button type="button" variant="secondary" onClick={() => onSelect("standard")} className="h-64 flex-col gap-5 rounded-2xl text-xl">
            <MonitorCog className="h-16 w-16" />
            <span>AutoOS Completo</span>
            <span className="text-base font-normal text-muted-foreground">Gestão administrativa completa</span>
          </Button>
        </div>
      </section>
    </div>
  );
}
