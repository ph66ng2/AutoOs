import { useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { db } from "@/lib/db";
import { celularValido, digitosTelefoneBr, formatarTelefone } from "@/lib/validations";
import type { ClienteContato, Equipamento } from "@/types";

interface SugestaoContato {
  nome: string;
  telefone: string;
  email: string;
}

interface QuemRecebeOrcamentoDialogProps {
  open: boolean;
  equipamento: Equipamento;
  sugestao?: SugestaoContato;
  onSalvo: (eq: Equipamento) => void | Promise<void>;
  onCancelar: () => void;
}

const emailSchema = z.string().email();

export function QuemRecebeOrcamentoDialog({
  open,
  equipamento,
  sugestao,
  onSalvo,
  onCancelar,
}: QuemRecebeOrcamentoDialogProps) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  // Guarda o contato já criado para que uma nova tentativa só refaça o vínculo, sem duplicar o cadastro.
  const [contatoCriado, setContatoCriado] = useState<ClienteContato | null>(null);

  const sugestaoNome = sugestao?.nome;
  const sugestaoTelefone = sugestao?.telefone;
  const sugestaoEmail = sugestao?.email;

  useEffect(() => {
    if (!open) return;
    setNome(sugestaoNome ?? "");
    setTelefone(sugestaoTelefone ? formatarTelefone(sugestaoTelefone) : "");
    setEmail(sugestaoEmail ?? "");
    setErro(null);
    setContatoCriado(null);
  }, [open, sugestaoNome, sugestaoTelefone, sugestaoEmail]);

  function fechar() {
    if (!salvando) onCancelar();
  }

  async function salvar() {
    const nomeLimpo = nome.trim();
    const emailLimpo = email.trim();
    if (nomeLimpo.length < 2) {
      setErro("Informe o nome de quem recebe o orçamento.");
      return;
    }
    if (!celularValido(telefone)) {
      setErro("Informe o WhatsApp com DDD (10 ou 11 dígitos).");
      return;
    }
    if (emailLimpo && !emailSchema.safeParse(emailLimpo).success) {
      setErro("E-mail inválido.");
      return;
    }
    if (equipamento.id === undefined || equipamento.cliente_id === undefined || equipamento.empresa_id === undefined || !equipamento.atualizado_em) {
      setErro("Este equipamento não tem cliente ou versão carregada. Atualize a tela e tente de novo.");
      return;
    }

    setSalvando(true);
    setErro(null);
    let contato = contatoCriado;
    if (!contato) {
      try {
        contato = await db.criarClienteContato({
          empresa_id: equipamento.empresa_id,
          cliente_id: equipamento.cliente_id,
          nome: nomeLimpo,
          email: emailLimpo || undefined,
          telefone: digitosTelefoneBr(telefone),
        });
        setContatoCriado(contato);
      } catch (cause) {
        setErro(`Não foi possível cadastrar o contato. ${String(cause)}`);
        setSalvando(false);
        return;
      }
    }

    let equipamentoAtualizado: Equipamento;
    try {
      if (contato.id === undefined) throw new Error("Contato sem identificador.");
      equipamentoAtualizado = await db.definirResponsavelEquipamento(equipamento.id, contato.id, equipamento.atualizado_em);
    } catch (cause) {
      setErro(`O contato foi cadastrado no cliente, mas não foi vinculado ao equipamento. Tente novamente. ${String(cause)}`);
      setSalvando(false);
      return;
    }

    try {
      await onSalvo(equipamentoAtualizado);
    } catch (cause) {
      setErro(`O contato foi vinculado, mas a tela não foi atualizada. ${String(cause)}`);
    } finally {
      setSalvando(false);
    }
  }

  const bloqueado = salvando || contatoCriado !== null;

  return (
    <Dialog open={open} onOpenChange={(aberto) => { if (!aberto) fechar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quem recebe o orçamento?</DialogTitle>
          <DialogDescription>
            O orçamento e o acesso ao portal vão para este contato. Ele fica salvo no cadastro do cliente.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="quem-recebe-nome">Nome *</Label>
            <Input id="quem-recebe-nome" value={nome} disabled={bloqueado} onChange={(event) => { setNome(event.target.value); setErro(null); }} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quem-recebe-telefone">WhatsApp *</Label>
            <Input
              id="quem-recebe-telefone"
              inputMode="tel"
              value={telefone}
              disabled={bloqueado}
              placeholder="(00) 00000-0000"
              onChange={(event) => { setTelefone(formatarTelefone(event.target.value)); setErro(null); }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quem-recebe-email">E-mail</Label>
            <Input id="quem-recebe-email" type="email" value={email} disabled={bloqueado} onChange={(event) => { setEmail(event.target.value); setErro(null); }} />
          </div>
          {erro && <p className="text-xs text-red-600" role="alert">{erro}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={fechar} disabled={salvando}>Cancelar</Button>
          <Button type="button" onClick={() => void salvar()} disabled={salvando}>{salvando ? "Salvando..." : "Salvar e continuar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
