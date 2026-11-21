import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Check, ChevronLeft, Download, ExternalLink, FileWarning, Headphones, ImagePlus, Plus, Send, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { TeclaNoBotao } from "@/components/ui/tecla-no-botao";
import { useMensagensChamado, useSuporte } from "@/hooks/useSuporte";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { useLarguraMinima } from "@/hooks/useLarguraMinima";
import { useAvisoAoSair } from "@/hooks/useAvisoAoSair";
import { formatDateTimeSalvador, parseTimestampPostgres } from "@/lib/date-utils";
import { imagensDaAreaDeTransferencia } from "@/lib/equipamento-imagem-utils";
import { versaoDoApp } from "@/lib/error-utils";
import { mensagemVisivelAoOperador } from "@/lib/operator-errors";
import { cn } from "@/lib/utils";
import { linkDeDownload, segmentosDoSuporte } from "@/lib/suporte-links";
import { abrirLinkDoSuporte } from "@/lib/suporte-ponte";
import { SENSITIVE_PERMISSIONS, type ChamadoSuporte } from "@/types";

const MAX_PRINTS = 3;
const MAX_BYTES = 5 * 1024 * 1024;

type Print = { nome: string; previa: string; base64: string };
const RASCUNHO_VAZIO: Rascunho = { texto: "", prints: [] };

/** Estado que "Enviar ao suporte" (aviso de erro ou sino) passa ao abrir esta página. */
export interface EstadoSuporte {
  relatorioErro?: string;
  tela?: string;
  /** Abre este chamado (ex.: "Ver" no aviso de resposta do suporte). */
  chamadoId?: number;
}

function lerComoDataUrl(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(leitor.error ?? new Error("Não foi possível ler o print."));
    leitor.readAsDataURL(arquivo);
  });
}

/** Prints que o Slack não recebeu (pelas posições que o backend devolve). */
function printsNaoEnviados(resultado: ChamadoSuporte | undefined, enviados: Print[]): Print[] {
  return (resultado?.prints_nao_enviados ?? []).map((posicao) => enviados[posicao]).filter((print): print is Print => Boolean(print));
}

