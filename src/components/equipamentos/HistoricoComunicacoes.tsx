/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  HistoricoComunicacoes.tsx — Histórico de Comunicações       ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  Exibe lista cronológica de todas as comunicações (WhatsApp  ║
 * ║  e Email) enviadas para o cliente deste equipamento.         ║
 * ║  Mostra: canal, tipo, destinatário, mensagem, status.       ║
 * ║                                                              ║
 * ║  DEPENDE DE:                                                 ║
 * ║  - lib/db.ts (listarComunicacoes) — busca do banco          ║
 * ║  - types/index.ts (Comunicacao)                              ║
 * ║  - shadcn/ui (Badge)                                         ║
 * ║                                                              ║
 * ║  USADO POR:                                                  ║
 * ║  - pages/Equipamentos.tsx (aba "Comunicações" nos detalhes) ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

import { useState, useEffect } from "react";
import {
  Mail,
  MessageCircle,
  XCircle,
  Clock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import type { Comunicacao } from "@/types";

/**
 * Props do componente. Aceita comunicações já carregadas externamente
 * (evita refetch quando o parent já tem os dados do dialog de detalhes).
 */
interface HistoricoComunicacoesProps {
  equipamentoId: number;
  /** Comunicações já carregadas externamente (evita refetch) */
  comunicacoesExternas?: Comunicacao[];
}

/**
 * Componente de histórico de comunicações.
 * Carrega do banco via db.listarComunicacoes OU recebe dados externos.
 * Exibe canal (WhatsApp/Email), status (Enviado/Falhou), destinatário e mensagem.
 */
export function HistoricoComunicacoes({
  equipamentoId,
  comunicacoesExternas,
}: HistoricoComunicacoesProps) {
  const [comunicacoes, setComunicacoes] = useState<Comunicacao[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (comunicacoesExternas) {
      setComunicacoes(comunicacoesExternas);
      return;
    }

    let cancelled = false;
    async function carregar() {
      setLoading(true);
      try {
        const data = await db.listarComunicacoes(equipamentoId);
        if (!cancelled) setComunicacoes(data);
      } catch (err) {
        console.error("Erro ao carregar comunicações:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    carregar();
    return () => {
      cancelled = true;
    };
  }, [equipamentoId, comunicacoesExternas]);

  /** Retorna ícone do canal (Email ou WhatsApp) */
  const getIcone = (canal: string) => {
    return canal === "EMAIL" ? (
      <Mail className="h-4 w-4" />
    ) : (
      <MessageCircle className="h-4 w-4" />
    );
  };

  /** Retorna badge de status: "Enviado" (verde) ou "Falhou" (vermelho) */
  const getStatusBadge = (com: Comunicacao) => {
    if (!com.enviado) {
      return (
        <Badge variant="destructive" className="text-xs gap-1">
          <XCircle className="h-3 w-3" />
          Falhou
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="text-xs gap-1">
        <Clock className="h-3 w-3" />
        Enviado
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (comunicacoes.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <MessageCircle className="h-10 w-10 mx-auto mb-2 opacity-20" />
        <p>Nenhuma comunicação registrada</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {comunicacoes.map((com) => (
        <div
          key={com.id}
          className="flex gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
        >
          <div className="flex-shrink-0 mt-1">{getIcone(com.canal)}</div>

          <div className="flex-1 space-y-1">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2">
                <Badge
                  variant={com.canal === "WHATSAPP" ? "default" : "secondary"}
                  className="text-xs"
                >
                  {com.canal === "WHATSAPP" ? "WhatsApp" : "Email"}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {com.tipo}
                </Badge>
              </div>
              {getStatusBadge(com)}
            </div>

            <p className="text-sm">
              <span className="text-muted-foreground">Para:</span>{" "}
              {com.destinatario} ({com.contato})
            </p>

            {com.assunto && (
              <p className="text-sm font-medium">{com.assunto}</p>
            )}

            <p className="text-xs text-muted-foreground line-clamp-2">
              {com.mensagem}
            </p>

            {com.data_envio && (
              <p className="text-xs text-muted-foreground">
                Enviado em:{" "}
                {new Date(com.data_envio).toLocaleString("pt-BR")}
              </p>
            )}

            {!com.data_envio && com.criado_em && (
              <p className="text-xs text-muted-foreground">
                Criado em:{" "}
                {new Date(com.criado_em).toLocaleString("pt-BR")}
              </p>
            )}

            {com.enviado === false && com.erro && (
              <p className="text-xs text-red-500">Erro: {com.erro}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
