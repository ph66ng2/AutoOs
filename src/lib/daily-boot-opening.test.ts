import { afterEach, describe, expect, it } from "vitest";
import {
  DAILY_BOOT_OPENING_STORAGE_KEY,
  markDailyBootOpeningPlayed,
  shouldPlayDailyBootOpening,
} from "@/lib/daily-boot-opening";

afterEach(() => localStorage.clear());

describe("abertura diária", () => {
  it("roda no primeiro boot do dia e não nos seguintes", () => {
    const morning = new Date(2026, 8, 17, 8, 0);
    const afternoon = new Date(2026, 8, 17, 18, 40);
    const nextDay = new Date(2026, 8, 18, 7, 15);

    expect(shouldPlayDailyBootOpening(morning)).toBe(true);
    markDailyBootOpeningPlayed(morning);
    expect(localStorage.getItem(DAILY_BOOT_OPENING_STORAGE_KEY)).toBe("2026-09-17");
    expect(shouldPlayDailyBootOpening(afternoon)).toBe(false);
    expect(shouldPlayDailyBootOpening(nextDay)).toBe(true);
  });
});
