import { useCallback, useEffect, useMemo, useState } from "react";
import { buscarStatusPublico, PublicStatusRequestError, type PublicStatusResponse } from "./api";

const STEPS = ["Recebido", "Em verificação", "Aguardando aprovação", "Aprovado", "Pronto", "Entregue"] as const;
const TITLE_STAGE: Record<string, { index: number; tone: string; deviation?: string }> = {
  "Recebemos seu equipamento": { index: 0, tone: "blue" },
  "Estamos analisando seu equipamento": { index: 1, tone: "indigo" },
  "Análise concluída": { index: 1, tone: "indigo" },
  "O orçamento aguarda sua resposta": { index: 2, tone: "amber" },
  "O prazo do orçamento terminou": { index: 2, tone: "amber" },
  "Orçamento aprovado": { index: 3, tone: "teal" },
  "Serviço em andamento": { index: 3, tone: "teal" },
  "Aguardando peça": { index: 3, tone: "teal" },
  "Pronto para retirada": { index: 4, tone: "violet" },
  "Equipamento entregue": { index: 5, tone: "green" },
  "Orçamento não aprovado": { index: 2, tone: "red", deviation: "Reprovado" },
  "Atendimento encerrado": { index: 2, tone: "red", deviation: "Encerrado" },
};

function tokenFromFragment() {
  const match = window.location.hash.match(/^#\/c\/([a-f\d]{64})$/i);
  return match?.[1] ?? null;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function PublicStatusPage() {
  const token = useMemo(tokenFromFragment, []);
  const [data, setData] = useState<PublicStatusResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [error, setError] = useState<"unavailable" | "rate-limit" | "service" | null>(token ? null : "unavailable");

  const loadStatus = useCallback(async () => {
    if (!token) {
      setError("unavailable");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await buscarStatusPublico(token);
      setData(response);
      setCheckedAt(new Date().toISOString());
    } catch (cause) {
      setData(null);
      setError(cause instanceof PublicStatusRequestError ? cause.kind : "service");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const stage = data ? TITLE_STAGE[data.titulo] : undefined;
  const errorCopy = error === "rate-limit"
    ? { title: "Muitas consultas em seguida", description: "Aguarde um minuto e tente novamente." }
    : error === "service"
      ? { title: "Não foi possível consultar agora", description: "O serviço está temporariamente indisponível. Tente novamente em instantes." }
      : { title: "Este acompanhamento não está disponível", description: "Confira se o link está correto ou fale com a equipe BMI TAG pelo canal em que recebeu o link." };

  return (
    <main className="status-shell">
      <header className="status-brand" aria-label="AutoOS BMI TAG">
        <img src="/logo-tag-trasparente.svg" alt="AutoOS BMI TAG" />
      </header>

      <section className="status-card" aria-live="polite">
        <p className="eyebrow">Acompanhamento do atendimento</p>

        {loading && (
          <div className="loading-state" role="status">
            <span className="spinner" aria-hidden="true" />
            <p>Consultando o atendimento…</p>
          </div>
        )}

        {!loading && error && (
          <div className="error-state">
            <h1>{errorCopy.title}</h1>
            <p>{errorCopy.description}</p>
            {error !== "unavailable" && <button className="refresh-button" type="button" onClick={() => void loadStatus()}>Tentar novamente</button>}
          </div>
        )}

        {!loading && !error && data && (
          <>
            <p className="equipment-name" title={data.equipamento}>{data.equipamento}</p>
            <div className={`current-status tone-${stage?.tone ?? "blue"}`}>
              <span className="status-pulse" aria-hidden="true" />
              <h1>{data.titulo}</h1>
            </div>
            <p className="orientation">{data.orientacao}</p>

            {stage && (
              <nav className="timeline" aria-label="Etapas do atendimento">
                <p className="timeline-heading">Etapas do atendimento</p>
                <ol>
                  {STEPS.map((label, index) => {
                    const complete = index < stage.index;
                    const current = index === stage.index && !stage.deviation;
                    return (
                      <li className={complete ? "is-complete" : current ? `is-current tone-${stage.tone}` : ""} key={label} aria-current={current ? "step" : undefined}>
                        <span className="timeline-marker" aria-hidden="true">{complete ? "✓" : index + 1}</span>
                        <span>{label}</span>
                      </li>
                    );
                  })}
                  {stage.deviation && (
                    <li className="is-current is-deviation tone-red" aria-current="step">
                      <span className="timeline-marker" aria-hidden="true">!</span>
                      <span>{stage.deviation}</span>
                    </li>
                  )}
                </ol>
                <p className="timeline-note">A etapa atual pode mudar após uma revisão do atendimento.</p>
              </nav>
            )}

            <div className="date-panel">
              <span className="date-label">Etapa registrada em</span>
              {data.statusAlteradoEm
                ? <time dateTime={data.statusAlteradoEm}>{formatDate(data.statusAlteradoEm)}</time>
                : <p>Não há uma data confiável registrada para a última mudança de etapa deste atendimento.</p>}
            </div>

            <button className="refresh-button" type="button" onClick={() => void loadStatus()}>
              Atualizar acompanhamento
            </button>
          </>
        )}

        {checkedAt && !loading && !error && (
          <p className="checked-at">Consulta realizada em {formatDate(checkedAt)}.</p>
        )}
      </section>

      <footer className="status-footer">
        <p>Para dúvidas sobre seu atendimento, fale com a equipe BMI TAG pelo canal em que recebeu este link.</p>
        <p>Este link mostra somente a etapa atual do atendimento e não permite aprovar orçamento nem alterar informações.</p>
      </footer>
    </main>
  );
}
