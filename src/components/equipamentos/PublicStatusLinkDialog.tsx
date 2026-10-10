import { useEffect, useMemo, useState } from "react";
import { Ban, Copy, Link2, Loader2, Mail, MessageCircle, QrCode, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { db } from "@/lib/db";
import { EmailService } from "@/lib/email-service";
import { resolveRecipient } from "@/lib/recipient-resolver";
import { WhatsAppService } from "@/lib/whatsapp-service";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { SENSITIVE_PERMISSIONS, type Equipamento, type PublicStatusLinkInfo } from "@/types";

type Props = {
  equipamento: Equipamento | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type PendingAction = "rotacionar" | "revogar" | null;

function formatDate(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

const STATUS_LABEL: Record<PublicStatusLinkInfo["status"], string> = {
  ativo: "Link ativo",
  expirado: "Link expirado",
  revogado: "Link revogado",
};

export function PublicStatusLinkDialog({ equipamento, open, onOpenChange }: Props) {
  const { ensureSensitiveAccess } = useSensitiveAccess();
  const [linkInfo, setLinkInfo] = useState<PublicStatusLinkInfo | null>(null);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const recipientEmail = useMemo(
    () => equipamento ? resolveRecipient(equipamento, "email") : null,
    [equipamento],
  );
  const recipientPhone = useMemo(
    () => equipamento ? resolveRecipient(equipamento, "telefone") : null,
    [equipamento],
  );

  useEffect(() => {
    if (!open || !equipamento?.id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setLinkInfo(null);
    setLinkUrl(null);
    setQrSvg(null);
    setShowQr(false);
    setPendingAction(null);
    db.obterLinkStatusPublico(equipamento.id)
      .then((info) => { if (!cancelled) setLinkInfo(info); })
      .catch((cause) => {
        if (!cancelled) setError(typeof cause === "string" ? cause : "Não foi possível consultar o link.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, equipamento?.id]);

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen) {
      setLinkUrl(null);
      setQrSvg(null);
      setShowQr(false);
      setPendingAction(null);
    }
    onOpenChange(nextOpen);
  }

  async function createLink() {
    if (!equipamento?.id) return;
    const allowed = await ensureSensitiveAccess({
      title: "Gerenciar link de acompanhamento",
      description: "Confirme o acesso para criar ou substituir o link individual deste atendimento.",
      permission: SENSITIVE_PERMISSIONS.MANAGE_STATUS_LINKS,
    });
    if (!allowed) return;
    setBusy(true);
    setError(null);
    try {
      const result = await db.criarLinkStatusPublico(equipamento.id);
      setLinkUrl(result.url);
      setLinkInfo({ status: "ativo", createdAt: new Date().toISOString(), expiresAt: result.expiresAt, lastAccessAt: null });
      setPendingAction(null);
      toast.success("Link de acompanhamento criado. O anterior, se havia, foi revogado.");
      try {
        setQrSvg(await db.gerarQrLinkStatusPublico(result.url));
        setShowQr(true);
      } catch {
        setError("O link foi criado, mas o QR code não pôde ser gerado.");
      }
    } catch (cause) {
      setError(typeof cause === "string" ? cause : "Não foi possível criar o link.");
    } finally {
      setBusy(false);
    }
  }

  async function revokeLink() {
    if (!equipamento?.id) return;
    const allowed = await ensureSensitiveAccess({
      title: "Revogar link de acompanhamento",
      description: "Confirme o acesso para invalidar o link que foi enviado ao cliente.",
      permission: SENSITIVE_PERMISSIONS.MANAGE_STATUS_LINKS,
    });
    if (!allowed) return;
    setBusy(true);
    setError(null);
    try {
      const revoked = await db.revogarLinkStatusPublico(equipamento.id);
      setLinkUrl(null);
      setQrSvg(null);
      setPendingAction(null);
      setLinkInfo((current) => current ? { ...current, status: revoked ? "revogado" : current.status } : current);
      toast.success(revoked ? "Link revogado." : "Não havia um link ativo.");
    } catch (cause) {
      setError(typeof cause === "string" ? cause : "Não foi possível revogar o link.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!linkUrl) return;
    try {
      await navigator.clipboard.writeText(linkUrl);
      toast.success("Link copiado.");
    } catch {
      setError("Não foi possível copiar o link. Selecione o endereço e copie manualmente.");
    }
  }

  async function sendEmail() {
    if (!equipamento || !linkUrl) return;
    const allowed = await ensureSensitiveAccess({
      title: "Enviar acompanhamento por email",
      description: "Confirme o acesso para enviar o link de consulta ao contato cadastrado.",
      permission: SENSITIVE_PERMISSIONS.CONFIG_SMTP,
    });
    if (!allowed) return;
    setBusy(true);
    setError(null);
    try {
      const result = await EmailService.enviarLinkStatusPublico(equipamento, linkUrl);
      if (result.sucesso) toast.success("Link enviado por email.");
      else setError(result.erro || "Falha ao enviar o email.");
    } catch (cause) {
      setError(typeof cause === "string" ? cause : "Falha ao enviar o email.");
    } finally {
      setBusy(false);
    }
  }

  async function sendWhatsApp() {
    if (!equipamento || !linkUrl) return;
    const allowed = await ensureSensitiveAccess({
      title: "Enviar acompanhamento por WhatsApp",
      description: "Confirme o acesso para enviar o link de consulta ao contato cadastrado.",
      permission: SENSITIVE_PERMISSIONS.CONFIG_WHATSAPP,
    });
    if (!allowed) return;
    setBusy(true);
    setError(null);
    try {
      const result = await WhatsAppService.enviarLinkStatusPublico(equipamento, linkUrl);
      if (result.sucesso) toast.success("Link enviado por WhatsApp.");
      else setError(result.erro || "Falha ao enviar o WhatsApp.");
    } catch (cause) {
      setError(typeof cause === "string" ? cause : "Falha ao enviar o WhatsApp.");
    } finally {
      setBusy(false);
    }
  }

  const hasActiveLink = linkInfo?.status === "ativo";
  const needsRotationConfirmation = pendingAction === "rotacionar";
  const needsRevocationConfirmation = pendingAction === "revogar";

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Link2 className="h-5 w-5" /> Acompanhamento público</DialogTitle>
          <DialogDescription>
            O cliente poderá consultar a etapa atual por um link individual. O portal não altera status nem aprova orçamento.
          </DialogDescription>
        </DialogHeader>

        {equipamento && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="font-semibold">{equipamento.marca} {equipamento.modelo}</p>
              <p className="text-muted-foreground">Ciclo de atendimento #{equipamento.id}</p>
            </div>

            {loading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Consultando link…</p>
            ) : linkInfo ? (
              <div className="rounded-lg border p-3 text-sm">
                <p className="font-semibold">{STATUS_LABEL[linkInfo.status]}</p>
                <p className="mt-1 text-muted-foreground">Criado em {formatDate(linkInfo.createdAt)}{linkInfo.expiresAt && ` · válido até ${formatDate(linkInfo.expiresAt)}`}</p>
                {linkInfo.lastAccessAt && <p className="mt-1 text-muted-foreground">Último acesso em {formatDate(linkInfo.lastAccessAt)}</p>}
                {hasActiveLink && !linkUrl && (
                  <p className="mt-2 text-amber-800">
                    O token não pode ser recuperado porque o banco guarda apenas o hash. Gere outro link para copiar ou reenviar; isso revoga o atual.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Ainda não há link de acompanhamento para este ciclo.</p>
            )}

            {!linkUrl && !needsRotationConfirmation && !needsRevocationConfirmation && (
              <Button className="w-full" disabled={busy || loading} onClick={() => hasActiveLink ? setPendingAction("rotacionar") : void createLink()}>
                <Link2 className="mr-2 h-4 w-4" />
                {hasActiveLink ? "Gerar novo link e revogar o atual" : "Criar link de acompanhamento"}
              </Button>
            )}

            {needsRotationConfirmation && (
              <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                <p>O link atual deixará de funcionar assim que o novo for criado. Gere outro somente se precisar reenviar ou substituir o link.</p>
                <div className="flex gap-2">
                  <Button disabled={busy} onClick={() => void createLink()}><RefreshCw className="mr-2 h-4 w-4" /> Confirmar e gerar</Button>
                  <Button variant="outline" disabled={busy} onClick={() => setPendingAction(null)}>Cancelar</Button>
                </div>
              </div>
            )}

            {linkUrl && (
              <div className="space-y-3 rounded-lg border p-3">
                <label className="text-sm font-medium" htmlFor="public-status-url">Link de acompanhamento</label>
                <input id="public-status-url" className="w-full rounded-md border bg-background px-3 py-2 text-sm" readOnly value={linkUrl} />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => void copyLink()}><Copy className="mr-2 h-4 w-4" /> Copiar link</Button>
                  <Button size="sm" variant="outline" disabled={!qrSvg} onClick={() => setShowQr((value) => !value)}><QrCode className="mr-2 h-4 w-4" /> {showQr ? "Ocultar QR" : "Mostrar QR"}</Button>
                </div>
                {showQr && qrSvg && (
                  <div className="flex justify-center rounded-md bg-white p-3">
                    <img
                      className="h-56 w-56"
                      alt="QR code do link de acompanhamento"
                      src={`data:image/svg+xml;base64,${btoa(qrSvg)}`}
                    />
                  </div>
                )}

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button variant="outline" disabled={busy || !recipientEmail?.endereco} onClick={() => void sendEmail()}>
                    <Mail className="mr-2 h-4 w-4" /> Enviar por email
                  </Button>
                  <Button variant="outline" disabled={busy || !recipientPhone?.endereco} onClick={() => void sendWhatsApp()}>
                    <MessageCircle className="mr-2 h-4 w-4" /> Enviar por WhatsApp
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {recipientEmail?.endereco ? `Email: ${recipientEmail.endereco}` : "Sem email cadastrado."} {recipientPhone?.endereco ? `· WhatsApp: ${recipientPhone.endereco}` : "· Sem telefone cadastrado."}
                </p>
                <p className="text-xs text-muted-foreground">Os históricos registram o canal e o resultado, sem guardar o token do link.</p>
              </div>
            )}

            {hasActiveLink && !needsRotationConfirmation && !needsRevocationConfirmation && (
              <Button className="w-full" variant="ghost" disabled={busy} onClick={() => setPendingAction("revogar")}>
                <Ban className="mr-2 h-4 w-4" /> Revogar link atual
              </Button>
            )}

            {needsRevocationConfirmation && (
              <div className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <p>O link deixará de funcionar para qualquer pessoa que o recebeu.</p>
                <div className="flex gap-2">
                  <Button variant="destructive" disabled={busy} onClick={() => void revokeLink()}><Ban className="mr-2 h-4 w-4" /> Confirmar revogação</Button>
                  <Button variant="outline" disabled={busy} onClick={() => setPendingAction(null)}>Cancelar</Button>
                </div>
              </div>
            )}

            {linkInfo?.status === "ativo" && (
              <p className="text-xs text-muted-foreground">
                O link vale por até 180 dias e encerra 30 dias após a entrega. A data da mudança de etapa pode não existir para atendimentos antigos.
              </p>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
