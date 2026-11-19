import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatarDocumento, formatarTelefone } from "@/lib/validations";

export interface DadosCartaoCliente {
  nome?: string | null;
  documento?: string | null;
  email?: string | null;
  telefone?: string | null;
  /** false = o cliente pediu para não receber; undefined = não se sabe (a linha Canais some). */
  recebeEmail?: boolean | null;
  recebeWhatsapp?: boolean | null;
  contato?: { nome: string; papel: string; email?: string | null; telefone?: string | null } | null;
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  return (partes.length === 1 ? partes[0].slice(0, 2) : partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/**
 * Cartão Cliente de Detalhes da OS e da venda (decisão 25): nome, documento, e-mail,
 * telefone, canais (riscado quando o cliente recusa) e contato. A OS passa o Portal do
 * Cliente em `rodape`. Dado que não existe não aparece (nada inventado).
 */
export function CartaoCliente({ dados, rodape, className }: { dados: DadosCartaoCliente; rodape?: ReactNode; className?: string }) {
  const { nome, documento, email, telefone, recebeEmail, recebeWhatsapp, contato } = dados;
  const sabeCanais = recebeEmail != null || recebeWhatsapp != null;
  const recusaEmail = recebeEmail === false;
  const recusaWhatsapp = recebeWhatsapp === false;
  const linhaContato = contato
    ? [contato.papel, contato.email, contato.telefone ? formatarTelefone(contato.telefone) : null].filter(Boolean).join(" · ")
    : "";
  return (
    <section aria-label="Cliente" className={cn("rounded-2xl border bg-card p-5", className)}>
      <h2 className="mb-3 text-base font-bold">Cliente</h2>
      {nome ? (
        <>
          <p className="font-semibold [overflow-wrap:anywhere]">{nome}</p>
          {documento && <p className="font-mono text-xs text-muted-foreground">{formatarDocumento(documento)}</p>}
          {(email || telefone || sabeCanais) && (
            <dl className="mt-3 grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 rounded-xl bg-muted px-4 py-3 text-sm">
              <dt className="text-muted-foreground">E-mail</dt>
              <dd className="font-semibold [overflow-wrap:anywhere]">{email || "—"}</dd>
              <dt className="text-muted-foreground">Telefone</dt>
              <dd className="font-semibold">{telefone ? formatarTelefone(telefone) : "—"}</dd>
              {sabeCanais && (
                <>
                  <dt className="text-muted-foreground">Canais</dt>
                  <dd className="font-semibold">
                    <span className={cn(recusaEmail && "text-muted-foreground line-through")}>Recebe e-mail</span>
                    {" e "}
                    <span className={cn(recusaWhatsapp && "text-muted-foreground line-through")}>WhatsApp</span>
                  </dd>
                </>
              )}
            </dl>
          )}
          {(recusaEmail || recusaWhatsapp) && (
            <p className="mt-3 rounded-xl bg-status-wait-bg px-4 py-2.5 text-sm text-status-wait">
              {recusaEmail && recusaWhatsapp
                ? "Este cliente pediu para não receber e-mail nem WhatsApp. O envio continua possível, mas confirme com ele antes."
                : recusaWhatsapp
                  ? "Este cliente pediu para não receber WhatsApp. O envio continua possível, mas prefira o e-mail."
                  : "Este cliente pediu para não receber e-mail. O envio continua possível, mas prefira o WhatsApp."}
            </p>
          )}
          {contato && (
            <div className="mt-3 flex items-center gap-3">
              <span aria-hidden="true" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold">
                {iniciais(contato.nome)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{contato.nome}</span>
                {linhaContato && <span className="block truncate text-xs text-muted-foreground">{linhaContato}</span>}
              </span>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Sem cliente vinculado.</p>
      )}
      {rodape && <div className="mt-4 border-t pt-3">{rodape}</div>}
    </section>
  );
}
