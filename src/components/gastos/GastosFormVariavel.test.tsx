import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GastosFormVariavel } from "./GastosFormVariavel";
import { isoDateToBr, todayLocalIsoDate } from "@/lib/date-utils";

describe("GastosFormVariavel: data local", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 27, 22, 30, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("preenche o cadastro com o dia local, não o UTC", () => {
    render(
      <GastosFormVariavel
        open
        onOpenChange={vi.fn()}
        gasto={null}
        onSave={vi.fn()}
        saving={false}
      />,
    );
    expect(todayLocalIsoDate()).toBe("2026-10-27");
    expect(screen.getByDisplayValue(isoDateToBr("2026-10-27"))).toBeInTheDocument();
  });
});
