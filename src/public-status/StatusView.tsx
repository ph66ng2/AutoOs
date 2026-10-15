import type { ReactNode } from "react";

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
};

export function StatusView({ equipamento, titulo, orientacao, statusAlteradoEm, identificacao }: StatusViewProps) {
  const stage = TITLE_STAGE[titulo];
  return (
    <>
      <p className="equipment-name" title={equipamento}>{equipamento}</p>
      {identificacao}
      <div className={`current-status tone-${stage?.tone ?? "blue"}`}>
        <span className="status-pulse" aria-hidden="true" />
        <h1>{titulo}</h1>
      </div>
      <p className="orientation">{orientacao}</p>

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
        {statusAlteradoEm
          ? <time dateTime={statusAlteradoEm}>{formatDate(statusAlteradoEm)}</time>
          : <p>Não há uma data confiável registrada para a última mudança de etapa deste atendimento.</p>}
      </div>
    </>
  );
}
