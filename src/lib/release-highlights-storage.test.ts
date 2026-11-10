import { beforeEach, describe, expect, it, vi } from "vitest";
import { getReleaseHighlightsVersion, ReleaseHighlightsStorage } from "./release-highlights-storage";
import { LEGACY_RELEASE_HIGHLIGHTS_STORAGE_KEY, RELEASE_HIGHLIGHTS_VERSION, releaseHighlightsStorageKey } from "./releaseHighlightsKey";

const runtime = vi.hoisted(() => ({ native: true, version: "1.2.3", read: vi.fn(), write: vi.fn(), getVersion: vi.fn() }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: runtime.getVersion }));
vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => runtime.native }));
vi.mock("@/lib/db", () => ({ db: { getSeenReleaseHighlights: runtime.read, markReleaseHighlightsSeen: runtime.write } }));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  localStorage.clear();
  runtime.native = true;
  runtime.getVersion.mockResolvedValue(runtime.version);
  runtime.read.mockResolvedValue(null);
  runtime.write.mockResolvedValue(undefined);
});

describe("persistência de novidades", () => {
  it("consulta a versão instalada no Tauri e usa a do pacote na web ou em falha de IPC", async () => {
    expect(await getReleaseHighlightsVersion()).toBe("1.2.3");
    runtime.getVersion.mockRejectedValue(new Error("IPC"));
    expect(await getReleaseHighlightsVersion()).toBe(RELEASE_HIGHLIGHTS_VERSION);
    runtime.native = false;
    expect(await getReleaseHighlightsVersion()).toBe(RELEASE_HIGHLIGHTS_VERSION);
    expect(runtime.getVersion).toHaveBeenCalledTimes(2);
  });

  it("mantém visto após limpar localStorage e iniciar uma sessão nova", async () => {
    let disk: string | null = null;
    runtime.read.mockImplementation(async () => disk);
    runtime.write.mockImplementation(async () => { disk = "1.2.3"; });
    const session = new ReleaseHighlightsStorage();
    expect(await session.hasSeen("1.2.3")).toBe(false);
    await session.markSeen("1.2.3");
    localStorage.clear();
    const nextSession = new ReleaseHighlightsStorage();
    expect(await nextSession.hasSeen("1.2.3")).toBe(true);
    expect(await nextSession.hasSeen("1.2.4")).toBe(false);
  });

  it("migra a chave antiga somente para a 0.6.2", async () => {
    localStorage.setItem(LEGACY_RELEASE_HIGHLIGHTS_STORAGE_KEY, "seen");
    expect(await new ReleaseHighlightsStorage().hasSeen("0.6.2")).toBe(true);
    expect(runtime.write).toHaveBeenCalledTimes(1);
    expect(await new ReleaseHighlightsStorage().hasSeen("0.6.3")).toBe(false);
  });

  it("usa localStorage quando o arquivo falha e repara o arquivo ao migrar", async () => {
    runtime.read.mockRejectedValue(new Error("invalid JSON"));
    runtime.write.mockRejectedValue(new Error("read-only"));
    await new ReleaseHighlightsStorage().markSeen("1.2.3");
    expect(localStorage.getItem(releaseHighlightsStorageKey("1.2.3"))).toBe("seen");
    expect(await new ReleaseHighlightsStorage().hasSeen("1.2.3")).toBe(true);
    expect(runtime.write).toHaveBeenCalledTimes(2);
  });

  it("funciona fora do Tauri sem fazer IPC, inclusive após uma nova sessão", async () => {
    runtime.native = false;
    const session = new ReleaseHighlightsStorage();
    expect(await session.hasSeen("1.2.3")).toBe(false);
    await session.markSeen("1.2.3");
    expect(await new ReleaseHighlightsStorage().hasSeen("1.2.3")).toBe(true);
    expect(await new ReleaseHighlightsStorage().hasSeen("1.2.4")).toBe(false);
    expect(runtime.read).not.toHaveBeenCalled();
    expect(runtime.write).not.toHaveBeenCalled();
  });

  it("usa o arquivo mesmo que localStorage esteja bloqueado", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    await new ReleaseHighlightsStorage().markSeen("1.2.3");
    runtime.read.mockResolvedValue("1.2.3");
    expect(await new ReleaseHighlightsStorage().hasSeen("1.2.3")).toBe(true);
    expect(runtime.write).toHaveBeenCalledTimes(1);
  });
});
