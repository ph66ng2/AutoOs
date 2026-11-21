import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, FileWarning, ImagePlus, Send, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TeclaNoBotao } from "@/components/ui/tecla-no-botao";
import { useMensagensChamado, useSuporte } from "@/hooks/useSuporte";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { formatDateTimeSalvador, parseDbTimestampUtc } from "@/lib/date-utils";
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

function quando(valor: string) {
  return formatDateTimeSalvador(parseDbTimestampUtc(valor), "");
}

/**
 * Suporte (só a BMITAG): a pessoa conta o problema, cola prints e envia. O chamado vira uma
 * thread no Slack; o atendimento responde lá e a resposta aparece aqui.
 */
export default function Suporte() {
  const location = useLocation();
  const navigate = useNavigate();
  const pedido = (location.state ?? {}) as EstadoSuporte;
  const { config, chamados, loading, error, abrirChamado } = useSuporte();
  const { hasPermission } = useSensitiveAccess();
  const [texto, setTexto] = useState("");
  const [prints, setPrints] = useState<Print[]>([]);
  const [relatorio, setRelatorio] = useState<string | null>(pedido.relatorioErro ?? null);
  // A tela de onde veio o erro é guardada já na abertura (o estado da navegação é limpo logo depois).
  const [telaDoErro] = useState<string | null>(pedido.tela ?? null);
  const [verRelatorio, setVerRelatorio] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroPrint, setErroPrint] = useState<string | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const textoRef = useRef<HTMLTextAreaElement>(null);

  // O relatório veio pelo estado da navegação: limpa o estado para um F5 não anexar de novo.
  useEffect(() => {
    if (pedido.relatorioErro) navigate(location.pathname, { replace: true, state: {} });
    textoRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const configurado = Boolean(config?.token_neste_computador && config.canal);

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
      const chamado = await abrirChamado({
        texto: texto.trim(),
        tela: telaDoErro,
        versao: versaoDoApp() ?? null,
        relatorio_erro: relatorio,
        imagens: prints.map(({ nome, base64 }) => ({ nome, base64 })),
      });
      toast.success(`Chamado #${chamado.id} enviado.`, { description: "A resposta aparece aqui e no sino." });
      setTexto("");
      setPrints([]);
      setRelatorio(null);
    } catch (causa) {
      toast.error("Não foi possível enviar o chamado.", { description: mensagemVisivelAoOperador(causa) ?? String(causa) });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader titulo="Suporte" />

      {!loading && !configurado && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <p className="text-sm">O suporte ainda não foi configurado neste computador.</p>
            {hasPermission(SENSITIVE_PERMISSIONS.COMMUNICATION_SETTINGS) && (
              <Button asChild variant="outline" size="sm"><Link to="/configuracoes?aba=smtp">Configurar</Link></Button>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Novo chamado</CardTitle>
        </CardHeader>
        <CardContent
          className="space-y-4"
          onPaste={(evento) => {
            const arquivos = imagensDaAreaDeTransferencia(evento.clipboardData);
            if (arquivos.length === 0) return;
            evento.preventDefault();
            void adicionarPrints(arquivos);
          }}
        >
          {relatorio && (
            <div className="rounded-xl border bg-muted/40 px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <FileWarning className="h-4 w-4 shrink-0 text-status-bad" aria-hidden="true" />
                <span className="flex-1 font-medium">Relatório do erro anexado</span>
                <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline" aria-expanded={verRelatorio} onClick={() => setVerRelatorio((v) => !v)}>
                  {verRelatorio ? "Esconder" : "Ver"}
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-rapida", verRelatorio && "rotate-180")} aria-hidden="true" />
                </button>
                <button type="button" aria-label="Remover relatório do erro" className="text-muted-foreground hover:text-foreground" onClick={() => setRelatorio(null)}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              {verRelatorio && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{relatorio}</pre>}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="suporte-texto">O que aconteceu?</Label>
            <Textarea
              id="suporte-texto"
              ref={textoRef}
              rows={5}
              maxLength={4000}
              value={texto}
              placeholder="Conte o que estava fazendo e o que deu errado."
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void enviar();
                }
              }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {prints.map((print, indice) => (
              <div key={`${print.nome}-${indice}`} className="relative h-16 w-24 overflow-hidden rounded-lg border bg-muted">
                <img src={print.previa} alt={`Print ${indice + 1}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  aria-label={`Remover print ${indice + 1}`}
                  className="absolute right-1 top-1 rounded-full bg-background/90 p-0.5 text-muted-foreground hover:text-foreground"
                  onClick={() => setPrints((atual) => atual.filter((_, i) => i !== indice))}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {prints.length < MAX_PRINTS && (
              <Button type="button" variant="outline" size="sm" onClick={() => arquivoRef.current?.click()}>
                <ImagePlus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Anexar print
              </Button>
            )}
            <span className="text-xs text-muted-foreground">Ctrl+V cola um print. Não cole senhas.</span>
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
          {erroPrint && <p role="alert" className="text-sm text-destructive">{erroPrint}</p>}

          <div className="flex justify-end">
            <Button type="button" onClick={() => void enviar()} disabled={!texto.trim() || enviando || !configurado}>
              <Send className="mr-2 h-4 w-4" aria-hidden="true" />
              {enviando ? "Enviando..." : "Enviar"}
              {!enviando && <TeclaNoBotao tecla="Ctrl+Enter" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Meus chamados</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {error && <p role="alert" className="px-6 pb-4 text-sm text-destructive">{error}</p>}
          {!loading && chamados.length === 0 && <p className="px-6 pb-6 text-sm text-muted-foreground">Nenhum chamado ainda.</p>}
          <ul className="divide-y">
            {chamados.map((chamado) => <ItemChamado key={chamado.id} chamado={chamado} />)}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function ItemChamado({ chamado }: { chamado: ChamadoSuporte }) {
  const [aberto, setAberto] = useState(false);
  const mensagens = useMensagensChamado(chamado.id, aberto, `${chamado.atualizado_em}-${chamado.respostas}`);

  return (
    <li>
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-start gap-3 px-6 py-3 text-left transition-colors duration-rapida hover:bg-muted/50"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-sm font-semibold">
            Chamado #{chamado.id}
            <span className={cn("rounded-full px-2 text-[11px] font-semibold", chamado.situacao === "resolvido" ? "bg-status-ok-bg text-status-ok" : "bg-status-work-bg text-status-work")}>
              {chamado.situacao === "resolvido" ? "Resolvido" : "Aberto"}
            </span>
            {chamado.respostas > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                {chamado.respostas === 1 ? "1 resposta" : `${chamado.respostas} respostas`}
              </span>
            )}
          </span>
          <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{chamado.texto}</span>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">{quando(chamado.criado_em)}</span>
      </button>
      {aberto && (
        <div className="space-y-2 px-6 pb-4">
          {mensagens === null && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {mensagens?.map((mensagem) => (
            <div
              key={mensagem.id}
              className={cn("rounded-xl px-3 py-2 text-sm", mensagem.autor === "pessoa" ? "ml-8 bg-primary/10" : "mr-8 bg-muted")}
            >
              <p className="mb-0.5 text-xs text-muted-foreground">
                {mensagem.autor === "pessoa" ? "Você" : mensagem.autor_nome || "Suporte"}
                {mensagem.automatica && " · resposta automática"}
                {" · "}{quando(mensagem.criado_em)}
              </p>
              <p className="whitespace-pre-wrap">{mensagem.texto}</p>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}
