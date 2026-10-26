/**
 * Envio do orçamento ao cliente (WhatsApp + e-mail) com acesso ao portal.
 * Prepara o acesso uma única vez e usa a mesma senha nos dois canais.
 * Se algo falhar, devolve um `EnvioManualOrcamento` para o técnico enviar à mão.
 * A senha nunca vai para `avisos` nem para console.
 */

import { db } from "@/lib/db";
import { WhatsAppService } from "@/lib/whatsapp-service";
import {
  enviarEmailOrcamentoPortal,
  gerarCorpoOrcamentoPortalTexto,
} from "@/lib/email-orcamento-portal";
import type {
  EnvioManualOrcamento,
  Equipamento,
  EstadoEnvioWhatsapp,
  PreparoAcessoPortal,
  Verificacao,
} from "@/types";

export interface OpcoesEnvioOrcamento {
  reenvioManual?: boolean;
  confirmarIncerto?: boolean;
  /** Padrão true. */
  enviarEmail?: boolean;
  /**
   * Acesso já preparado numa tentativa anterior. A senha só aparece na chamada que a cria: ao repetir o envio
   * (ex.: confirmação de resultado incerto) o chamador devolve o preparo para a senha não se perder.
   */
  preparo?: PreparoAcessoPortal | null;
}

export interface EstadoCanalWhatsapp {
  enviado: boolean;
  estado?: EstadoEnvioWhatsapp;
  erro?: string;
}

export interface EstadoCanalEmail {
  enviado: boolean;
  erro?: string;
}

export interface ResultadoEnvioOrcamento {
  /** Preparo usado neste envio; reenviá-lo em `opcoes.preparo` mantém a senha criada. */
  preparo: PreparoAcessoPortal | null;
  canais: { whatsapp: EstadoCanalWhatsapp; email: EstadoCanalEmail };
  envioManual?: EnvioManualOrcamento;
  avisos: string[];
}

export interface ResultadoProrrogarEEnviar {
  prorrogado: boolean;
  publicado: boolean;
  whatsapp?: EstadoCanalWhatsapp;
  email?: EstadoCanalEmail;
  envioManual?: EnvioManualOrcamento;
  avisos: string[];
  respostaPendenteRecusada?: boolean;
}

function msgErro(error: unknown, padrao: string): string {
  if (typeof error === "string" && error) return error;
  if (error && typeof error === "object" && "message" in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === "string" && m) return m;
  }
  return padrao;
}

/** Calcula data futura pulando fins de semana → AAAA-MM-DD. */
export function calcularPrazoAprovacao(diasUteis: number): string {
  const data = new Date();
  let adicionados = 0;
  while (adicionados < diasUteis) {
    data.setDate(data.getDate() + 1);
    const dia = data.getDay();
    if (dia !== 0 && dia !== 6) adicionados++;
  }
  return data.toISOString().split("T")[0];
}

/** Sugestão de novo prazo: 3 dias úteis, AAAA-MM-DD. */
export function sugerirNovoPrazo(): string {
  return calcularPrazoAprovacao(3);
}

function montarEnvioManual(
  equip: Equipamento,
  verificacao: Verificacao,
  preparo: PreparoAcessoPortal,
): EnvioManualOrcamento {
  return {
    destinatario: preparo.destinatario,
    assunto: `Orçamento - ${equip.marca} ${equip.modelo} (SN: ${equip.serial_number})`,
    texto: gerarCorpoOrcamentoPortalTexto(equip, verificacao, preparo, { mascarar: false }),
    temSenha: !!preparo.credenciais,
    podeGerarNovaSenha:
      !preparo.destinatario.usouSenhaAtual && !!preparo.destinatario.contatoId,
    equipamentoId: equip.id!,
  };
}

