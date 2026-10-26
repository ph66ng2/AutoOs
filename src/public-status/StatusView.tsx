import { useState, type ReactNode } from "react";
import type { EtapaAtendimento } from "./portal-api";

/**
 * Identidade visual do acompanhamento: etapa atual colorida com pulso, orientação, linha do
 * tempo e data confiável. Usada pelo link individual (`#/c/<token>`) e pelo detalhe do portal.
 */
export const STEPS = ["Recebido", "Em verificação", "Aguardando aprovação", "Aprovado", "Pronto", "Entregue"] as const;

export const TITLE_STAGE: Record<string, { index: number; tone: string; deviation?: string }> = {
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

export function toneForTitle(title: string): string {
  return TITLE_STAGE[title]?.tone ?? "blue";
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(value));
}

/** Quais registros de `etapas` pertencem a cada etapa da linha do tempo (portal). */
const ETAPA_DO_STATUS: Record<string, number> = {
  RECEBIDO: 0, EM_VERIFICACAO: 1, VERIFICADO: 1, AGUARDANDO_APROVACAO: 2,
  APROVADO: 3, EM_MANUTENCAO: 3, AGUARDANDO_PECA: 3, PRONTO: 4, ENTREGUE: 5,
};

/** Primeira data registrada de cada etapa; `desvio` é a data da reprovação, se houver. */
export function datasDasEtapas(etapas: EtapaAtendimento[] | undefined): { porEtapa: Array<string | null>; desvio: string | null } {
  const porEtapa: Array<string | null> = STEPS.map(() => null);
  let desvio: string | null = null;
  for (const item of etapas ?? []) {
    const menor = (atual: string | null) => (!atual || new Date(item.em) < new Date(atual) ? item.em : atual);
    if (item.status === "REPROVADO") desvio = menor(desvio);
    else {
      const indice = ETAPA_DO_STATUS[item.status];
      if (indice !== undefined) porEtapa[indice] = menor(porEtapa[indice]);
    }
  }
  return { porEtapa, desvio };
}

const registradaEm = (value: string) =>
  `Registrada em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))}`;

export function StatusBrand() {
  return (
    <header className="status-brand" aria-label="AutoOS BMI TAG">
      <img src="/logo-tag-trasparente.svg" alt="AutoOS BMI TAG" />
    </header>
  );
}

type StatusViewProps = {
  equipamento: string;
  titulo: string;
  orientacao: string;
  statusAlteradoEm: string | null;
  /** Linha extra abaixo do nome do equipamento (série, patrimônio). */
  identificacao?: ReactNode;
  /** No celular, troca a lista de etapas por uma barra de progresso que expande (portal). */
  compacto?: boolean;
  /** Portal: data e hora de cada etapa, reveladas ao passar o mouse, tocar ou focar. */
  etapas?: EtapaAtendimento[];
  /** Portal: atendimento entregue vira "Atendimento concluído" (visual de encerramento). */
  concluido?: boolean;
};

export function StatusView({ equipamento, titulo, orientacao, statusAlteradoEm, identificacao, compacto = false, etapas, concluido = false }: StatusViewProps) {
  const stage = TITLE_STAGE[titulo];
  const [etapasAbertas, setEtapasAbertas] = useState(false);
  const [dataAberta, setDataAberta] = useState<number | null>(null);
  const datas = datasDasEtapas(etapas);
  return (
    <>
      <p className="equipment-name" title={equipamento}>{equipamento}</p>
      {identificacao}
      <div className={`current-status tone-${concluido ? "green" : stage?.tone ?? "blue"}${concluido ? " is-concluido" : ""}`}>
        <span className="status-pulse" aria-hidden="true" />
        <h1>{concluido ? "Atendimento concluído" : titulo}</h1>
      </div>
      {concluido && <p className="concluido-sub">{titulo}</p>}
      <p className="orientation">{orientacao}</p>

      {stage && (
        <nav className={`timeline${concluido ? " is-concluido" : ""}${compacto ? " is-compact" : ""}${etapasAbertas ? " is-open" : ""}`} aria-label="Etapas do atendimento">
          {compacto && (
            <div className={`timeline-compact tone-${stage.tone}`}>
              <div className="timeline-compact-bar" aria-hidden="true">
                {STEPS.map((label, index) => (
                  <span key={label} className={index < stage.index ? "is-complete" : index === stage.index ? "is-current" : ""} />
                ))}
              </div>
              <p className="timeline-compact-text">
                <span>
                  {stage.deviation ? stage.deviation : `Etapa ${stage.index + 1} de ${STEPS.length}`}
                  {statusAlteradoEm && <> · desde {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(statusAlteradoEm))}</>}
                </span>
                <button type="button" className="link-button" aria-expanded={etapasAbertas} onClick={() => setEtapasAbertas((v) => !v)}>
                  {etapasAbertas ? "Ocultar etapas" : "Ver etapas"}
                </button>
              </p>
            </div>
          )}
          <p className="timeline-heading">{etapas ? "Acompanhamento do atendimento" : "Etapas do atendimento"}</p>
          <ol>
            {STEPS.map((label, index) => {
              const complete = index < stage.index || (concluido && index === stage.index);
              const current = index === stage.index && !stage.deviation && !concluido;
              const data = complete || current ? datas.porEtapa[index] : null;
              const conteudo = (
                <>
                  <span className="timeline-marker" aria-hidden="true">{complete ? "✓" : index + 1}</span>
                  <span>{label}</span>
                </>
              );
              return (
                <li
                  className={`${complete ? "is-complete" : current ? `is-current tone-${stage.tone}` : ""}${data && dataAberta === index ? " is-open" : ""}`}
                  key={label}
                  aria-current={current ? "step" : undefined}
                >
                  {data ? (
                    <>
                      <button type="button" className="timeline-step" aria-expanded={dataAberta === index} aria-describedby={`etapa-data-${index}`}
                        onClick={() => setDataAberta((atual) => (atual === index ? null : index))}
                        onBlur={() => setDataAberta((atual) => (atual === index ? null : atual))}>
                        {conteudo}
                      </button>
                      <span className="timeline-when" id={`etapa-data-${index}`} role="tooltip">{registradaEm(data)}</span>
                    </>
                  ) : conteudo}
                </li>
              );
            })}
            {stage.deviation && (
              <li className="is-current is-deviation tone-red" aria-current="step">
                <span className="timeline-marker" aria-hidden="true">!</span>
                <span>{stage.deviation}</span>
                {datas.desvio && <span className="timeline-when is-static">{registradaEm(datas.desvio)}</span>}
              </li>
            )}
          </ol>
          <p className="timeline-note">A etapa atual pode mudar após uma revisão do atendimento.</p>
        </nav>
      )}

      <div className={`date-panel${compacto ? " is-compactable" : ""}`}>
        <span className="date-label">Etapa registrada em</span>
        {statusAlteradoEm
          ? <time dateTime={statusAlteradoEm}>{formatDate(statusAlteradoEm)}</time>
          : <p>Não há uma data confiável registrada para a última mudança de etapa deste atendimento.</p>}
      </div>
    </>
  );
}
