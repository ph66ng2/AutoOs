import { useState } from "react";
import { dateTime, money, type ItemHistorico, type SituacaoHistorico } from "./portal-api";

const SITUACAO: Record<SituacaoHistorico, string> = {
  EM_CORRECAO: "em prazo de correção",
  PROCESSANDO: "em processamento",
  PENDENTE_EQUIPE: "aguardando a equipe",
  AGUARDANDO_EQUIPE: "registrada, aguardando a equipe",
  EFETIVADA: "efetivada pela equipe",
  DESFEITA: "desfeita por você",
  SUBSTITUIDA: "substituída por resposta mais nova",
  TRATADA: "tratado pela equipe",
  AGUARDANDO: "aguardando a equipe",
};

const TITULO: Record<string, string> = {
  APROVAR: "Aceite do orçamento",
  RECUSAR: "Recusa do orçamento",
  DESFEITA: "Resposta cancelada",
  NEGOCIAR: "Pedido de negociação",
  DUVIDA: "Dúvida enviada",
  MUDANCA: "Pedido de correção",
};

const VISIVEIS = 5;

function tom(item: ItemHistorico) {
  if (item.tipo === "RESPOSTA" && item.subtipo === "APROVAR") return "aceite";
  if (item.tipo === "RESPOSTA" && item.subtipo === "RECUSAR") return "recusa";
  return "neutro";
}

/** Tudo que foi feito no orçamento, de todas as versões; fica registrado no equipamento. */
export default function PortalHistorico({ historico }: { historico: ItemHistorico[] }) {
  const [todos, setTodos] = useState(false);
  if (historico.length === 0) return null;
  const itens = todos ? historico : historico.slice(0, VISIVEIS);
  return (
    <section className="portal-historico" aria-labelledby="portal-historico-titulo">
      <h2 id="portal-historico-titulo">Histórico</h2>
      <ol>
        {itens.map((item) => {
          const situacao = item.situacao ? SITUACAO[item.situacao] : null;
          return (
            <li
              key={`${item.tipo}-${item.protocolo}`}
              className={`portal-hist-item is-${tom(item)}${item.situacao === "SUBSTITUIDA" || item.situacao === "DESFEITA" ? " is-inativo" : ""}`}
            >
              <div className="portal-hist-head">
                <strong>{TITULO[item.subtipo] ?? "Registro"}</strong>
                <span className="portal-hist-versao">Versão {item.versao} · {money(item.valor)}</span>
              </div>
              <p className="portal-hist-meta">
                <time dateTime={item.em}>{dateTime(item.em)}</time>
                {item.contato && <> · {item.contato}</>}
                {" · "}Protocolo {item.protocolo}
              </p>
              {item.mensagem && <p className="portal-hist-msg">{item.mensagem}</p>}
              {item.ordemCompra && <p className="portal-hist-meta">Ordem de compra: {item.ordemCompra}</p>}
              {situacao && <p className="portal-hist-situacao">Situação: {situacao}</p>}
            </li>
          );
        })}
      </ol>
      {historico.length > VISIVEIS && (
        <button type="button" className="link-button" onClick={() => setTodos((v) => !v)}>
          {todos ? "Mostrar menos" : `Mostrar todos (${historico.length})`}
        </button>
      )}
    </section>
  );
}
