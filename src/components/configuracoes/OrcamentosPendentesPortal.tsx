import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useOrcamentosPendentesPortal } from "@/hooks/useOrcamentosPendentesPortal";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { SENSITIVE_PERMISSIONS, type PublicacaoLotePortal } from "@/types";

/**
 * Envia ao portal, de uma vez, os orçamentos de OS aguardando aprovação que ainda não foram publicados.
 * Os dados vêm só do hook; o backend confere a permissão de novo.
 */
export function OrcamentosPendentesPortal() {
  const { pendentes, publicarTodos } = useOrcamentosPendentesPortal();
  const { ensureSensitiveAccess } = useSensitiveAccess();
  const [publicando, setPublicando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resumo, setResumo] = useState<PublicacaoLotePortal | null>(null);

  const enviar = async () => {
    const liberado = await ensureSensitiveAccess({
      title: "Enviar orçamentos pendentes ao portal",
      description: "Informe o PIN para publicar no portal os orçamentos aguardando aprovação.",
      anyPermission: [SENSITIVE_PERMISSIONS.MANAGE_STATUS_LINKS, SENSITIVE_PERMISSIONS.PREPARE_QUOTES],
    });
    if (!liberado) return;
    setPublicando(true);
    setErro(null);
    setResumo(null);
    try {
      setResumo(await publicarTodos());
    } catch (cause) {
      setErro(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPublicando(false);
    }
  };

  if (pendentes.length === 0 && !resumo && !erro) return null;

  return (
    <div className="space-y-3 rounded-md border p-3">
      {pendentes.length > 0 && (
        <Button type="button" variant="outline" disabled={publicando} onClick={() => void enviar()}>
          {`Enviar orçamentos pendentes ao portal (${pendentes.length})`}
        </Button>
      )}
      {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}
      {resumo && (
        <div className="space-y-2 text-sm" role="status">
          <p>{`${resumo.publicados.length} orçamento(s) enviados ao portal.`}</p>
          {resumo.falhas.length > 0 && (
            <div>
              <p className="font-medium">Não enviados:</p>
              <ul className="list-disc pl-5">
                {resumo.falhas.map((falha) => (
                  <li key={falha.equipamento_id}>{`${falha.descricao} — ${falha.motivo}`}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
