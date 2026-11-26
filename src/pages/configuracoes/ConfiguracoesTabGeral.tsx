import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { TabsContent } from "@/components/ui/tabs";
import { UpdateChecker } from "@/components/UpdateChecker";
import { getAppMode, setAppMode, type AppMode } from "@/lib/app-mode";
import { avisosWindowsLigados, definirAvisosWindows } from "@/lib/notificacao-sistema";
import {
  animacoesReduzidasAqui,
  definirAnimacoesReduzidas,
  definirDensidade,
  densidade as densidadeAtual,
  type Densidade,
  definirTamanhoTexto,
  definirTelaInicial,
  tamanhoTexto,
  telaInicial,
  type TamanhoTexto,
  type TelaInicial,
} from "@/lib/preferencias-computador";
import { setUiSoundsEnabled, uiSoundsEnabled } from "@/lib/ui-sounds";
import { cn } from "@/lib/utils";
import { mensagemVisivelAoOperador } from "@/lib/operator-errors";
import { profileAppearance, type ProfileTheme } from "@/lib/profile-appearance";
import { SensitiveAccessService } from "@/lib/sensitive-access";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";

/**
 * Configurações › Geral, aberta a qualquer perfil. Tudo aqui é deste computador (localStorage),
 * menos o tema, que é do perfil (o mesmo de Perfil › Personalizar) e por isso só aparece com a
 * sessão aberta.
 */
export function ConfiguracoesTabGeral({ conectado }: { conectado: boolean }) {
  const navigate = useNavigate();
  const { status, refreshStatus } = useSensitiveAccess();
  const { setTheme } = useTheme();
  const perfil = status?.unlocked ? status.profiles.find((item) => item.id === status.active_profile_id) : undefined;
  const [tema, setTema] = useState<ProfileTheme | null>(null);
  const temaAtual: ProfileTheme = tema ?? (perfil ? profileAppearance(perfil).theme : "light");
  const [salvandoTema, setSalvandoTema] = useState(false);
  const [modo, setModo] = useState<AppMode>(() => getAppMode() ?? "standard");
  const [texto, setTexto] = useState<TamanhoTexto>(tamanhoTexto);
  const [listas, setListas] = useState<Densidade>(densidadeAtual);
  const [reduzidas, setReduzidas] = useState(animacoesReduzidasAqui);
  const [inicial, setInicial] = useState<TelaInicial>(telaInicial);
  const [sons, setSons] = useState(uiSoundsEnabled);
  const [windows, setWindows] = useState(avisosWindowsLigados);

  // `tema` só segura a escolha enquanto ela é gravada; depois vale o que está no perfil.
  // Trocar de perfil sem sair da tela também descarta a escolha pendente do perfil anterior.
  const perfilId = perfil?.id ?? null;
  useEffect(() => {
    setTema(null);
  }, [perfilId]);

  async function trocarTema(proximo: ProfileTheme) {
    const anterior = temaAtual;
    setTema(proximo);
    setTheme(proximo);
    setSalvandoTema(true);
    try {
      await SensitiveAccessService.saveTheme(proximo);
      await refreshStatus();
    } catch (causa) {
      setTheme(anterior);
      toast.error(mensagemVisivelAoOperador(causa) ?? "Não foi possível salvar o tema.");
    } finally {
      setTema(null);
      setSalvandoTema(false);
    }
  }

  return (
    <TabsContent value="geral" className="mt-0 space-y-4 p-5 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aparência</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {perfil && (
            <Linha titulo="Tema">
              <Segmentos
                rotulo="Tema"
                valor={temaAtual}
                desabilitado={salvandoTema}
                opcoes={[["light", "Claro"], ["dark", "Escuro"], ["system", "Sistema"]]}
                aoMudar={(proximo) => void trocarTema(proximo)}
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
          <Linha titulo="Listas">
            <Segmentos
              rotulo="Listas"
              valor={listas}
              opcoes={[["confortavel", "Confortáveis"], ["compacta", "Compactas"]]}
              aoMudar={(proxima) => {
                setListas(proxima);
                definirDensidade(proxima);
              }}
            />
          </Linha>
          <Opcao
            id="geral-animacoes"
            titulo="Reduzir animações"
            marcado={reduzidas}
            aoMudar={(valor) => {
              setReduzidas(valor);
              definirAnimacoesReduzidas(valor);
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Este computador</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          <Linha titulo="Modo">
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
            <Linha titulo="Abrir o app em">
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
          <Opcao
            id="geral-sons"
            titulo="Sons da interface"
            marcado={sons}
            aoMudar={(valor) => {
              setSons(valor);
              setUiSoundsEnabled(valor);
            }}
          />
          <Opcao
            id="geral-windows"
            titulo="Avisar no Windows"
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
            {!conectado && (
              <p className="text-xs text-muted-foreground">Verifique a internet. Se continuar, chame quem administra o sistema.</p>
            )}
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
  detalhe?: string;
  marcado: boolean;
  aoMudar: (valor: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{titulo}</span>
        {detalhe && <span className="block text-xs text-muted-foreground">{detalhe}</span>}
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
  desabilitado = false,
}: {
  rotulo: string;
  desabilitado?: boolean;
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
          disabled={desabilitado}
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