function avisarPrintsNaoEnviados(falhos: Print[], inicio = "Mensagem enviada") {
  if (falhos.length === 0) return;
  toast.warning(`${inicio}, mas ${falhos.length === 1 ? "1 print não chegou" : `${falhos.length} prints não chegaram`} ao suporte.`, {
    description: `${falhos.length === 1 ? "Ele ficou" : "Eles ficaram"} na caixa de resposta do chamado. Envie de novo.`,
    duration: 15_000,
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
/**
 * A página é do perfil da sessão: trocar de perfil com ela aberta remonta tudo (lista, conversa,
 * rascunhos), e o que ainda chegasse do perfil anterior cai junto com a montagem antiga.
 */
export default function Suporte() {
  const { status } = useSensitiveAccess();
  return <SuporteDoPerfil key={status?.active_profile_id ?? "sem-perfil"} />;
}

function SuporteDoPerfil() {
  const location = useLocation();
  const navigate = useNavigate();
  const pedido = (location.state ?? {}) as EstadoSuporte;
  const { config, chamados, loading, error, abrirChamado, responder, retorno } = useSuporte();
  const { hasPermission } = useSensitiveAccess();
  const telaLarga = useLarguraMinima(1024);
  const [selecionado, setSelecionado] = useState<number | "novo">(pedido.chamadoId ?? "novo");
  const [relatorio, setRelatorio] = useState<string | null>(pedido.relatorioErro ?? null);
  // A tela de onde veio o erro é guardada ao chegar (o estado da navegação é limpo logo depois).
  const [telaDoErro, setTelaDoErro] = useState<string | null>(pedido.tela ?? null);
  const relatorioRef = useRef(relatorio);
  relatorioRef.current = relatorio;
  // No celular, a lista e a conversa não cabem lado a lado: uma de cada vez.
  const [conversaNoCelular, setConversaNoCelular] = useState(Boolean(pedido.relatorioErro || pedido.chamadoId));
  // Os rascunhos ficam aqui, acima da conversa ("novo" e um por chamado): olhar a lista ou outro
  // chamado não apaga o que foi escrito.
  const [rascunhos, setRascunhos] = useState<Record<string, Rascunho>>({});
  const rascunhoDe = (chave: string): Rascunho => rascunhos[chave] ?? RASCUNHO_VAZIO;
  const guardarRascunho = (chave: string) => (proximo: Rascunho) => setRascunhos((atual) => ({ ...atual, [chave]: proximo }));
  // O envio em andamento também fica aqui: trocar de tela e voltar não libera um segundo envio.
  const [enviando, setEnviando] = useState<string | null>(null);
  const enviandoRef = useRef<string | null>(null);
  // Sair de /suporte com algo escrito ou print anexado e não enviado pede confirmação.
  const temRascunho = Object.values(rascunhos).some((r) => r.texto.trim() !== "" || r.prints.length > 0);
  const avisoAoSair = useAvisoAoSair(temRascunho);

  async function comTrava(chave: string, acao: () => Promise<void>, erro: string) {
    if (enviandoRef.current) return;
    enviandoRef.current = chave;
    setEnviando(chave);
    try {
      await acao();
    } catch (causa) {
      toast.error(erro, { description: mensagemVisivelAoOperador(causa) ?? String(causa) });
    } finally {
      enviandoRef.current = null;
      setEnviando(null);
    }
  }

  // Relatório de erro pelo estado da navegação, inclusive com a página já aberta ("Enviar ao suporte"
  // no sino estando em /suporte): troca o anexo, abre o novo chamado e limpa o estado para um F5
  // não anexar de novo.
  useEffect(() => {
    if (pedido.chamadoId) {
      setSelecionado(pedido.chamadoId);
      setConversaNoCelular(true);
      navigate(location.pathname, { replace: true, state: {} });
      return;
    }
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

      {avisoAoSair.dialogo}
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
              <Conversa
                key={chamadoAberto.id}
                chamado={chamadoAberto}
                configurado={configurado}
                rascunho={rascunhoDe(`c${chamadoAberto.id}`)}
                onRascunho={guardarRascunho(`c${chamadoAberto.id}`)}
                enviando={enviando != null}
                onResponder={(texto, prints) => {
                  const chave = `c${chamadoAberto.id}`;
                  void comTrava(chave, async () => {
                    const resposta = await responder({ id: chamadoAberto.id, texto, imagens: prints.map(({ nome, base64 }) => ({ nome, base64 })) });
                    const falhos = printsNaoEnviados(resposta, prints);
                    setRascunhos((atual) => ({ ...atual, [chave]: { texto: "", prints: falhos } }));
                    avisarPrintsNaoEnviados(falhos);
                  }, "Não foi possível enviar a mensagem.");
                }}
                onRetorno={(resolvido) => {
                  void comTrava(`c${chamadoAberto.id}`, async () => {
                    await retorno(chamadoAberto.id, resolvido);
                    if (resolvido) toast.success(`Chamado #${chamadoAberto.id} encerrado. Obrigado pelo retorno.`);
                  }, "Não foi possível registrar o retorno.");
                }}
              />
            ) : (
              <NovoChamado
                configurado={configurado}
                relatorio={relatorio}
                rascunho={rascunhoDe("novo")}
                onRascunho={guardarRascunho("novo")}
                onRemoverRelatorio={() => setRelatorio(null)}
                enviando={enviando != null}
                onEnviar={(texto, prints) => {
                  void comTrava("novo", async () => {
                    const relatorioEnviado = relatorio;
                    const chamado = await abrirChamado({
                      texto,
                      tela: telaDoErro,
                      versao: versaoDoApp() ?? null,
                      relatorio_erro: relatorioEnviado,
                      imagens: prints.map(({ nome, base64 }) => ({ nome, base64 })),
                    });
                    // Um erro novo enviado ao suporte durante o envio continua anexado ao próximo.
                    if (relatorioRef.current === relatorioEnviado) {
                      setRelatorio(null);
                      setTelaDoErro(null);
                    }
                    const falhos = printsNaoEnviados(chamado, prints);
                    // Prints que não chegaram ficam na caixa de resposta do chamado, para reenviar.
                    setRascunhos((atual) => ({ ...atual, novo: RASCUNHO_VAZIO, [`c${chamado.id}`]: { texto: "", prints: falhos } }));
                    setSelecionado(chamado.id);
                    if (falhos.length === 0) toast.success(`Chamado #${chamado.id} enviado.`);
                    else avisarPrintsNaoEnviados(falhos, `Chamado #${chamado.id} enviado`);
                  }, "Não foi possível enviar o chamado.");
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

/** Negrito (`*x*`) e itálico (`_x_`) do Slack, sem interpretar HTML. */
function Enfase({ texto }: { texto: string }) {
  const partes = texto.split(/(\*[^*\n]+\*|_[^_\n]+_)/g);
  return (
    <>
      {partes.map((parte, i) => {
        if (parte.length > 2 && parte.startsWith("*") && parte.endsWith("*")) return <strong key={i}>{parte.slice(1, -1)}</strong>;
        if (parte.length > 2 && parte.startsWith("_") && parte.endsWith("_")) return <em key={i}>{parte.slice(1, -1)}</em>;
        return parte;
      })}
    </>
  );
}

/**
 * Resposta do suporte: ênfase do Slack e links da allowlist (`suporte-links.ts`), montados com
 * elementos React. O link abre no navegador padrão (`abrir_url`), nunca dentro do app.
 */
export function TextoDoSlack({ texto }: { texto: string }) {
  return (
    <>
      {segmentosDoSuporte(texto).map((segmento, i) =>
        segmento.tipo === "texto" ? (
          <Enfase key={i} texto={segmento.texto} />
        ) : (
          <button
            key={i}
            type="button"
            role="link"
            title={segmento.url}
            className="inline-flex items-baseline gap-1 rounded-sm font-semibold text-primary underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => {
              abrirLinkDoSuporte(segmento.url).catch((causa) => {
                toast.error("Não foi possível abrir o link.", { description: mensagemVisivelAoOperador(causa) ?? String(causa) });
              });
            }}
          >
            {linkDeDownload(segmento.url)
              ? <Download className="h-3.5 w-3.5 shrink-0 self-center" aria-hidden="true" />
              : <ExternalLink className="h-3.5 w-3.5 shrink-0 self-center" aria-hidden="true" />}
            {segmento.texto}
          </button>
        ),
      )}
    </>
  );
}

export type Rascunho = { texto: string; prints: Print[] };

function Conversa({
  chamado,
  configurado,
  rascunho,
  onRascunho,
  enviando,
  onResponder,
  onRetorno,
}: {
  chamado: ChamadoSuporte;
  configurado: boolean;
  rascunho: Rascunho;
  onRascunho: (proximo: Rascunho) => void;
  enviando: boolean;
  onResponder: (texto: string, prints: Print[]) => void;
  onRetorno: (resolvido: boolean) => void;
}) {
  const mensagens = useMensagensChamado(chamado.id, true, `${chamado.atualizado_em}-${chamado.respostas}`);
  const fimRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    fimRef.current?.scrollIntoView?.({ block: "end" });
  }, [mensagens]);
  const aberto = chamado.situacao === "aberto";
  // "Isso resolveu?" só depois de uma resposta do suporte que ainda não foi respondida.
  const perguntarRetorno = aberto && mensagens != null && mensagens.length > 0 && mensagens[mensagens.length - 1].autor === "suporte";

  return (
    <>
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
                  {minha ? mensagem.texto : <TextoDoSlack texto={mensagem.texto} />}
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
        {aberto && mensagens != null && !perguntarRetorno && mensagens.length > 0 && (
          <p className="text-center text-xs text-muted-foreground">A resposta aparece aqui assim que o suporte responder.</p>
        )}
        <div ref={fimRef} />
      </div>
      {aberto ? (
        <Compositor
          id={`suporte-resposta-${chamado.id}`}
          rotulo="Responder"
          placeholder="Escreva para o suporte…"
          configurado={configurado}
          enviando={enviando}
          rascunho={rascunho}
          onRascunho={onRascunho}
          onEnviar={onResponder}
          acima={perguntarRetorno ? (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="mr-auto font-medium">Isso resolveu?</span>
              <Button type="button" size="sm" variant="outline" className="h-8" disabled={enviando || !configurado} onClick={() => onRetorno(true)}>
                <Check className="h-4 w-4" aria-hidden="true" /> Resolveu
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-8" disabled={enviando || !configurado} onClick={() => onRetorno(false)}>
                Não resolveu
              </Button>
            </div>
          ) : null}
        />
      ) : (
        <p className="flex items-center justify-center gap-2 border-t px-5 py-4 text-sm text-muted-foreground">
          <Check className="h-4 w-4 text-status-ok" aria-hidden="true" />
          Chamado resolvido. Para outro assunto, abra um novo.
        </p>
      )}
    </>
  );
}

function NovoChamado({
  configurado,
  relatorio,
  enviando,
  rascunho,
  onRascunho,
  onRemoverRelatorio,
  onEnviar,
}: {
  configurado: boolean;
  relatorio: string | null;
  enviando: boolean;
  rascunho: Rascunho;
  onRascunho: (proximo: Rascunho) => void;
  onRemoverRelatorio: () => void;
  onEnviar: (texto: string, prints: Print[]) => void;
}) {
  const [verRelatorio, setVerRelatorio] = useState(false);
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto px-6 py-8 text-center">
        <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Headphones className="h-6 w-6" />
        </span>
        <p className="text-base font-semibold">Como podemos ajudar?</p>
        <p className="max-w-sm text-sm text-muted-foreground">Conte o que estava fazendo e o que deu errado. Um print ajuda muito.</p>
      </div>
      <Compositor
        id="suporte-texto"
        rotulo="O que aconteceu?"
        placeholder="Descreva o problema…"
        configurado={configurado}
        enviando={enviando}
        rascunho={rascunho}
        onRascunho={onRascunho}
        onEnviar={onEnviar}
        focarAoAbrir
        acima={relatorio ? (
          <div className="mb-3 rounded-xl bg-muted px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              <FileWarning className="h-4 w-4 shrink-0 text-status-bad" aria-hidden="true" />
              <span className="flex-1 font-medium">Relatório do erro anexado</span>
              <button type="button" className="text-xs font-semibold text-primary hover:underline" aria-expanded={verRelatorio} onClick={() => setVerRelatorio((v) => !v)}>
                {verRelatorio ? "Esconder" : "Ver"}
              </button>
              <button type="button" aria-label="Remover relatório do erro" disabled={enviando} className="text-muted-foreground hover:text-foreground disabled:opacity-50" onClick={onRemoverRelatorio}>
                <X className="h-4 w-4" />
              </button>
            </div>
            {verRelatorio && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{relatorio}</pre>}
          </div>
        ) : null}
      />
    </>
  );
}

/** Caixa de escrever (novo chamado ou resposta): texto, prints colados ou anexados, Ctrl+Enter. */
function Compositor({
  id,
  rotulo,
  placeholder,
  configurado,
  enviando,
  rascunho,
  onRascunho,
  onEnviar,
  acima,
  focarAoAbrir = false,
}: {
  id: string;
  rotulo: string;
  placeholder: string;
  configurado: boolean;
  enviando: boolean;
  rascunho: Rascunho;
  onRascunho: (proximo: Rascunho) => void;
  onEnviar: (texto: string, prints: Print[]) => void;
  acima?: ReactNode;
  focarAoAbrir?: boolean;
}) {
  const { texto, prints } = rascunho;
  const [erroPrint, setErroPrint] = useState<string | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const textoRef = useRef<HTMLTextAreaElement>(null);
  // Os prints são lidos em sequência (assíncrono): o rascunho mais recente vem pelo ref.
  const rascunhoRef = useRef(rascunho);
  rascunhoRef.current = rascunho;
  useEffect(() => {
    if (focarAoAbrir) textoRef.current?.focus();
  }, [focarAoAbrir]);

  async function adicionarPrints(arquivos: File[]) {
    setErroPrint(null);
    const vagas = MAX_PRINTS - rascunhoRef.current.prints.length;
    if (vagas <= 0) return setErroPrint(`No máximo ${MAX_PRINTS} prints por mensagem.`);
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
    if (arquivos.length > vagas) setErroPrint(`No máximo ${MAX_PRINTS} prints por mensagem.`);
    onRascunho({ ...rascunhoRef.current, prints: [...rascunhoRef.current.prints, ...novos].slice(0, MAX_PRINTS) });
  }

  function enviar() {
    if (!texto.trim() || enviando || !configurado) return;
    onEnviar(texto.trim(), prints);
  }

  return (
    <div
      className="border-t p-4"
      onPaste={(evento) => {
        if (enviando) return;
        const arquivos = imagensDaAreaDeTransferencia(evento.clipboardData);
        if (arquivos.length === 0) return;
        evento.preventDefault();
        void adicionarPrints(arquivos);
      }}
    >
      {acima}
      <div className="rounded-2xl border bg-background focus-within:ring-2 focus-within:ring-ring">
        <label htmlFor={id} className="sr-only">{rotulo}</label>
        <textarea
          id={id}
          ref={textoRef}
          rows={3}
          maxLength={4000}
          value={texto}
          // Enquanto envia, o rascunho fica parado: o que vai é o que está na tela.
          readOnly={enviando}
          aria-busy={enviando}
          placeholder={placeholder}
          onChange={(e) => onRascunho({ ...rascunho, texto: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              enviar();
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
                  disabled={enviando}
                  className="absolute right-1 top-1 rounded-full bg-background/90 p-0.5 text-muted-foreground hover:text-foreground"
                  onClick={() => onRascunho({ ...rascunho, prints: prints.filter((_, i) => i !== indice) })}
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
            disabled={enviando || prints.length >= MAX_PRINTS}
            onClick={() => arquivoRef.current?.click()}
          >
            <ImagePlus className="h-[18px] w-[18px]" />
          </Button>
          <span className="text-xs text-muted-foreground">Ctrl+V cola um print · não cole senhas</span>
          <Button type="button" size="sm" className="ml-auto h-9 gap-1.5" onClick={enviar} disabled={!texto.trim() || enviando || !configurado}>
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
  );
}
