import { useEffect, useRef, useState } from "react";
import { Check, Copy, KeyRound, Mail, MessageCircle, UserRound } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/lib/db";
import { montarLinkEmail, montarLinkWhatsapp } from "@/lib/contato-cliente";
import type { EnvioManualOrcamento } from "@/types";

interface EnvioManualOrcamentoDialogProps {
  envio: EnvioManualOrcamento | null;
  onFechar: () => void;
  onGerarNovaSenha?: () => Promise<EnvioManualOrcamento | null>;
}

const botaoGrupo = "rounded-none active:scale-[0.96] [transition-property:scale,background-color,color]";

function mensagemFalha(cause: unknown, fallback: string) {
  return typeof cause === "string" && cause.trim() ? cause : fallback;
}

export function EnvioManualOrcamentoDialog({ envio, onFechar, onGerarNovaSenha }: EnvioManualOrcamentoDialogProps) {
  const [atual, setAtual] = useState<EnvioManualOrcamento | null>(envio);
  const [usou, setUsou] = useState(false);
  const [confirmarFechar, setConfirmarFechar] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const timerCopiado = useRef<number>();

  useEffect(() => {
    setAtual(envio);
    setUsou(false);
    setConfirmarFechar(false);
    setErro(null);
    setCopiado(false);
  }, [envio]);

  useEffect(() => () => window.clearTimeout(timerCopiado.current), []);

  const linkWhatsapp = atual ? montarLinkWhatsapp(atual.destinatario.telefone, atual.texto) : null;
  const linkEmail = atual ? montarLinkEmail(atual.destinatario.email, atual.assunto, atual.texto) : null;
  const podeGerar = Boolean(atual?.podeGerarNovaSenha && onGerarNovaSenha);

  async function abrir(url: string | null) {
    if (!url) return;
    try {
      await db.abrirUrl(url);
      setUsou(true);
    } catch (cause) {
      toast.error(mensagemFalha(cause, "Não foi possível abrir o aplicativo."));
    }
  }

  async function copiar() {
    if (!atual) return;
    try {
      await navigator.clipboard.writeText(atual.texto);
      setUsou(true);
      setCopiado(true);
      window.clearTimeout(timerCopiado.current);
      timerCopiado.current = window.setTimeout(() => setCopiado(false), 1600);
      toast.success("Texto copiado.");
    } catch {
      toast.error("Não foi possível copiar o texto.");
    }
  }

  function tentarFechar() {
    if (atual?.temSenha && !usou) {
      setConfirmarFechar(true);
      return;
    }
    onFechar();
  }

  async function gerarNovaSenha() {
    if (!onGerarNovaSenha) return;
    setGerando(true);
    setErro(null);
    try {
      const novo = await onGerarNovaSenha();
      if (novo) {
        setAtual(novo);
      } else {
        setErro("Não foi possível gerar uma nova senha.");
      }
    } catch (cause) {
      setErro(mensagemFalha(cause, "Não foi possível gerar uma nova senha."));
    } finally {
      setGerando(false);
    }
  }

  return (
    <>
      <Dialog open={envio !== null} onOpenChange={(aberto) => !aberto && tentarFechar()}>
        <DialogContent className="gap-5 sm:max-w-xl">
          <DialogHeader className="space-y-1.5 pr-6">
            <DialogTitle>Enviar manualmente</DialogTitle>
            <DialogDescription>
              Escolha como entregar o orçamento ao destinatário.
            </DialogDescription>
          </DialogHeader>

          {atual && (
            <div className="grid gap-4">
              <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground shadow-[0_0_0_1px_rgba(0,0,0,0.08)]">
                  <UserRound className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 text-sm">
                  <p className="truncate font-medium">{atual.destinatario.nome}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[atual.destinatario.telefone, atual.destinatario.email].filter(Boolean).join(" · ") || "Sem telefone ou e-mail"}
                  </p>
                </div>
              </div>

              <Textarea
                value={atual.texto}
                readOnly
                rows={10}
                aria-label="Texto do orçamento"
                className="h-56 resize-none bg-muted/30 text-sm leading-relaxed"
              />

              {atual.temSenha && !usou && (
                <p className="flex items-start gap-2 text-xs text-amber-700">
                  <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  Esta mensagem contém a senha do portal, que não será exibida de novo depois que você fechar.
                </p>
              )}

              {!atual.temSenha && podeGerar && (
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <p>Esta mensagem está sem a senha de acesso ao portal.</p>
                  <Button variant="ghost" size="sm" className="-mr-2 shrink-0 gap-1.5 text-foreground" disabled={gerando} onClick={() => void gerarNovaSenha()}>
                    <KeyRound className="h-3.5 w-3.5" aria-hidden />
                    Gerar nova senha
                  </Button>
                </div>
              )}

              {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
            </div>
          )}

          <DialogFooter className="items-center gap-3 border-t pt-4 sm:justify-between sm:space-x-0">
            {atual ? (
              <div role="group" aria-label="Enviar" className="inline-flex divide-x overflow-hidden rounded-md border bg-background">
                <Button
                  variant="ghost"
                  className={botaoGrupo}
                  disabled={!linkWhatsapp}
                  onClick={() => void abrir(linkWhatsapp)}
                >
                  <MessageCircle className="mr-2 h-4 w-4" aria-hidden />
                  Abrir WhatsApp
                </Button>
                <Button
                  variant="ghost"
                  className={botaoGrupo}
                  disabled={!linkEmail}
                  onClick={() => void abrir(linkEmail)}
                >
                  <Mail className="mr-2 h-4 w-4" aria-hidden />
                  Abrir e-mail
                </Button>
                <Button variant="ghost" className={botaoGrupo} onClick={() => void copiar()}>
                  <span className="relative mr-2 h-4 w-4" aria-hidden>
                    <Copy
                      className={cn(
                        "absolute inset-0 h-4 w-4 transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
                        copiado ? "scale-[0.25] opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-0",
                      )}
                    />
                    <Check
                      className={cn(
                        "absolute inset-0 h-4 w-4 text-emerald-600 transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
                        copiado ? "scale-100 opacity-100 blur-0" : "scale-[0.25] opacity-0 blur-[4px]",
                      )}
                    />
                  </span>
                  Copiar
                </Button>
              </div>
            ) : <span />}
            <Button variant="outline" onClick={tentarFechar}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmarFechar} onOpenChange={setConfirmarFechar}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>A senha não aparece de novo.</AlertDialogTitle>
            <AlertDialogDescription>
              {podeGerar
                ? "Copie ou envie antes de fechar, ou gere uma nova senha."
                : "Copie ou envie antes de fechar."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <Button
              variant="ghost"
              onClick={() => {
                setConfirmarFechar(false);
                onFechar();
              }}
            >
              Fechar mesmo assim
            </Button>
            {podeGerar && (
              <Button
                variant="secondary"
                disabled={gerando}
                onClick={() => {
                  setConfirmarFechar(false);
                  void gerarNovaSenha();
                }}
              >
                Gerar nova senha
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
