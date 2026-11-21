import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, FileWarning, Headphones, ImagePlus, Plus, Send, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { TeclaNoBotao } from "@/components/ui/tecla-no-botao";
import { useMensagensChamado, useSuporte } from "@/hooks/useSuporte";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { useLarguraMinima } from "@/hooks/useLarguraMinima";
import { formatDateTimeSalvador, parseTimestampPostgres } from "@/lib/date-utils";
import { imagensDaAreaDeTransferencia } from "@/lib/equipamento-imagem-utils";
import { versaoDoApp } from "@/lib/error-utils";
import { mensagemVisivelAoOperador } from "@/lib/operator-errors";
import { cn } from "@/lib/utils";
import { SENSITIVE_PERMISSIONS, type ChamadoSuporte } from "@/types";

const MAX_PRINTS = 3;
const MAX_BYTES = 5 * 1024 * 1024;

type Print = { nome: string; previa: string; base64: string };

/** Estado que "Enviar ao suporte" (aviso de erro ou sino) passa ao abrir esta página. */
export interface EstadoSuporte {
  relatorioErro?: string;
  tela?: string;
}

function lerComoDataUrl(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(leitor.error ?? new Error("Não foi possível ler o print."));
    leitor.readAsDataURL(arquivo);
  });
}

/** "17/09/2026, 12:00" (sem segundos: numa conversa eles só pesam). */
function quando(valor: string) {
  return formatDateTimeSalvador(parseTimestampPostgres(valor), "").replace(/(\d{2}:\d{2}):\d{2}$/, "$1");
}

/**
 * Suporte (só a BMITAG), em forma de conversa: à esquerda os chamados, à direita o chamado
 * aberto, ou a caixa para escrever um novo. O chamado vira uma thread no Slack; o atendimento
 * responde lá e a resposta aparece aqui.
 */
