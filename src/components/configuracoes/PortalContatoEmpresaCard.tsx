import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/lib/db";
import type { ContatoPortalEmpresa } from "@/types";

const VAZIO: ContatoPortalEmpresa = { nomeExibicao: "BMI TAG", whatsapp: "", email: "", telefone: "", horario: "" };

/**
 * Cartão "Fale com a equipe" do Portal das Impressoras do Cliente. Só canais públicos: o token
 * do WhatsApp que envia o código de acesso fica nos segredos do servidor, nunca aqui.
 */
export function PortalContatoEmpresaCard() {
  const [form, setForm] = useState<ContatoPortalEmpresa>(VAZIO);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    db.obterContatoPortalEmpresa()
      .then((atual) => { if (atual) setForm({ ...VAZIO, ...atual }); })
      .catch(() => setStatus("Não foi possível carregar o contato do portal (confira se o banco tem a migration 0034)."));
  }, []);

  const campo = (key: keyof ContatoPortalEmpresa) => ({
    value: form[key] ?? "",
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => setForm((atual) => ({ ...atual, [key]: event.target.value })),
  });

  const salvar = async (event: FormEvent) => {
    event.preventDefault();
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
          {status && <p className="text-sm text-muted-foreground sm:col-span-2">{status}</p>}
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar contato do portal"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
