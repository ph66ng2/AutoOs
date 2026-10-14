import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StampDemo } from "@/components/stamp/StampDemo";

vi.mock("@/components/stamp/audio", () => ({
  armSoundUnlock: () => undefined,
  getSound: () => ({ awake: false, cancel: () => undefined, play: () => undefined }),
  unlockSound: async () => undefined,
}));

describe("abertura stamp", () => {
  it("não mostra nome no canto superior esquerdo", () => {
    const { container } = render(
      <StampDemo mode="loading" motion="quick" sound={false} progress={24} />,
    );

    expect(container.querySelector(".stp-boot")).toBeNull();
    expect(screen.queryByText("AUTOOS")).not.toBeInTheDocument();
    expect(screen.queryByText("BMI TAG")).not.toBeInTheDocument();
    expect(screen.queryByText(/gestão de equipamentos/i)).not.toBeInTheDocument();
  });
});
