import { useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useModelosMensagem } from "@/hooks/useModelosMensagem";
import { CAMPOS_MENSAGEM, preencherMensagem, ROTULO_CAMPO_MENSAGEM } from "@/lib/mensagens-prontas";
import { mensagemVisivelAoOperador } from "@/lib/operator-errors";
import type { ModeloMensagem } from "@/types";
import { CarregandoSkeleton, SkeletonLista } from "@/components/ui/skeleton";

/** Exemplo do que cada campo vira, para a prévia enquanto se edita. */
const EXEMPLO = { cliente: "Mercado Bom Preço", contato: "Lúcia", equipamento: "Zebra ZD220", os: "128", status: "Pronto" };

type Rascunho = { id: number | null; titulo: string; texto: string; atualizado_em: string | null };

/**
 * Configurações › Integrações (permissão de comunicação): as mensagens prontas que o botão
 * "WhatsApp ▾" oferece no cliente e na OS. Valem para a empresa toda.
 */
export function MensagensProntasCard() {
  const { modelos, loading, error, salvar, excluir } = useModelosMensagem();
  const [editando, setEditando] = useState<Rascunho | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [apagar, setApagar] = useState<ModeloMensagem | null>(null);
  const textoRef = useRef<HTMLTextAreaElement>(null);

  function inserirCampo(campo: string) {
    if (!editando) return;
    const caixa = textoRef.current;
    const inicio = caixa?.selectionStart ?? editando.texto.length;
    const fim = caixa?.selectionEnd ?? editando.texto.length;
    const marcador = `{${campo}}`;
    const texto = editando.texto.slice(0, inicio) + marcador + editando.texto.slice(fim);
    setEditando({ ...editando, texto });
    window.requestAnimationFrame(() => {
      caixa?.focus();
      caixa?.setSelectionRange(inicio + marcador.length, inicio + marcador.length);
    });
  }

  async function gravar() {
    if (!editando) return;
    setSalvando(true);
    try {
      await salvar({ id: editando.id, titulo: editando.titulo, texto: editando.texto, atualizado_em: editando.atualizado_em });
      toast.success("Mensagem salva.");
      setEditando(null);
    } catch (causa) {
      toast.error(mensagemVisivelAoOperador(causa) ?? "Não foi possível salvar a mensagem.");
    } finally {
      setSalvando(false);
    }
  }

  const podeSalvar = Boolean(editando && editando.titulo.trim() && editando.texto.trim()) && !salvando;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Mensagens prontas de WhatsApp</CardTitle>
        {!editando && (
          <Button type="button" size="sm" variant="outline" onClick={() => setEditando({ id: null, titulo: "", texto: "", atualizado_em: null })}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Nova mensagem
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {loading && modelos.length === 0 && <CarregandoSkeleton rotulo="Carregando mensagens prontas"><SkeletonLista itens={3} compacta /></CarregandoSkeleton>}
        {!loading && modelos.length === 0 && !editando && (
          <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>
        )}

        {editando && (
          <div className="space-y-3 rounded-xl border bg-muted/40 p-4">
            <div className="space-y-1.5">
              <Label htmlFor="mensagem-titulo">Nome</Label>
              <Input id="mensagem-titulo" value={editando.titulo} maxLength={60} onChange={(e) => setEditando({ ...editando, titulo: e.target.value })} placeholder="Equipamento pronto" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mensagem-texto">Texto</Label>
              <Textarea id="mensagem-texto" ref={textoRef} rows={4} maxLength={1000} value={editando.texto} onChange={(e) => setEditando({ ...editando, texto: e.target.value })} />
              <div className="flex flex-wrap items-center gap-1.5" aria-label="Inserir campo">
                {CAMPOS_MENSAGEM.map((campo) => (
                  <Button key={campo} type="button" size="sm" variant="ghost" className="h-7 rounded-full border px-2.5 text-xs" onClick={() => inserirCampo(campo)}>
                    {ROTULO_CAMPO_MENSAGEM[campo]}
                  </Button>
                ))}
              </div>
            </div>
            {editando.texto.trim() && (
              <p className="rounded-lg bg-card px-3 py-2 text-sm text-muted-foreground">{preencherMensagem(editando.texto, EXEMPLO)}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditando(null)} disabled={salvando}>Cancelar</Button>
              <Button type="button" onClick={() => void gravar()} disabled={!podeSalvar}>{salvando ? "Salvando..." : "Salvar"}</Button>
            </div>
          </div>
        )}

        <ul className="divide-y">
          {modelos.map((modelo) => (
            <li key={modelo.id} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{modelo.titulo}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{modelo.texto}</p>
              </div>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Editar ${modelo.titulo}`} disabled={Boolean(editando)} onClick={() => setEditando({ id: modelo.id, titulo: modelo.titulo, texto: modelo.texto, atualizado_em: modelo.atualizado_em })}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label={`Excluir ${modelo.titulo}`} disabled={Boolean(editando)} onClick={() => setApagar(modelo)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
      <ConfirmDialog
        open={apagar != null}
        onOpenChange={(aberto) => { if (!aberto) setApagar(null); }}
        title="Excluir mensagem?"
        description={apagar ? `"${apagar.titulo}" sai do menu do WhatsApp para todos.` : ""}
        confirmLabel="Excluir mensagem"
        cancelLabel="Cancelar"
        variant="destructive"
        onConfirm={() => {
          const alvo = apagar;
          setApagar(null);
          if (alvo) void excluir(alvo.id).then(() => toast.success("Mensagem excluída.")).catch((causa) => toast.error(mensagemVisivelAoOperador(causa) ?? "Não foi possível excluir."));
        }}
      />
    </Card>
  );
}
