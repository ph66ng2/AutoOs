import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useAvisosDesligados } from "@/hooks/useAvisosDesligados";
import { avisosWindowsLigados, definirAvisosWindows } from "@/lib/notificacao-sistema";

const TIPOS: { tipo: string; rotulo: string; quem?: string }[] = [
  { tipo: "os-nova", rotulo: "Nova OS para mim" },
  { tipo: "vence-amanha", rotulo: "Orçamento que vence amanhã", quem: "quem elabora orçamentos" },
  { tipo: "pronto-parado", rotulo: "Pronto há 7 dias sem retirada" },
  { tipo: "peca-chegou", rotulo: "Peça disponível para OS aguardando peça" },
  { tipo: "estoque-baixo", rotulo: "Estoque baixo", quem: "quem cuida do estoque" },
  { tipo: "venda-aprovada", rotulo: "Venda de insumos aprovada", quem: "quem tem ações financeiras" },
  { tipo: "portal", rotulo: "Respostas do Portal do Cliente" },
];

/** Perfil › Notificações: o que entra no sino (do perfil, em qualquer computador) e o aviso do Windows (deste computador). */
export function PreferenciasNotificacao({ desligados: iniciais, onSaved }: { desligados: string[]; onSaved: () => Promise<unknown> | void }) {
  const { desligados, alternar, salvando, erro } = useAvisosDesligados(iniciais, onSaved);
  const [windows, setWindows] = useState(avisosWindowsLigados);

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">O que aparece no sino</CardTitle>
          <CardDescription>Vale para o seu perfil em qualquer computador.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {TIPOS.map(({ tipo, rotulo, quem }) => (
              <li key={tipo}>
                <label className="flex cursor-pointer items-center justify-between gap-4 py-3">
                  <span>
                    <span className="block text-sm font-medium">{rotulo}</span>
                    {quem && <span className="block text-xs text-muted-foreground">Chega só para {quem}.</span>}
                  </span>
                  <Checkbox
                    aria-label={rotulo}
                    checked={!desligados.includes(tipo)}
                    disabled={salvando}
                    onCheckedChange={(ligado) => void alternar(tipo, ligado)}
                  />
                </label>
              </li>
            ))}
          </ul>
          {erro && <p role="alert" className="mt-3 text-sm text-destructive">{erro}</p>}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-6">
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span>
              <span className="block text-sm font-semibold">Avisar no Windows</span>
              <span className="block text-xs text-muted-foreground">Quando o AutoOS estiver minimizado ou atrás de outra janela. Só neste computador.</span>
            </span>
            <Checkbox
              aria-label="Avisar no Windows"
              checked={windows}
              onCheckedChange={(ligado) => { definirAvisosWindows(ligado); setWindows(ligado); }}
            />
          </label>
        </CardContent>
      </Card>
    </div>
  );
}
