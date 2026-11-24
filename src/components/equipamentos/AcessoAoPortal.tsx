import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatarDocumento } from "@/components/equipamentos/AcessoPortalDialog";
import { usePortalCliente } from "@/components/equipamentos/portal-cliente-context";
import { mensagemAcessoPortal } from "@/components/clientes/SenhaPortalDialog";
import { useAcessoPortalCliente } from "@/hooks/useAcessoPortalCliente";
import { useAtualizacaoAoVivo } from "@/hooks/useAtualizacaoAoVivo";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { SENSITIVE_PERMISSIONS, type ClienteContato } from "@/types";
import { CarregandoSkeleton, SkeletonTexto } from "@/components/ui/skeleton";

/**
 * Senha consultada por contato: o texto (ou `null` quando não há senha guardada) e o perfil que a
 * consultou. Só aparece enquanto esse perfil está ativo e desbloqueado.
 */
type SenhaVista = { [contatoId: number]: { valor: string | null; perfilId: number } };

async function copiar(texto: string, ok: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(ok);
  } catch {
    toast.error("Não foi possível copiar");
  }
}

/**
 * Login do portal do cliente e quem pode entrar nele. A equipe vê a senha que ela mesma definiu
 * (com PIN e auditoria), para repassar ao cliente sem trocá-la. Decisão do responsável, 24/11/2026.
 */
export function AcessoAoPortal() {
  const { equipamento, contatosVersao, abrirContatos } = usePortalCliente();
  const { ensureSensitiveAccess, status } = useSensitiveAccess();
  const perfilAtivo = status?.unlocked ? status.active_profile_id ?? null : null;
  const perfilAtivoRef = useRef(perfilAtivo);
  perfilAtivoRef.current = perfilAtivo;
  const { data, loading, error, verSenha } = useAcessoPortalCliente(equipamento.cliente_id, equipamento.empresa_id, contatosVersao);
  const [senhas, setSenhas] = useState<SenhaVista>({});
  const [buscando, setBuscando] = useState<number | null>(null);
  // Contatos editados (senha trocada, criada ou removida): a senha mostrada pode não valer mais.
  // A geração descarta também uma leitura que ainda estava a caminho.
  const geracao = useRef(0);
  useEffect(() => {
    geracao.current += 1;
    setSenhas({});
    setBuscando(null);
  }, [contatosVersao, equipamento.cliente_id]);
  // Contato alterado em outro computador (senha trocada ou removida, acesso retirado): a senha
  // mostrada daquele contato pode não valer mais. Some na hora; "Ver senha" busca a atual.
  useAtualizacaoAoVivo(["cliente_contatos"], (mudancas) => {
    const ids = new Set(mudancas.map((mudanca) => mudanca.id));
    geracao.current += 1;
    setBuscando(null);
    setSenhas((atual) => {
      const proximo: SenhaVista = {};
      for (const [id, item] of Object.entries(atual)) if (!ids.has(Number(id)) && !ids.has(null)) proximo[Number(id)] = item;
      return proximo;
    });
  });
  // Troca de perfil ou bloqueio: some o que outro perfil consultou, e uma leitura a caminho é descartada.
  useEffect(() => {
    geracao.current += 1;
    setSenhas((atual) => {
      const proximo: SenhaVista = {};
      for (const [id, item] of Object.entries(atual)) if (item.perfilId === perfilAtivo) proximo[Number(id)] = item;
      return proximo;
    });
    setBuscando(null);
  }, [perfilAtivo]);

  if (!equipamento.cliente_id) {
    return <p className="text-xs text-muted-foreground">Atendimento sem cliente cadastrado.</p>;
  }

  const documento = data?.documento ? formatarDocumento(data.documento) : null;
  const contatos = data?.contatos ?? [];

  async function mostrarSenha(contato: ClienteContato) {
    if (!contato.id) return;
    const liberado = await ensureSensitiveAccess({
      title: "Ver senha do portal",
      description: `Informe o PIN para ver a senha de ${contato.nome}. A consulta fica registrada.`,
      ...(contato.portal_acesso === "DECIDIR"
        ? { anyPermission: [SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS, SENSITIVE_PERMISSIONS.PREPARE_QUOTES] }
        : { permission: SENSITIVE_PERMISSIONS.MANAGE_STATUS_LINKS }),
    });
    if (!liberado) return;
    // O PIN pode ter trocado o perfil: deixa a tela aplicar a troca antes de marcar a leitura.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const minhaGeracao = geracao.current;
    const perfilDaLeitura = perfilAtivoRef.current;
    if (perfilDaLeitura == null) return;
    setBuscando(contato.id);
    try {
      const senha = await verSenha(contato.id);
      if (minhaGeracao !== geracao.current) return;
      setSenhas((atual) => ({ ...atual, [contato.id!]: { valor: senha, perfilId: perfilDaLeitura } }));
    } catch (cause) {
      if (minhaGeracao !== geracao.current) return;
      toast.error(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (minhaGeracao === geracao.current) setBuscando(null);
    }
  }

  function esconder(contatoId: number) {
    setSenhas((atual) => {
      const proximo = { ...atual };
      delete proximo[contatoId];
      return proximo;
    });
  }

  return (
    <div className="space-y-3 text-sm">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {loading && !data && <CarregandoSkeleton rotulo="Carregando acesso…"><SkeletonTexto linhas={2} /></CarregandoSkeleton>}

      {data && (
        documento ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>Login: <strong>{documento}</strong></p>
            <Button size="sm" variant="outline" onClick={() => void copiar(documento, "Login copiado")}>Copiar</Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">CPF/CNPJ não cadastrado no cliente.</p>
        )
      )}

      {data && (contatos.length > 0 ? (
        <ul aria-label="Contatos com acesso" className="space-y-2">
          {contatos.map((contato) => {
            const id = contato.id!;
            const item = senhas[id];
            const vista = Boolean(item) && item.perfilId === perfilAtivo;
            const senha = vista ? item.valor : null;
            return (
              <li key={id} className="space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="flex flex-wrap gap-x-2">
                    <span className="font-medium">{contato.nome}</span>
                    <span className="text-muted-foreground">·</span>
                    <span>{contato.portal_acesso === "DECIDIR" ? "Aprovar e recusar" : "Só acompanhar"}</span>
                    <span className="text-muted-foreground">·</span>
                    <span>{contato.portal_senha_definida_em ? "Senha criada" : "Sem senha"}</span>
                  </span>
                  {contato.portal_senha_definida_em && (
                    vista ? (
                      <Button size="sm" variant="ghost" onClick={() => esconder(id)}>Esconder senha</Button>
                    ) : (
                      <Button size="sm" variant="outline" disabled={buscando === id} onClick={() => void mostrarSenha(contato)}>
                        {buscando === id ? "Buscando…" : "Ver senha"}
                      </Button>
                    )
                  )}
                </div>
                {vista && (senha ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-2 py-1.5">
                    <p>Senha: <strong className="font-mono">{senha}</strong></p>
                    <span className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => void copiar(senha, "Senha copiada")}>Copiar senha</Button>
                      {documento && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void copiar(mensagemAcessoPortal(contato.nome, documento, senha), "Login e senha copiados")}
                        >
                          Copiar login e senha
                        </Button>
                      )}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Esta senha foi criada antes de o AutoOS guardar senhas, ou foi trocada. Crie uma nova em
                    {" "}"Gerenciar em Contatos" para poder vê-la aqui.
                  </p>
                ))}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Nenhum contato deste cliente tem acesso ao portal.</p>
      ))}

      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={abrirContatos}>Gerenciar em Contatos</Button>
      </div>
    </div>
  );
}
