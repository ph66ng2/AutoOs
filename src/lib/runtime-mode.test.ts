import { describe, expect, it } from "vitest";
import { resolveRuntimeMode } from "@/lib/runtime-mode";

describe("resolveRuntimeMode", () => {
  it("mantém o produto interno como padrão", () => {
    expect(resolveRuntimeMode(undefined)).toBe("internal");
    expect(resolveRuntimeMode("unexpected")).toBe("internal");
  });

  it("habilita SaaS somente por modo explícito de build", () => {
    expect(resolveRuntimeMode("saas")).toBe("saas");
  });
});
