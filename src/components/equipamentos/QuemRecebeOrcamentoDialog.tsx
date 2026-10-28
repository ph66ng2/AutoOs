import { useEffect, useRef, useState } from "react";
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
const SELECAO_NOVO = "novo";
const MENSAGEM_WHATSAPP = "Informe o celular com DDD e o 9 (11 dígitos).";

function telefoneValidoBackend(t?: string) { return (t ?? "").replace(/\D/g, "").length >= 10; }

function temAcessoPortal(contato: ClienteContato | null | undefined): boolean {
  return contato?.portal_acesso === "ACOMPANHAR" || contato?.portal_acesso === "DECIDIR";
}

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
  const [contatoExistente, setContatoExistente] = useState<ClienteContato | null>(null);
  const contatoExistenteRef = useRef<ClienteContato | null>(null);
  const [contatosSemWhatsapp, setContatosSemWhatsapp] = useState<ClienteContato[]>([]);
  const [selecaoId, setSelecaoId] = useState(SELECAO_NOVO);
  const [carregandoContatos, setCarregandoContatos] = useState(false);
  // Sem a lista não dá para saber se já existe contato a atualizar; salvar criaria um duplicado.
  const [falhaListagem, setFalhaListagem] = useState(false);

  const sugestaoNome = sugestao?.nome;
  const sugestaoTelefone = sugestao?.telefone;
  const sugestaoEmail = sugestao?.email;

  function guardarContatoExistente(contato: ClienteContato | null) {
    contatoExistenteRef.current = contato;
    setContatoExistente(contato);
  }

  function preencherFormulario(contato: ClienteContato | null) {
    if (contato) {
      setNome(contato.nome);
      setEmail(contato.email ?? "");
      setTelefone(contato.telefone ? formatarTelefone(contato.telefone) : "");
      return;
    }
    setNome(sugestaoNome ?? "");
    setTelefone(sugestaoTelefone ? formatarTelefone(sugestaoTelefone) : "");
    setEmail(sugestaoEmail ?? "");
  }

  function escolherContato(id: string) {
    setSelecaoId(id);
    setErro(null);
    if (id === SELECAO_NOVO) {
      guardarContatoExistente(null);
      preencherFormulario(null);
      return;
    }
    const alvo = contatosSemWhatsapp.find((contato) => String(contato.id) === id) ?? null;
    guardarContatoExistente(alvo);
    preencherFormulario(alvo);
  }

  useEffect(() => {
    if (!open) return;
    setNome(sugestaoNome ?? "");
    setTelefone(sugestaoTelefone ? formatarTelefone(sugestaoTelefone) : "");
    setEmail(sugestaoEmail ?? "");
    setErro(null);
    setContatoCriado(null);
    guardarContatoExistente(null);
    setContatosSemWhatsapp([]);
    setSelecaoId(SELECAO_NOVO);
  }, [open, sugestaoNome, sugestaoTelefone, sugestaoEmail]);

  useEffect(() => {
    if (!open || equipamento.cliente_id === undefined || equipamento.empresa_id === undefined) return;
    let vivo = true;
    setCarregandoContatos(true);
    setFalhaListagem(false);
    db.listarClienteContatos(equipamento.cliente_id, equipamento.empresa_id)
      .then((lista) => {
        if (!vivo) return;
        const candidatos = lista.filter((c) => c.ativo && !telefoneValidoBackend(c.telefone));
        setContatosSemWhatsapp(candidatos);
        const preferido = candidatos.find((c) => !temAcessoPortal(c)) ?? candidatos[0];
        if (preferido?.id !== undefined) {
          setSelecaoId(String(preferido.id));
          guardarContatoExistente(preferido);
          setNome(preferido.nome);
          setEmail(preferido.email ?? "");
          setTelefone(preferido.telefone ? formatarTelefone(preferido.telefone) : "");
        } else {
          setSelecaoId(SELECAO_NOVO);
          guardarContatoExistente(null);
        }
      })
      .catch(() => {
        if (vivo) setFalhaListagem(true);
      })
      .finally(() => {
        if (vivo) setCarregandoContatos(false);
      });
    return () => {
      vivo = false;
    };
  }, [open, equipamento.cliente_id, equipamento.empresa_id]);

  function fechar() {
    if (!salvando) onCancelar();
  }

  async function salvar() {
    const existente = contatoExistenteRef.current;
    const preservarIdentidade = temAcessoPortal(existente);
    const nomeLimpo = preservarIdentidade ? existente!.nome.trim() : nome.trim();
    const emailLimpo = preservarIdentidade ? (existente?.email ?? "").trim() : email.trim();
    if (nomeLimpo.length < 2) {
      setErro("Informe o nome de quem recebe o orçamento.");
      return;
    }
    if (!celularValido(telefone)) {
      setErro(MENSAGEM_WHATSAPP);
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
        if (existente?.id !== undefined) {
          contato = await db.atualizarClienteContato(existente.id, {
            empresa_id: equipamento.empresa_id,
            cliente_id: equipamento.cliente_id,
            nome: nomeLimpo,
            email: emailLimpo || undefined,
            telefone: digitosTelefoneBr(telefone),
            atualizado_em: existente.atualizado_em,
            ...(preservarIdentidade ? { preservar_identidade_portal: true } : {}),
          });
        } else {
          contato = await db.criarClienteContato({
            empresa_id: equipamento.empresa_id,
            cliente_id: equipamento.cliente_id,
            nome: nomeLimpo,
            email: emailLimpo || undefined,
            telefone: digitosTelefoneBr(telefone),
          });
        }
        setContatoCriado(contato);
      } catch (cause) {
        if (existente?.id !== undefined) {
          // O token de concorrência pode ter vencido: relê o contato para a nova tentativa não repetir o mesmo erro.
          let aviso = "";
          try {
            const lista = await db.listarClienteContatos(equipamento.cliente_id, equipamento.empresa_id);
            const atual = lista.find((c) => c.id === existente.id) ?? null;
            guardarContatoExistente(atual);
            if (!atual) aviso = " O contato não está mais disponível; salvar de novo cadastra um novo contato.";
          } catch {
            // Mantém o contato carregado antes; a mensagem abaixo já informa a falha.
          }
          setErro(`Não foi possível atualizar o contato. ${String(cause)}${aviso}`);
        } else {
          setErro(`Não foi possível cadastrar o contato. ${String(cause)}`);
        }
        setSalvando(false);
        return;
      }
    }

    let equipamentoAtualizado: Equipamento;
    try {
      if (contato.id === undefined) throw new Error("Contato sem identificador.");
      equipamentoAtualizado = await db.definirResponsavelEquipamento(equipamento.id, contato.id, equipamento.atualizado_em);
    } catch (cause) {
      setErro(`O contato foi ${contatoExistenteRef.current ? "atualizado" : "cadastrado"} no cliente, mas não foi vinculado ao equipamento. Tente novamente. ${String(cause)}`);
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

  const bloqueado = salvando || carregandoContatos || contatoCriado !== null;
  const identidadeTravada = temAcessoPortal(contatoExistente);

  return (
    <Dialog open={open} onOpenChange={(aberto) => { if (!aberto) fechar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quem recebe o orçamento?</DialogTitle>
          <DialogDescription>
            O orçamento e o acesso ao portal vão para este contato. Ele fica salvo no cadastro do cliente.
            {contatoExistente && ` Encontramos ${contatoExistente.nome} sem WhatsApp válido; o cadastro dele será atualizado.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {contatosSemWhatsapp.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="quem-recebe-contato">Qual contato atualizar?</Label>
              <select
                id="quem-recebe-contato"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={selecaoId}
                disabled={bloqueado}
                onChange={(event) => escolherContato(event.target.value)}
              >
                {contatosSemWhatsapp.map((contato) => (
                  <option key={contato.id} value={String(contato.id)}>
                    {contato.nome}{temAcessoPortal(contato) ? " (tem acesso ao portal)" : ""}
                  </option>
                ))}
                <option value={SELECAO_NOVO}>Cadastrar contato novo</option>
              </select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="quem-recebe-nome">Nome *</Label>
            <Input id="quem-recebe-nome" value={nome} disabled={bloqueado || identidadeTravada} onChange={(event) => { setNome(event.target.value); setErro(null); }} />
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
            <Input id="quem-recebe-email" type="email" value={email} disabled={bloqueado || identidadeTravada} onChange={(event) => { setEmail(event.target.value); setErro(null); }} />
          </div>
          {identidadeTravada && (
            <p className="text-xs text-muted-foreground">
              Este contato tem acesso ao portal: nome e e-mail não serão alterados. Só o WhatsApp é atualizado.
            </p>
          )}
          {falhaListagem && (
            <p className="text-xs text-red-600" role="alert">
              Não foi possível carregar os contatos do cliente. Feche e abra de novo para tentar outra vez.
            </p>
          )}
          {erro && <p className="text-xs text-red-600" role="alert">{erro}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={fechar} disabled={salvando}>Cancelar</Button>
          <Button type="button" onClick={() => void salvar()} disabled={salvando || carregandoContatos || falhaListagem}>{salvando ? "Salvando..." : "Salvar e continuar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
