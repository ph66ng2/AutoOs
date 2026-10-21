import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/lib/db";
import { montarLinkEmail, montarLinkWhatsapp } from "@/lib/contato-cliente";
import type { EnvioManualOrcamento } from "@/types";

interface EnvioManualOrcamentoDialogProps {
  envio: EnvioManualOrcamento | null;
  onFechar: () => void;
  onGerarNovaSenha?: () => Promise<EnvioManualOrcamento | null>;
}

function mensagemFalha(cause: unknown, fallback: string) {
  return typeof cause === "string" && cause.trim() ? cause : fallback;
}

export function EnvioManualOrcamentoDialog({ envio, onFechar, onGerarNovaSenha }: EnvioManualOrcamentoDialogProps) {
  const [atual, setAtual] = useState<EnvioManualOrcamento | null>(envio);
  const [usou, setUsou] = useState(false);
  const [confirmarFechar, setConfirmarFechar] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setAtual(envio);
    setUsou(false);
    setConfirmarFechar(false);
    setErro(null);
  }, [envio]);

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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Enviar manualmente</DialogTitle>
            <DialogDescription>
              Copie o texto ou abra o WhatsApp ou o e-mail do destinatário.
            </DialogDescription>
          </DialogHeader>

          {atual && (
            <div className="grid gap-3">
              <Textarea value={atual.texto} readOnly rows={10} aria-label="Texto do orçamento" />

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={!linkWhatsapp}
                  onClick={() => void abrir(linkWhatsapp)}
                >
                  Abrir WhatsApp
                </Button>
                <Button
                  variant="outline"
                  disabled={!linkEmail}
                  onClick={() => void abrir(linkEmail)}
                >
                  Abrir e-mail
                </Button>
                <Button variant="outline" onClick={() => void copiar()}>
                  Copiar
                </Button>
              </div>

              {!atual.temSenha && podeGerar && (
                <Button variant="secondary" disabled={gerando} onClick={() => void gerarNovaSenha()}>
                  Gerar nova senha
                </Button>
              )}

              {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={tentarFechar}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmarFechar}
        onOpenChange={setConfirmarFechar}
        title="A senha não aparece de novo."
        description={
          podeGerar
            ? "Se fechar agora, o destinatário não terá como ver a senha. Gere uma nova senha ou feche mesmo assim."
            : "Se fechar agora, o destinatário não terá como ver a senha."
        }
        confirmLabel={podeGerar ? "Gerar nova senha" : "Fechar mesmo assim"}
        cancelLabel="Voltar"
        onConfirm={() => {
          setConfirmarFechar(false);
          if (podeGerar) {
            void gerarNovaSenha();
          } else {
            onFechar();
          }
        }}
      />
    </>
  );
}
