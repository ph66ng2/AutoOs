import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/lib/db";
import type { ContatoPortalEmpresa } from "@/types";

const VAZIO: ContatoPortalEmpresa = { nomeExibicao: "BMI TAG", whatsapp: "", email: "", telefone: "", horario: "", endereco: "", mapsUrl: "" };

export const ENDERECO_MAX = 300;
export const MAPS_URL_MAX = 500;

/** Mesmas regras do banco e do backend (`chk_portal_contato_endereco`/`chk_portal_contato_maps_url`). */
export function validarEnderecoMapa(endereco?: string | null, mapsUrl?: string | null): string | null {
  if ((endereco ?? "").trim().length > ENDERECO_MAX) {
    return `O endereço para retirada deve ter no máximo ${ENDERECO_MAX} caracteres.`;
  }
  const url = (mapsUrl ?? "").trim();
  if (url) {
    if (!/^https:\/\/\S+$/i.test(url)) return "O link do mapa deve começar com https:// e não pode ter espaços.";
    if (url.length > MAPS_URL_MAX) return `O link do mapa deve ter no máximo ${MAPS_URL_MAX} caracteres.`;
  }
  return null;
}

/** Link informado ou, na falta dele, busca no Google Maps pelo endereço. */
export function urlDoMapa(endereco?: string | null, mapsUrl?: string | null): string | null {
  const url = (mapsUrl ?? "").trim();
  if (url && !validarEnderecoMapa(null, url)) return url;
  const texto = (endereco ?? "").trim();
  return texto ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(texto)}` : null;
}

/**
 * Cartão "Fale com a equipe" do Portal das Impressoras do Cliente. Só canais públicos, mostrados
 * ao cliente logado.
 */
export function PortalContatoEmpresaCard() {
  const [form, setForm] = useState<ContatoPortalEmpresa>(VAZIO);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    db.obterContatoPortalEmpresa()
      .then((atual) => { if (atual) setForm({ ...VAZIO, ...atual }); })
      .catch(() => setStatus("Não foi possível carregar o contato do portal (confira se o banco tem a migration 0035)."));
  }, []);

  const campo = (key: keyof ContatoPortalEmpresa) => ({
    value: form[key] ?? "",
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => setForm((atual) => ({ ...atual, [key]: event.target.value })),
  });

  const mapaPrevia = urlDoMapa(form.endereco, form.mapsUrl);
  const abrirMapa = async () => {
    if (!mapaPrevia) return;
    try {
      await db.abrirUrl(mapaPrevia);
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const salvar = async (event: FormEvent) => {
    event.preventDefault();
    const erro = validarEnderecoMapa(form.endereco, form.mapsUrl);
    if (erro) {
      setStatus(erro);
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      setForm({ ...VAZIO, ...(await db.salvarContatoPortalEmpresa(form)) });
      setStatus("Contato do portal salvo.");
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Portal das Impressoras do Cliente</CardTitle>
        <CardDescription>
          Canais exibidos no cartão “Fale com a equipe” e usados na mensagem pronta de WhatsApp após o cliente responder.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => void salvar(event)}>
          <div className="space-y-2">
            <Label htmlFor="portal-nome">Nome exibido</Label>
            <Input id="portal-nome" maxLength={80} {...campo("nomeExibicao")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="portal-whatsapp">WhatsApp da equipe (com DDD)</Label>
            <Input id="portal-whatsapp" inputMode="tel" placeholder="71 99999-0000" {...campo("whatsapp")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="portal-email">Email</Label>
            <Input id="portal-email" type="email" maxLength={120} {...campo("email")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="portal-telefone">Telefone</Label>
            <Input id="portal-telefone" maxLength={40} {...campo("telefone")} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="portal-horario">Horário de atendimento</Label>
            <Input id="portal-horario" maxLength={120} placeholder="Seg a sex, 8h às 18h" {...campo("horario")} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="portal-endereco">Endereço para retirada</Label>
            <Input id="portal-endereco" maxLength={ENDERECO_MAX} placeholder="Rua, número, bairro, cidade" {...campo("endereco")} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="portal-maps">Link do Google Maps (opcional)</Label>
            <Input id="portal-maps" maxLength={MAPS_URL_MAX} placeholder="https://maps.app.goo.gl/..." {...campo("mapsUrl")} />
            <p className="text-xs text-muted-foreground">
              O endereço e o mapa aparecem no portal quando o equipamento estiver pronto para retirada.
              {mapaPrevia && (
                <>
                  {" "}
                  <button type="button" className="font-medium text-primary underline" onClick={() => void abrirMapa()}>
                    Ver no mapa
                  </button>
                </>
              )}
            </p>
          </div>
          {status && <p className="text-sm text-muted-foreground sm:col-span-2">{status}</p>}
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar contato do portal"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
