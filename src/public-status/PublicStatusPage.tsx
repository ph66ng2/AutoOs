import { useCallback, useEffect, useMemo, useState } from "react";
import { buscarStatusPublico, type PublicStatusResponse } from "./api";

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
  const [error, setError] = useState(!token);

  const loadStatus = useCallback(async () => {
    if (!token) {
      setError(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const response = await buscarStatusPublico(token);
      setData(response);
      setCheckedAt(new Date().toISOString());
    } catch {
      setData(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  return (
    <main className="status-shell">
      <header className="status-brand" aria-label="BMI TAG">
        <span className="brand-mark" aria-hidden="true">BMI</span>
        <span className="brand-name">TAG</span>
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
            <h1>Este acompanhamento não está disponível</h1>
            <p>Confira se o link está correto ou fale com a equipe BMI TAG pelo canal em que recebeu o link.</p>
          </div>
        )}

        {!loading && !error && data && (
          <>
            <p className="equipment-name">{data.equipamento}</p>
            <h1>{data.titulo}</h1>
            <p className="orientation">{data.orientacao}</p>

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
