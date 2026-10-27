import { render, screen, waitFor } from "@testing-library/react";
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

describe("abertura stamp com movimento reduzido", () => {
  it("mostra a marca BMITAG carimbada mesmo sem a animação cinematográfica", async () => {
    const original = window.matchMedia;
    const proto = Element.prototype as unknown as Record<string, unknown>;
    const originalGetAnimations = proto.getAnimations;
    const originalAnimate = proto.animate;
    // jsdom não implementa Web Animations.
    proto.getAnimations = () => [];
    proto.animate = () => ({ cancel: () => undefined });
    window.matchMedia = ((query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    try {
      const onComplete = vi.fn();
      const { container } = render(
        <StampDemo mode="loading" motion="cinematic" sound={false} progress={100} onComplete={onComplete} />,
      );

      await waitFor(() => expect(onComplete).toHaveBeenCalled(), { timeout: 4000 });
      const marks = container.querySelectorAll<HTMLImageElement>("img.stp-print-brand");
      expect(marks.length).toBeGreaterThan(0);
      marks.forEach((mark) => expect(mark.style.opacity).toBe("1"));
    } finally {
      window.matchMedia = original;
      proto.getAnimations = originalGetAnimations;
      proto.animate = originalAnimate;
    }
  });
});
