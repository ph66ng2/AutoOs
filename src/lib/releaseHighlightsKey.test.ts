import { describe, expect, it } from "vitest";
import pkg from "../../package.json";
import { RELEASE_HIGHLIGHTS_VERSION } from "@/lib/releaseHighlightsKey";

describe("releaseHighlightsKey", () => {
  it("acompanha a versão do package.json", () => {
    expect(RELEASE_HIGHLIGHTS_VERSION).toBe(pkg.version);
  });
});
