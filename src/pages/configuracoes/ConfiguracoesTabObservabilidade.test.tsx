import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tabs } from "@/components/ui/tabs";
import { ConfiguracoesTabObservabilidade } from "./ConfiguracoesTabObservabilidade";

describe("auditoria recente", () => {
  it.each([
    {
      data: "2026-11-22 02:36:00.123456",
      tipo: "EQUIPMENT_STATUS_CORRECTED",
      detalhes: "equipamento_id=42; status_anterior=PRONTO; status=EM_MANUTENCAO; correcao=true; motivo=Falha no teste final",
      resumo: "OS #42 · Pronto → Em Manutenção",
    },
    {
      data: "2026-11-22 02:36:00.123456+00",
      tipo: "BUDGET_APPROVED",
      detalhes: "equipamento_id=42; status_anterior=AGUARDANDO_APROVACAO; status=APROVADO; pagamento_codigo=PIX; motivo_divergencia_cliente=Cliente confirmou por telefone",
      resumo: "OS #42 · Aguardando Aprovação → Aprovado",
    },
  ])("mantém os detalhes completos de $tipo disponíveis junto ao resumo", ({ tipo, detalhes, resumo, data }) => {
    const noop = () => {};
    render(
      <Tabs value="observabilidade">
        <ConfiguracoesTabObservabilidade
          supportLoading={false}
          supportStatus={null}
          supportError={null}
          supportMessage={null}
          supportBusy={false}
          loadSupportStatus={noop}
          exportarPacoteSuporte={noop}
          auditSearch=""
          setAuditSearch={noop}
          auditOutcomeFilter="ALL"
          setAuditOutcomeFilter={noop}
          auditProfileFilter="ALL"
          setAuditProfileFilter={noop}
          auditProfileOptions={[]}
          filteredAuditEvents={[{ id: 1, event_type: tipo, details: detalhes, success: true, created_at: data }]}
          exportarAuditoriaCsv={noop}
        />
      </Tabs>,
    );

    expect(screen.getByText(resumo)).toBeVisible();
    expect(screen.getByText(/21\/11\/2026.*23:36:00/)).toBeVisible();
    const expansor = screen.getByText("Detalhes completos");
    fireEvent.click(expansor);
    expect(expansor.closest("details")).toHaveAttribute("open");
    expect(screen.getByText(detalhes)).toBeVisible();
  });
});
