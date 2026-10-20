import { describe, expect, it } from "vitest";
import { PERMISSION_DETAILS } from "@/lib/profile-presets";
import { SENSITIVE_PERMISSION_LABELS } from "@/types";

describe("permissão MANAGE_STATUS_LINKS", () => {
  it("cita o Portal do Cliente além dos links de acompanhamento", () => {
    expect(PERMISSION_DETAILS.MANAGE_STATUS_LINKS.title).toMatch(/Portal do Cliente/);
    expect(PERMISSION_DETAILS.MANAGE_STATUS_LINKS.description).toMatch(/portal/i);
    expect(SENSITIVE_PERMISSION_LABELS.MANAGE_STATUS_LINKS).toMatch(/Portal do Cliente/);
    expect(SENSITIVE_PERMISSION_LABELS.MANAGE_STATUS_LINKS).not.toMatch(/links públicos/);
  });
});
