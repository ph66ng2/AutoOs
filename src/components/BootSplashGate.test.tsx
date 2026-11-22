import { describe, expect, it } from "vitest";
import { MIN_BOOT_SPLASH_MS } from "@/components/BootSplashGate";

describe("BootSplashGate", () => {
  it("segura a abertura 5 segundos no primeiro boot", () => {
    expect(MIN_BOOT_SPLASH_MS).toBe(5_000);
  });
});
