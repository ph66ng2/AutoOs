import { useCallback, useEffect, useRef, useState } from "react";
import { buscarStatusPublico, PublicStatusRequestError, type PublicStatusResponse } from "./api";
import { EnderecoRetirada } from "./EnderecoRetirada";
import { formatDate, StatusBrand, StatusView } from "./StatusView";

function tokenFromFragment() {
  const match = window.location.hash.match(/^#\/c\/([a-f\d]{64})$/i);
  return match?.[1] ?? null;
}

/** Título da última resposta aceita no estado. O teste observa a corrida do hash. */
export const latestAcceptedPublicStatus = { title: null as string | null };

export default function PublicStatusPage() {
  const [token, setToken] = useState<string | null>(tokenFromFragment);
  const [data, setData] = useState<PublicStatusResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [error, setError] = useState<"unavailable" | "rate-limit" | "service" | null>(token ? null : "unavailable");
  const requestSeq = useRef(0);
  const tokenRef = useRef(token);

  useEffect(() => {
    const syncToken = () => {
      const next = tokenFromFragment();
      if (next === tokenRef.current) return;
      tokenRef.current = next;
      requestSeq.current += 1;
      setToken(next);
      setData(null);
      setCheckedAt(null);
      setError(next ? null : "unavailable");
      setLoading(Boolean(next));
    };
    window.addEventListener("hashchange", syncToken);
    return () => window.removeEventListener("hashchange", syncToken);
  }, []);

  const loadStatus = useCallback(async () => {
    const requestedToken = token;
    const requestId = ++requestSeq.current;
    if (!requestedToken) {
      setData(null);
      setError("unavailable");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const response = await buscarStatusPublico(requestedToken);
      if (requestId !== requestSeq.current || tokenRef.current !== requestedToken) return;
      latestAcceptedPublicStatus.title = response.titulo;
      setData(response);
      setCheckedAt(new Date().toISOString());
    } catch (cause) {
      if (requestId !== requestSeq.current || tokenRef.current !== requestedToken) return;
      setData(null);
      setError(cause instanceof PublicStatusRequestError ? cause.kind : "service");
    } finally {
      if (requestId === requestSeq.current && tokenRef.current === requestedToken) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const errorCopy = error === "rate-limit"
    ? { title: "Muitas consultas em seguida", description: "Aguarde um minuto e tente novamente." }
    : error === "service"
      ? { title: "Não foi possível consultar agora", description: "O serviço está temporariamente indisponível. Tente novamente em instantes." }
      : { title: "Este acompanhamento não está disponível", description: "Confira se o link está correto ou fale com a equipe BMI TAG pelo canal em que recebeu o link." };

  return (
    <main className="status-shell">
      <StatusBrand />

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
            <StatusView
              equipamento={data.equipamento}
              titulo={data.titulo}
              orientacao={data.orientacao}
              statusAlteradoEm={data.statusAlteradoEm}
            />

            {data.retirada && (
              <section className="portal-destaque is-pronto" aria-label="Endereço para retirada">
                <EnderecoRetirada
                  nome={data.retirada.nome}
                  endereco={data.retirada.endereco}
                  horario={null}
                  mapsUrl={data.retirada.mapsUrl}
                />
              </section>
            )}

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
