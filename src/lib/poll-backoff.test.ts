import { describe, expect, it } from "vitest";
import { nextPollDelay } from "./poll-backoff";

describe("nextPollDelay", () => {
  it("usa o intervalo normal sem falhas", () => {
    expect(nextPollDelay(0, 60_000, 30_000)).toBe(60_000);
  });
  it("dobra a cada falha e respeita o teto", () => {
    expect(nextPollDelay(1, 60_000, 30_000)).toBe(30_000);
    expect(nextPollDelay(2, 60_000, 30_000)).toBe(60_000);
    expect(nextPollDelay(3, 60_000, 30_000)).toBe(120_000);
    expect(nextPollDelay(50, 60_000, 30_000)).toBe(300_000);
  });
});
