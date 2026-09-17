import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BootUiProvider, useBootUi } from "@/components/BootUi";
import { DAILY_BOOT_OPENING_STORAGE_KEY } from "@/lib/daily-boot-opening";
import { todayLocalIsoDate } from "@/lib/date-utils";

function Probe() {
  const { openingComplete } = useBootUi();
  return <p>{openingComplete ? "opening-done" : "opening-pending"}</p>;
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("BootUiProvider", () => {
  it("segura a abertura no primeiro boot do dia", () => {
    render(
      <BootUiProvider>
        <Probe />
      </BootUiProvider>,
    );
    expect(screen.getByText("opening-pending")).toBeInTheDocument();
  });

  it("libera login imediatamente nos boots seguintes do mesmo dia", () => {
    window.localStorage.setItem(DAILY_BOOT_OPENING_STORAGE_KEY, todayLocalIsoDate());
    render(
      <BootUiProvider>
        <Probe />
      </BootUiProvider>,
    );
    expect(screen.getByText("opening-done")).toBeInTheDocument();
  });
});
