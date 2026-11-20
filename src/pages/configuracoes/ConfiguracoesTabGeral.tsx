import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { TabsContent } from "@/components/ui/tabs";
import { UpdateChecker } from "@/components/UpdateChecker";
import { getAppMode, setAppMode, type AppMode } from "@/lib/app-mode";
import { avisosWindowsLigados, definirAvisosWindows } from "@/lib/notificacao-sistema";
import {
  animacoesReduzidasAqui,
  definirAnimacoesReduzidas,
  definirTamanhoTexto,
  definirTelaInicial,
  tamanhoTexto,
  telaInicial,
  type TamanhoTexto,
  type TelaInicial,
} from "@/lib/preferencias-computador";
import { setUiSoundsEnabled, uiSoundsEnabled } from "@/lib/ui-sounds";
import { cn } from "@/lib/utils";

/**
 * Configurações › Geral: o que é deste computador, aberto a qualquer perfil.
 * Nada aqui vai para o banco nem muda os outros computadores.
 */
export function ConfiguracoesTabGeral({ conectado }: { conectado: boolean }) {
  const navigate = useNavigate();
  const [modo, setModo] = useState<AppMode>(() => getAppMode() ?? "standard");
  const [texto, setTexto] = useState<TamanhoTexto>(tamanhoTexto);
  const [reduzidas, setReduzidas] = useState(animacoesReduzidasAqui);
  const [inicial, setInicial] = useState<TelaInicial>(telaInicial);
  const [sons, setSons] = useState(uiSoundsEnabled);
  const [windows, setWindows] = useState(avisosWindowsLigados);

  return (
    <TabsContent value="geral" className="mt-0 space-y-4 p-5 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Este computador</CardTitle>
          <CardDescription>Vale só aqui. Os outros computadores continuam como estão.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          <Linha titulo="Modo" detalhe="Balcão é a tela simplificada da recepção.">
            <Segmentos
              rotulo="Modo deste computador"
              dataTour="config-modo"
              valor={modo}
              opcoes={[["standard", "Sistema completo"], ["counter", "Balcão"]]}
              aoMudar={(proximo) => {
                setModo(proximo);
                setAppMode(proximo);
                if (proximo === "counter") navigate("/balcao");
              }}
            />
          </Linha>
          {modo === "standard" && (
            <Linha titulo="Abrir o app em" detalhe="Tela que aparece depois de entrar.">
              <Segmentos
                rotulo="Abrir o app em"
                valor={inicial}
                opcoes={[["inicio", "Início"], ["equipamentos", "Equipamentos"]]}
                aoMudar={(proxima) => {
                  setInicial(proxima);
                  definirTelaInicial(proxima);
                }}
              />
            </Linha>
          )}
          <Linha titulo="Tamanho do texto">
            <Segmentos
              rotulo="Tamanho do texto"
              valor={texto}
              opcoes={[["normal", "Normal"], ["grande", "Grande"], ["maior", "Maior"]]}
              aoMudar={(proximo) => {
                setTexto(proximo);
                definirTamanhoTexto(proximo);
              }}
            />
          </Linha>
          <Opcao
            id="geral-animacoes"
            titulo="Reduzir animações"
            detalhe="Telas mudam sem transição. Ajuda em computador mais lento."
            marcado={reduzidas}
            aoMudar={(valor) => {
              setReduzidas(valor);
              definirAnimacoesReduzidas(valor);
            }}
          />
          <Opcao
            id="geral-sons"
            titulo="Sons da interface"
            detalhe="Sons curtos ao entrar e concluir o primeiro acesso."
            marcado={sons}
            aoMudar={(valor) => {
              setSons(valor);
              setUiSoundsEnabled(valor);
            }}
          />
          <Opcao
            id="geral-windows"
            titulo="Avisar no Windows"
            detalhe="Quando o AutoOS estiver minimizado ou atrás de outra janela."
            marcado={windows}
            aoMudar={(valor) => {
              setWindows(valor);
              definirAvisosWindows(valor);
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Versão do AutoOS</CardTitle>
        </CardHeader>
        <CardContent>
          <UpdateChecker />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center gap-3 p-5">
          <span
            aria-hidden="true"
            className={cn("h-2.5 w-2.5 shrink-0 rounded-full", conectado ? "bg-status-ok" : "bg-status-bad")}
          />
          <div>
            <p className="text-sm font-semibold">{conectado ? "Conectado ao servidor" : "Sem conexão com o servidor"}</p>
            <p className="text-xs text-muted-foreground">
              {conectado ? "Os dados estão sendo lidos e gravados normalmente." : "Verifique a internet. Se continuar, chame quem administra o sistema."}
            </p>
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}

function Linha({ titulo, detalhe, children }: { titulo: string; detalhe?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium">{titulo}</p>
        {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
      </div>
      {children}
    </div>
  );
}

function Opcao({
  id,
  titulo,
  detalhe,
  marcado,
  aoMudar,
}: {
  id: string;
  titulo: string;
  detalhe: string;
  marcado: boolean;
  aoMudar: (valor: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{titulo}</span>
        <span className="block text-xs text-muted-foreground">{detalhe}</span>
      </span>
      <Checkbox id={id} aria-label={titulo} checked={marcado} onCheckedChange={(valor) => aoMudar(valor === true)} />
    </label>
  );
}

function Segmentos<T extends string>({
  rotulo,
  valor,
  opcoes,
  aoMudar,
  dataTour,
}: {
  rotulo: string;
  valor: T;
  opcoes: ReadonlyArray<readonly [T, string]>;
  aoMudar: (valor: T) => void;
  dataTour?: string;
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} data-tour={dataTour} className="inline-flex shrink-0 gap-1 rounded-lg bg-muted p-1">
      {opcoes.map(([opcao, texto]) => (
        <button
          key={opcao}
          type="button"
          role="radio"
          aria-checked={valor === opcao}
          onClick={() => valor !== opcao && aoMudar(opcao)}
          className={cn(
            "h-8 rounded-md px-3 text-sm transition-colors duration-rapida focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            valor === opcao ? "bg-background font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {texto}
        </button>
      ))}
    </div>
  );
}