export async function enviarOrcamentoAoCliente(
  equip: Equipamento,
  verificacao: Verificacao,
  opcoes: OpcoesEnvioOrcamento = {},
): Promise<ResultadoEnvioOrcamento> {
  const avisos: string[] = [];
  const equipId = equip.id!;

  // (a) preparo do acesso ao portal
  let preparo: PreparoAcessoPortal | null = null;
  if (opcoes.preparo !== undefined) {
    preparo = opcoes.preparo;
  } else {
    try {
      preparo = (await db.prepararAcessoPortal(equipId)) ?? null;
    } catch (error) {
      avisos.push(`Não foi possível preparar o acesso ao portal: ${msgErro(error, "erro desconhecido")}`);
    }
  }

  // (b) WhatsApp
  let whatsapp: EstadoCanalWhatsapp = { enviado: false, erro: "Sem resposta do envio de WhatsApp." };
  let senhaRetida = false;
  try {
    const r = await WhatsAppService.solicitarEnvio(equipId, "orcamento_informativo", {
      reenvioManual: opcoes.reenvioManual,
      confirmarIncerto: opcoes.confirmarIncerto,
      senhaPortal: preparo?.credenciais?.senha,
    });
    if (r) {
      const enviado = r.sucesso !== false && r.estado !== "INCERTA" && r.estado !== "FALHOU";
      whatsapp = { enviado, estado: r.estado, ...(enviado ? {} : { erro: r.mensagem ?? r.erro ?? undefined }) };
      senhaRetida = !!r.senhaRetida;
    }
  } catch (error) {
    whatsapp = { enviado: false, erro: msgErro(error, "Falha ao enviar WhatsApp") };
  }

  // (c) e-mail
  let email: EstadoCanalEmail = { enviado: false };
  if (opcoes.enviarEmail === false) {
    email = { enviado: false, erro: "Envio de e-mail não solicitado." };
  } else if (!preparo) {
    email = { enviado: false, erro: "Sem acesso preparado para montar o e-mail." };
  } else if (!preparo.destinatario?.email?.trim()) {
    email = { enviado: false, erro: "Contato sem e-mail." };
  } else {
    try {
      const r = await enviarEmailOrcamentoPortal(equip, verificacao, preparo);
      email = r?.cliente
        ? { enviado: !!r.cliente.enviado, ...(r.cliente.erro ? { erro: r.cliente.erro } : {}) }
        : { enviado: false, erro: "Sem resposta do envio de e-mail." };
    } catch (error) {
      email = { enviado: false, erro: msgErro(error, "Falha ao enviar e-mail") };
    }
  }

  // (d) envio manual
  // Sem WhatsApp automático (ainda não há canal definido) o envio manual por copia e cola é o caminho:
  // o diálogo abre sempre que o WhatsApp não enviou, mesmo com o e-mail entregue.
  const precisaManual = !whatsapp.enviado || senhaRetida;
  let envioManual: EnvioManualOrcamento | undefined;
  if (precisaManual) {
    try {
      let base = preparo;
      if (!base) {
        const destinatario = await db.obterDestinatarioOrcamento(equipId);
        if (destinatario) {
          base = {
            destinatario,
            portalAtivo: false,
            credenciais: null,
            senhaExistente: false,
            acessoConcedido: false,
          };
        }
      }
      if (base) envioManual = montarEnvioManual(equip, verificacao, base);
      else avisos.push("Não foi possível montar a mensagem para envio manual.");
    } catch (error) {
      avisos.push(`Não foi possível montar a mensagem para envio manual: ${msgErro(error, "erro desconhecido")}`);
    }
  }

  return { preparo, canais: { whatsapp, email }, ...(envioManual ? { envioManual } : {}), avisos };
}

export async function gerarNovaSenhaEnvioManual(
  equip: Equipamento,
  verificacao: Verificacao,
): Promise<EnvioManualOrcamento | null> {
  let preparo: PreparoAcessoPortal | null | undefined;
  try {
    preparo = await db.prepararAcessoPortal(equip.id!, true);
  } catch (error) {
    throw new Error(`Não foi possível gerar uma nova senha: ${msgErro(error, "erro desconhecido")}`);
  }
  if (!preparo) return null;
  return montarEnvioManual(equip, verificacao, preparo);
}

export async function prorrogarEEnviar(
  equip: Equipamento,
  novoPrazo: string,
  confirmarRespostaPendente: () => Promise<boolean>,
  /** `preparo` de um envio que falhou antes (ex.: prazo vencido): a senha criada nele não pode se perder. */
  opcoes: { preparo?: PreparoAcessoPortal | null } = {},
): Promise<ResultadoProrrogarEEnviar> {
  const avisos: string[] = [];
  const equipId = equip.id!;
  const resultado: ResultadoProrrogarEEnviar = { prorrogado: false, publicado: false, avisos };

  // 1. prorrogar
  let atualizado: Equipamento | null = null;
  try {
    const atual = await db.buscarEquipamento(equipId);
    let confirmar = false;
    let r = await db.prorrogarPrazoOrcamento({
      equipamentoId: equipId,
      novoPrazo,
      expectedUpdatedEm: atual.atualizado_em ?? "",
      confirmarRespostaPendente: confirmar,
    });
    if (r && !r.prorrogado && r.respostaPendente) {
      const ok = await confirmarRespostaPendente();
      if (!ok) return { ...resultado, respostaPendenteRecusada: true };
      confirmar = true;
      r = await db.prorrogarPrazoOrcamento({
        equipamentoId: equipId,
        novoPrazo,
        expectedUpdatedEm: atual.atualizado_em ?? "",
        confirmarRespostaPendente: confirmar,
      });
    }
    resultado.prorrogado = !!r?.prorrogado;
    atualizado = r?.equipamento ?? null;
    if (!resultado.prorrogado) {
      avisos.push("O prazo não foi prorrogado.");
      return resultado;
    }
  } catch (error) {
    avisos.push(`Não foi possível prorrogar o prazo: ${msgErro(error, "erro desconhecido")}`);
    return resultado;
  }

  // 2. publicar
  try {
    await db.publicarOrcamentoPortal(equipId);
    resultado.publicado = true;
  } catch (error) {
    avisos.push(`Prazo prorrogado, mas não foi possível publicar o orçamento no portal: ${msgErro(error, "erro desconhecido")}`);
  }

  // 3. enviar
  try {
    const verificacao = await db.buscarVerificacao(equipId);
    if (!verificacao) {
      avisos.push("Verificação não encontrada; o orçamento não foi reenviado.");
      return resultado;
    }
    let base = atualizado;
    if (!base) {
      try {
        base = await db.buscarEquipamento(equipId);
      } catch {
        base = null;
      }
    }
    const envio = await enviarOrcamentoAoCliente(base ?? equip, verificacao, {
      reenvioManual: true,
      ...(opcoes.preparo ? { preparo: opcoes.preparo } : {}),
    });
    resultado.whatsapp = envio.canais.whatsapp;
    resultado.email = envio.canais.email;
    if (envio.envioManual) resultado.envioManual = envio.envioManual;
    avisos.push(...envio.avisos);
  } catch (error) {
    avisos.push(`Não foi possível reenviar o orçamento: ${msgErro(error, "erro desconhecido")}`);
  }
  return resultado;
}
