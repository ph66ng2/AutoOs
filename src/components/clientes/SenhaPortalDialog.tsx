import { useEffect, useState, type FormEvent } from "react";
import { Copy, KeyRound, MessageCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/lib/db";
import type { ClienteContato } from "@/types";

/** Sem 0/O, 1/l/I: a senha costuma ser ditada ou digitada a partir de um papel. */
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
const DIGITOS = "23456789";
export const PORTAL_URL = "https://status.bmitag.com.br";

/** Senha forte e legível, ex.: `Kp7m-Tx4q-9Wbd`. */
export function gerarSenhaPortal(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const blocos: string[] = [];
  for (let b = 0; b < 3; b += 1) {
    let bloco = "";
    for (let i = 0; i < 4; i += 1) {
      const byte = bytes[b * 4 + i];
      bloco += i === 2 ? DIGITOS[byte % DIGITOS.length] : ALFABETO[byte % ALFABETO.length];
    }
    blocos.push(bloco);
  }
  return blocos.join("-");
}

/** Mesma regra do banco (`autoos_portal_senha_valida`). */
export function senhaPortalValida(senha: string): boolean {
  return senha.length >= 8 && new TextEncoder().encode(senha).length <= 72 && /\p{L}/u.test(senha) && /\d/.test(senha);
}

/** Texto entregue ao contato. A senha é provisória: ele cria a dele no primeiro acesso. */
export function mensagemAcessoPortal(nome: string, documentoCliente: string, senha: string): string {
  return [
    `Olá, ${nome}! Seu acesso ao Portal das Impressoras BMI TAG:`,
    PORTAL_URL,
    `CPF/CNPJ: ${documentoCliente}`,
    `Senha provisória: ${senha}`,
    "No primeiro acesso você cria a sua própria senha.",
  ].join("\n");
}

/** Link do WhatsApp com a mensagem pronta. Nada passa pelo servidor nem fica no histórico do AutoOS. */
export function linkWhatsappAcesso(telefone: string, texto: string): string | null {
  const digitos = telefone.replace(/\D/g, "");
  if (digitos.length < 10) return null;
  const numero = digitos.startsWith("55") && digitos.length >= 12 ? digitos : `55${digitos}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

type FormProps = {
  contato: ClienteContato;
  documentoCliente: string;
  onCancelar: () => void;
  onSalvo: () => void;
  onConcluir: () => void;
};

/** Criação da senha + entrega dos dados. Usado na janela de contatos e no acesso pelo equipamento. */
export function SenhaPortalForm({ contato, documentoCliente, onCancelar, onSalvo, onConcluir }: FormProps) {
  const [senha, setSenha] = useState(() => gerarSenhaPortal());
  const [salva, setSalva] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    setSenha(gerarSenhaPortal());
    setSalva(null);
    setErro(null);
    setCopiado(false);
  }, [contato.id]);

  const salvar = async (event: FormEvent) => {
    event.preventDefault();
    if (!contato.id) return;
    if (!senhaPortalValida(senha)) {
      setErro("A senha precisa ter de 8 a 72 caracteres, com letras e números.");
      return;
    }
    setBusy(true);
    setErro(null);
    try {
      await db.definirSenhaPortalContato(contato.id, senha);
      setSalva(senha);
      onSalvo();
    } catch (cause) {
      setErro(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const remover = async () => {
    if (!contato.id) return;
    setBusy(true);
    setErro(null);
    try {
      await db.definirSenhaPortalContato(contato.id, null);
      onSalvo();
      onConcluir();
    } catch (cause) {
      setErro(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const instrucoes = salva ? mensagemAcessoPortal(contato.nome, documentoCliente, salva) : "";
  const whatsapp = salva && contato.telefone ? linkWhatsappAcesso(contato.telefone, instrucoes) : null;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(instrucoes);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };

  const enviarWhatsapp = async () => {
    if (!whatsapp) return;
    try {
      await db.abrirUrl(whatsapp);
    } catch (cause) {
      setErro(`Não foi possível abrir o WhatsApp: ${cause instanceof Error ? cause.message : String(cause)}. Use "Copiar".`);
    }
  };

  if (salva) {
    return (
      <div className="space-y-3">
        <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          Senha provisória salva. Entregue os dados ao contato: no primeiro acesso ele cria a própria senha.
          <strong> Ela não será mostrada de novo.</strong>
        </p>
        <pre className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 font-mono text-sm" aria-label="Dados de acesso">{instrucoes}</pre>
        {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          {whatsapp && (
            <Button type="button" variant="outline" onClick={() => void enviarWhatsapp()}>
              <MessageCircle className="mr-1 h-4 w-4" /> Enviar por WhatsApp
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => void copiar()}>
            <Copy className="mr-1 h-4 w-4" /> {copiado ? "Copiado" : "Copiar dados de acesso"}
          </Button>
          <Button type="button" onClick={onConcluir}>Concluir</Button>
        </div>
        {!contato.telefone && (
          <p className="text-xs text-muted-foreground">O contato não tem telefone cadastrado: copie os dados e envie por outro canal.</p>
        )}
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={(event) => void salvar(event)}>
      <div className="space-y-2">
        <Label htmlFor="senha-portal">Senha provisória</Label>
        <div className="flex gap-2">
          <Input id="senha-portal" value={senha} maxLength={72} autoComplete="off" spellCheck={false}
            onChange={(event) => setSenha(event.target.value)} className="font-mono" />
          <Button type="button" variant="outline" onClick={() => setSenha(gerarSenhaPortal())} title="Gerar outra senha">
            <RefreshCw className="h-4 w-4" /><span className="sr-only">Gerar outra senha</span>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Sugerimos uma senha forte; você pode digitar outra (mínimo 8 caracteres, com letras e números).
          No primeiro acesso o contato troca por uma senha só dele.
          {contato.portal_senha_definida_em ? " Salvar substitui a senha atual e desconecta o contato." : ""}
        </p>
      </div>
      {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {contato.portal_senha_definida_em ? (
          <Button type="button" variant="ghost" className="text-red-600" disabled={busy} onClick={() => void remover()}>
            Remover senha
          </Button>
        ) : <span />}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancelar}>Cancelar</Button>
          <Button type="submit" disabled={busy}>{busy ? "Salvando..." : "Salvar senha"}</Button>
        </div>
      </div>
    </form>
  );
}

type Props = {
  contato: ClienteContato | null;
  documentoCliente: string;
  onClose: () => void;
  onSalvo: () => void;
};

export function SenhaPortalDialog({ contato, documentoCliente, onClose, onSalvo }: Props) {
  return (
    <Dialog open={Boolean(contato)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4" /> Senha do Portal do Cliente</DialogTitle>
          <DialogDescription>
            {contato?.nome} entra em status.bmitag.com.br com o CPF/CNPJ <strong>{documentoCliente}</strong> e esta senha.
            Cada contato tem a própria senha: é ela que identifica quem respondeu ao orçamento.
          </DialogDescription>
        </DialogHeader>
        {contato && (
          <SenhaPortalForm contato={contato} documentoCliente={documentoCliente} onCancelar={onClose} onSalvo={onSalvo} onConcluir={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}