export default function Suporte() {
  const location = useLocation();
  const navigate = useNavigate();
  const pedido = (location.state ?? {}) as EstadoSuporte;
  const { config, chamados, loading, error, abrirChamado } = useSuporte();
  const { hasPermission } = useSensitiveAccess();
  const telaLarga = useLarguraMinima(1024);
  const [selecionado, setSelecionado] = useState<number | "novo">("novo");
  const [relatorio, setRelatorio] = useState<string | null>(pedido.relatorioErro ?? null);
  // A tela de onde veio o erro é guardada ao chegar (o estado da navegação é limpo logo depois).
  const [telaDoErro, setTelaDoErro] = useState<string | null>(pedido.tela ?? null);
  // No celular, a lista e a conversa não cabem lado a lado: uma de cada vez.
  const [conversaNoCelular, setConversaNoCelular] = useState(Boolean(pedido.relatorioErro));
  // O rascunho fica aqui, acima da conversa: olhar a lista ou outro chamado não apaga o que foi escrito.
  const [rascunho, setRascunho] = useState("");
  const [prints, setPrints] = useState<Print[]>([]);

  // Relatório de erro pelo estado da navegação, inclusive com a página já aberta ("Enviar ao suporte"
  // no sino estando em /suporte): troca o anexo, abre o novo chamado e limpa o estado para um F5
  // não anexar de novo.
  useEffect(() => {
    if (!pedido.relatorioErro) return;
    setRelatorio(pedido.relatorioErro);
    setTelaDoErro(pedido.tela ?? null);
    setSelecionado("novo");
    setConversaNoCelular(true);
    navigate(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  const configurado = Boolean(config?.token_neste_computador && config.canal);
  const abertos = chamados.filter((c) => c.situacao === "aberto").length;
  const chamadoAberto = typeof selecionado === "number" ? chamados.find((c) => c.id === selecionado) ?? null : null;
  const mostrarLista = telaLarga || !conversaNoCelular;
  const mostrarConversa = telaLarga || conversaNoCelular;

  function escolher(alvo: number | "novo") {
    setSelecionado(alvo);
    setConversaNoCelular(true);
  }

  return (
    <div className="flex h-[calc(100vh-5rem)] min-h-[28rem] flex-col gap-4 lg:h-[calc(100vh-4rem)]">
      <PageHeader
        titulo="Suporte"
        descricao={loading ? "Carregando…" : abertos === 0 ? "Nenhum chamado em aberto" : abertos === 1 ? "1 chamado em aberto" : `${abertos} chamados em aberto`}
      >
        {!loading && (
          <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs font-semibold">
            <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", configurado ? "bg-status-ok" : "bg-status-wait")} />
            {configurado ? "Atendimento conectado" : "Não configurado neste computador"}
          </span>
        )}
      </PageHeader>

      <div className="grid min-h-0 flex-1 overflow-hidden rounded-2xl border bg-card lg:grid-cols-[300px_minmax(0,1fr)]">
        {mostrarLista && (
          <aside aria-label="Chamados" className="flex min-h-0 flex-col border-b bg-muted/30 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
              <h2 className="text-sm font-semibold">Chamados</h2>
              <Button type="button" size="sm" variant="outline" aria-pressed={selecionado === "novo"} className={cn("h-8 gap-1.5", selecionado === "novo" && "bg-card ring-1 ring-ring")} onClick={() => escolher("novo")}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Novo
              </Button>
            </div>
            <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
              {error && <li role="alert" className="px-2 py-2 text-sm text-destructive">{error}</li>}
              {!loading && chamados.length === 0 && <li className="px-2 py-3 text-sm text-muted-foreground">Nenhum chamado ainda.</li>}
              {chamados.map((chamado) => (
                <li key={chamado.id}>
                  <ItemDaLista chamado={chamado} ativo={selecionado === chamado.id} onEscolher={() => escolher(chamado.id)} />
                </li>
              ))}
            </ul>
          </aside>
        )}

        {mostrarConversa && (
          <section aria-label={chamadoAberto ? `Chamado #${chamadoAberto.id}` : "Novo chamado"} className="flex min-h-0 flex-col">
            <header className="flex items-center gap-3 border-b px-5 py-3.5">
              {!telaLarga && (
                <button type="button" aria-label="Voltar para os chamados" className="-ml-1 text-muted-foreground hover:text-foreground" onClick={() => setConversaNoCelular(false)}>
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              {chamadoAberto ? (
                <>
                  <h2 className="text-base font-semibold">Chamado #{chamadoAberto.id}</h2>
                  <SeloSituacao situacao={chamadoAberto.situacao} />
                  <span className="ml-auto text-xs text-muted-foreground">{quando(chamadoAberto.criado_em)}</span>
                </>
              ) : (
                <h2 className="text-base font-semibold">Novo chamado</h2>
              )}
            </header>

            {!loading && !configurado && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/50 px-5 py-2.5 text-sm">
                <span className="flex items-center gap-2">
                  <TriangleAlert className="h-4 w-4 shrink-0 text-status-wait" aria-hidden="true" />
                  O suporte ainda não foi configurado neste computador.
                </span>
                {hasPermission(SENSITIVE_PERMISSIONS.COMMUNICATION_SETTINGS) && (
                  <Button asChild variant="outline" size="sm" className="h-8 bg-card"><Link to="/configuracoes?aba=smtp">Configurar</Link></Button>
                )}
              </div>
            )}

            {chamadoAberto ? (
              <Conversa chamado={chamadoAberto} />
            ) : (
              <NovoChamado
                configurado={configurado}
                relatorio={relatorio}
                texto={rascunho}
                onTexto={setRascunho}
                prints={prints}
                onPrints={setPrints}
                onRemoverRelatorio={() => setRelatorio(null)}
                onEnviar={async (texto, prints) => {
                  const chamado = await abrirChamado({
                    texto,
                    tela: telaDoErro,
                    versao: versaoDoApp() ?? null,
                    relatorio_erro: relatorio,
                    imagens: prints.map(({ nome, base64 }) => ({ nome, base64 })),
                  });
                  setRelatorio(null);
                  setTelaDoErro(null);
                  setRascunho("");
                  setPrints([]);
                  setSelecionado(chamado.id);
                  toast.success(`Chamado #${chamado.id} enviado.`);
                }}
              />
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function SeloSituacao({ situacao }: { situacao: ChamadoSuporte["situacao"] }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", situacao === "resolvido" ? "bg-status-ok-bg text-status-ok" : "bg-status-wait-bg text-status-wait")}>
      {situacao === "resolvido" ? "Resolvido" : "Aberto"}
    </span>
  );
}

function ItemDaLista({ chamado, ativo, onEscolher }: { chamado: ChamadoSuporte; ativo: boolean; onEscolher: () => void }) {
  return (
    <button
      type="button"
      aria-current={ativo ? "true" : undefined}
      onClick={onEscolher}
      className={cn(
        "w-full rounded-xl px-3 py-2.5 text-left transition-colors duration-rapida",
        ativo ? "bg-card ring-1 ring-border" : "hover:bg-card/70",
      )}
    >
      <span className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={cn("h-2 w-2 shrink-0 rounded-full", chamado.situacao === "resolvido" ? "bg-status-ok" : "bg-status-wait")}
        />
        <span className="text-sm font-semibold">Chamado #{chamado.id}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">{quando(chamado.criado_em).split(",")[0]}</span>
      </span>
      <span className="mt-0.5 line-clamp-2 block pl-4 text-[13px] leading-snug text-muted-foreground">{chamado.texto}</span>
      {chamado.respostas > 0 && (
        <span className="mt-1 block pl-4 text-[11px] font-semibold text-foreground/80">
          {chamado.respostas === 1 ? "1 resposta" : `${chamado.respostas} respostas`}
        </span>
      )}
    </button>
  );
}

function Conversa({ chamado }: { chamado: ChamadoSuporte }) {
  const mensagens = useMensagensChamado(chamado.id, true, `${chamado.atualizado_em}-${chamado.respostas}`);
  const fimRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    fimRef.current?.scrollIntoView?.({ block: "end" });
  }, [mensagens]);

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
      {mensagens === null && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {mensagens?.map((mensagem) => {
        const minha = mensagem.autor === "pessoa";
        return (
          <div key={mensagem.id} className={cn("flex gap-2.5", minha && "flex-row-reverse")}>
            {!minha && (
              <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Headphones className="h-4 w-4" />
              </span>
            )}
            <div className={cn("flex max-w-[78%] flex-col", minha && "items-end")}>
              <div
                className={cn(
                  "whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                  minha ? "rounded-br-md bg-acc-soft text-acc-soft-foreground" : "rounded-bl-md bg-muted",
                )}
              >
                {mensagem.texto}
              </div>
              <span className="mt-1 px-1 text-[11px] text-muted-foreground">
                {minha ? "Você" : mensagem.autor_nome || "Suporte"}
                {mensagem.automatica && " · resposta automática"}
                {" · "}{quando(mensagem.criado_em)}
              </span>
            </div>
          </div>
        );
      })}
      <div ref={fimRef} />
    </div>
  );
}

function NovoChamado({
  configurado,
  relatorio,
  texto,
  onTexto: setTexto,
  prints,
  onPrints: setPrints,
  onRemoverRelatorio,
  onEnviar,
}: {
  configurado: boolean;
  relatorio: string | null;
  texto: string;
  onTexto: (texto: string) => void;
  prints: Print[];
  onPrints: Dispatch<SetStateAction<Print[]>>;
  onRemoverRelatorio: () => void;
  onEnviar: (texto: string, prints: Print[]) => Promise<void>;
}) {
  const [verRelatorio, setVerRelatorio] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroPrint, setErroPrint] = useState<string | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const textoRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    textoRef.current?.focus();
  }, []);

  async function adicionarPrints(arquivos: File[]) {
    setErroPrint(null);
    const vagas = MAX_PRINTS - prints.length;
    if (vagas <= 0) return setErroPrint(`No máximo ${MAX_PRINTS} prints por chamado.`);
    const novos: Print[] = [];
    for (const arquivo of arquivos.slice(0, vagas)) {
      if (!arquivo.type.startsWith("image/")) continue;
      if (arquivo.size > MAX_BYTES) {
        setErroPrint("Cada print pode ter até 5 MB.");
        continue;
      }
      const dataUrl = await lerComoDataUrl(arquivo);
      novos.push({ nome: arquivo.name, previa: dataUrl, base64: dataUrl.slice(dataUrl.indexOf(",") + 1) });
    }
    if (arquivos.length > vagas) setErroPrint(`No máximo ${MAX_PRINTS} prints por chamado.`);
    setPrints((atual) => [...atual, ...novos].slice(0, MAX_PRINTS));
  }

  async function enviar() {
    if (!texto.trim() || enviando || !configurado) return;
    setEnviando(true);
    try {
      await onEnviar(texto.trim(), prints);
    } catch (causa) {
      toast.error("Não foi possível enviar o chamado.", { description: mensagemVisivelAoOperador(causa) ?? String(causa) });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      onPaste={(evento) => {
        const arquivos = imagensDaAreaDeTransferencia(evento.clipboardData);
        if (arquivos.length === 0) return;
        evento.preventDefault();
        void adicionarPrints(arquivos);
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto px-6 py-8 text-center">
        <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Headphones className="h-6 w-6" />
        </span>
        <p className="text-base font-semibold">Como podemos ajudar?</p>
        <p className="max-w-sm text-sm text-muted-foreground">Conte o que estava fazendo e o que deu errado. Um print ajuda muito.</p>
      </div>

      <div className="border-t p-4">
        {relatorio && (
          <div className="mb-3 rounded-xl bg-muted px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              <FileWarning className="h-4 w-4 shrink-0 text-status-bad" aria-hidden="true" />
              <span className="flex-1 font-medium">Relatório do erro anexado</span>
              <button type="button" className="text-xs font-semibold text-primary hover:underline" aria-expanded={verRelatorio} onClick={() => setVerRelatorio((v) => !v)}>
                {verRelatorio ? "Esconder" : "Ver"}
              </button>
              <button type="button" aria-label="Remover relatório do erro" className="text-muted-foreground hover:text-foreground" onClick={onRemoverRelatorio}>
                <X className="h-4 w-4" />
              </button>
            </div>
            {verRelatorio && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{relatorio}</pre>}
          </div>
        )}

        <div className="rounded-2xl border bg-background focus-within:ring-2 focus-within:ring-ring">
          <label htmlFor="suporte-texto" className="sr-only">O que aconteceu?</label>
          <textarea
            id="suporte-texto"
            ref={textoRef}
            rows={3}
            maxLength={4000}
            value={texto}
            placeholder="Descreva o problema…"
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void enviar();
              }
            }}
            className="block w-full resize-none rounded-t-2xl bg-transparent px-4 pt-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          {prints.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 pt-2">
              {prints.map((print, indice) => (
                <div key={`${print.nome}-${indice}`} className="relative h-14 w-20 overflow-hidden rounded-lg bg-muted outline outline-1 -outline-offset-1 outline-foreground/10">
                  <img src={print.previa} alt={`Print ${indice + 1}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    aria-label={`Remover print ${indice + 1}`}
                    className="absolute right-1 top-1 rounded-full bg-background/90 p-0.5 text-muted-foreground hover:text-foreground"
                    onClick={() => setPrints((atual) => atual.filter((_, i) => i !== indice))}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 px-2 pb-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground"
              aria-label="Anexar print"
              title="Anexar print (ou Ctrl+V)"
              disabled={prints.length >= MAX_PRINTS}
              onClick={() => arquivoRef.current?.click()}
            >
              <ImagePlus className="h-[18px] w-[18px]" />
            </Button>
            <span className="text-xs text-muted-foreground">Ctrl+V cola um print · não cole senhas</span>
            <Button type="button" size="sm" className="ml-auto h-9 gap-1.5" onClick={() => void enviar()} disabled={!texto.trim() || enviando || !configurado}>
              <Send className="h-4 w-4" aria-hidden="true" />
              {enviando ? "Enviando..." : "Enviar"}
              {!enviando && <TeclaNoBotao tecla="Ctrl+Enter" />}
            </Button>
          </div>
          <input
            ref={arquivoRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const arquivos = Array.from(e.target.files ?? []);
              e.target.value = "";
              void adicionarPrints(arquivos);
            }}
          />
        </div>
        {erroPrint && <p role="alert" className="mt-2 text-sm text-destructive">{erroPrint}</p>}
      </div>
    </div>
  );
}
