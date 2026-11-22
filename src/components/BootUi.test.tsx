import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BOOT_ANIMATION_HARD_LIMIT_MS, BootUiProvider, useBootUi } from "@/components/BootUi";

function Probe() {
  const { bootAnimationComplete } = useBootUi();
  return <p>{bootAnimationComplete ? "opening-done" : "opening-pending"}</p>;
}

describe("BootUiProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("segura a abertura até a animação terminar ou o limite de segurança", () => {
    render(
      <BootUiProvider>
        <Probe />
      </BootUiProvider>,
    );
    expect(screen.getByText("opening-pending")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(BOOT_ANIMATION_HARD_LIMIT_MS);
    });
    expect(screen.getByText("opening-done")).toBeInTheDocument();
  });
});
