import { useCallback, useEffect, useMemo, useState } from "react";
import { PortalError, portalApi, shortDate, type AtendimentoResumo, type ListaAtendimentos } from "./portal-api";
import { navigate, type PortalSession } from "./portal-session";
import { TITULO_EM_PREPARACAO, toneForTitle } from "./StatusView";

type Ordem = "ATIVIDADE" | "ENTRADA";
type Aba = "ATUAIS" | "HISTORICO";

const RESPOSTA_ROTULO: Record<string, string> = {
  EM_CORRECAO: "Resposta enviada — em prazo de correção",
  PROCESSANDO: "Resposta enviada — em processamento",
  PENDENTE_EQUIPE: "Resposta aguardando a equipe",
  AGUARDANDO_EQUIPE: "Resposta registrada por outro canal",
};

function ordenar(itens: AtendimentoResumo[], ordem: Ordem) {
  const chave = (item: AtendimentoResumo) => new Date((ordem === "ATIVIDADE" ? item.atividadeEm : item.entradaEm) ?? 0).getTime();
  return [...itens].sort((a, b) => chave(b) - chave(a) || b.id - a.id);
}

type Props = {
  session: PortalSession;
  onExpirou: (mensagem: string) => void;
};

export default function PortalLista({ session, onExpirou }: Props) {
  const [data, setData] = useState<ListaAtendimentos | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [aba, setAba] = useState<Aba>("ATUAIS");
  const [ordem, setOrdem] = useState<Ordem>("ATIVIDADE");

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      setData(await portalApi.listar(session.token));
    } catch (cause) {
      if (cause instanceof PortalError && cause.status === 401) {
        onExpirou(cause.message);
        return;
      }
      setErro(cause instanceof PortalError ? cause.message : "Não foi possível carregar seus atendimentos.");
    } finally {
      setLoading(false);
    }
  }, [session.token, onExpirou]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const atuais = useMemo(() => ordenar((data?.atendimentos ?? []).filter((item) => !item.historico), ordem), [data, ordem]);
  const historico = useMemo(() => ordenar((data?.atendimentos ?? []).filter((item) => item.historico), ordem), [data, ordem]);
  const visiveis = aba === "ATUAIS" ? atuais : historico;
  const aguardando = atuais.filter((item) => item.aguardaResposta).length;

  return (
    <section className="status-card" aria-live="polite">
      <p className="eyebrow">Portal das Impressoras</p>
      <h1 className="portal-title">{data?.cliente ?? "Seus atendimentos"}</h1>
      {aguardando > 0 && data?.podeDecidir && (
        <p className="notice-box">
          {aguardando === 1 ? "1 orçamento aguarda sua resposta." : `${aguardando} orçamentos aguardam sua resposta.`}
        </p>
      )}

      <div className="portal-toolbar">
        <div className="portal-tabs" role="tablist" aria-label="Atendimentos">
          <button role="tab" aria-selected={aba === "ATUAIS"} className={aba === "ATUAIS" ? "is-active" : ""} onClick={() => setAba("ATUAIS")}>
            Atuais ({atuais.length})
          </button>
          <button role="tab" aria-selected={aba === "HISTORICO"} className={aba === "HISTORICO" ? "is-active" : ""} onClick={() => setAba("HISTORICO")}>
            Histórico ({historico.length})
          </button>
        </div>
        <label className="portal-sort">
          <span>Ordenar por</span>
          <select value={ordem} onChange={(event) => setOrdem(event.target.value as Ordem)}>
            <option value="ATIVIDADE">Atividade recente</option>
            <option value="ENTRADA">Data de entrada</option>
          </select>
        </label>
      </div>

      {loading && !data && (
        <div className="loading-state" role="status">
          <span className="spinner" aria-hidden="true" />
          <p>Carregando seus atendimentos…</p>
        </div>
      )}

      {erro && (
        <div className="error-state">
          <p>{erro}</p>
          <button className="refresh-button" type="button" onClick={() => void carregar()}>Tentar novamente</button>
        </div>
      )}

      {data && visiveis.length === 0 && (
        <p className="portal-empty">
          {aba === "ATUAIS" ? "Nenhum atendimento em andamento." : "Nenhum atendimento concluído para mostrar."}
        </p>
      )}

      <ul className="portal-list">
        {visiveis.map((item) => {
          const titulo = item.status === "AGUARDANDO_APROVACAO" && !item.aguardaResposta && !item.resposta ? TITULO_EM_PREPARACAO : item.titulo;
          return (
          <li key={item.id}>
            <a className="portal-item" href={`#/atendimentos/${item.id}`} onClick={(event) => { event.preventDefault(); navigate(`#/atendimentos/${item.id}`); }}>
              <span className="portal-item-name">{item.equipamento}</span>
              <span className="portal-item-id">
                {item.serie && <>Série {item.serie}</>}
                {item.patrimonio && <> · Patrimônio {item.patrimonio}</>}
                {item.entradaEm && <> · Entrada {shortDate(item.entradaEm)}</>}
              </span>
              <span className={`portal-pill tone-${toneForTitle(titulo)}`}>
                <span className="portal-pill-dot" aria-hidden="true" />
                {titulo}
              </span>
              {item.resposta && RESPOSTA_ROTULO[item.resposta] && <span className="portal-badge is-muted">{RESPOSTA_ROTULO[item.resposta]}</span>}
            </a>
          </li>
          );
        })}
      </ul>

      {data && (
        <button className="secondary-button portal-full portal-refresh" type="button" onClick={() => void carregar()} disabled={loading}>
          {loading ? "Atualizando…" : "Atualizar"}
        </button>
      )}
    </section>
  );
}
