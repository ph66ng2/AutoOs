import { describe, expect, it } from "vitest";
import { resumirStatusAuditado } from "./eventos-auditoria";

describe("resumirStatusAuditado", () => {
  it("traduz os estados e informa a OS a partir do formato legado", () => {
    expect(resumirStatusAuditado("empresa_id=1; equipamento_id=55; status_anterior=PRONTO; status=ENTREGUE; motivo=Entrega"))
      .toBe("OS #55 · Pronto → Entregue");
  });

  it("deixa os outros formatos para a apresentação do evento", () => {
    expect(resumirStatusAuditado("equipamento_id=55; status_anterior=PRONTO")).toBeNull();
    expect(resumirStatusAuditado("equipamento_id=55; status_anterior=DESCONHECIDO; status=ENTREGUE")).toBeNull();
  });
});
