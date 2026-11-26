import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { useModelosMensagem } from "@/hooks/useModelosMensagem";
import { montarLinkWhatsapp } from "@/lib/contato-cliente";
import { db } from "@/lib/db";
import { preencherMensagem, type DadosMensagem } from "@/lib/mensagens-prontas";
import { cn } from "@/lib/utils";
import { CarregandoSkeleton, SkeletonLista } from "@/components/ui/skeleton";

const SEM_TEXTO = "__sem_texto__";

/**
 * "WhatsApp ▾": abre a conversa com uma das mensagens prontas da empresa já preenchida (ou sem
 * texto). Quem envia é a pessoa, no WhatsApp; nada sai sozinho. Sem telefone discável, some.
 */
export function WhatsappComMensagem({
  telefone,
  dados,
  onErro,
  className,
}: {
  telefone?: string | null;
  dados: DadosMensagem;
  onErro?: (erro: unknown) => void;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  // As mensagens só são buscadas quando o menu abre pela primeira vez.
  const [jaAbriu, setJaAbriu] = useState(false);
  const { modelos, loading } = useModelosMensagem(jaAbriu);
  if (!montarLinkWhatsapp(telefone, "")) return null;

  const abrir = (texto: string) => {
    const link = montarLinkWhatsapp(telefone, texto);
    if (link) void db.abrirUrl(link).catch((erro) => onErro?.(erro));
  };

  return (
    <Select
      open={aberto}
      value=""
      onOpenChange={(proximo) => {
        setAberto(proximo);
        if (proximo) setJaAbriu(true);
      }}
      onValueChange={(valor) => {
        if (valor === SEM_TEXTO) return abrir("");
        const modelo = modelos.find((m) => String(m.id) === valor);
        if (modelo) abrir(preencherMensagem(modelo.texto, dados));
      }}
    >
      <SelectTrigger
        aria-label="Abrir WhatsApp com uma mensagem"
        className={cn("h-8 w-auto gap-1.5 rounded-lg border-ctl bg-card px-2.5 text-xs font-semibold", className)}
      >
        <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
        WhatsApp
      </SelectTrigger>
      <SelectContent align="end" className="w-[280px] rounded-2xl p-1.5">
        {loading && <CarregandoSkeleton rotulo="Carregando mensagens…" className="px-2.5 py-2"><SkeletonLista itens={3} compacta /></CarregandoSkeleton>}
        {modelos.map((modelo) => (
          <SelectItem key={modelo.id} value={String(modelo.id)} className="rounded-lg">
            <span className="block text-sm font-semibold">{modelo.titulo}</span>
            <span className="block max-w-[230px] truncate text-xs text-muted-foreground">{preencherMensagem(modelo.texto, dados)}</span>
          </SelectItem>
        ))}
        <SelectItem value={SEM_TEXTO} className="rounded-lg text-sm">Sem mensagem</SelectItem>
      </SelectContent>
    </Select>
  );
}
