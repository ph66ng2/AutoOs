import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  UI_SOUNDS_IDLE_MS,
  UI_SOUNDS_STORAGE_KEY,
  playUiSound,
  resetUiSoundsForTests,
  setUiSoundsEnabled,
  uiSoundsEnabled,
} from "@/lib/ui-sounds";

/** AudioContext mínimo: só o que os sons usam, com `state` controlado pelo teste. */
class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  static resumeResult: () => Promise<void> = () => Promise.resolve();
  state: AudioContextState = "running";
  currentTime = 0;
  sampleRate = 8000;
  destination = {};
  resume = vi.fn(() => FakeAudioContext.resumeResult().then(() => { this.state = "running"; }));
  suspend = vi.fn(() => { this.state = "suspended"; return Promise.resolve(); });
  constructor() { FakeAudioContext.instances.push(this); }
  private param() { return { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }; }
  private node(extra: object = {}) {
    const node = { connect: vi.fn(() => node), start: vi.fn(), stop: vi.fn(), ...extra };
    return node;
  }
  createOscillator() { return this.node({ type: "sine", frequency: this.param() }); }
  createGain() { return this.node({ gain: this.param() }); }
  createBiquadFilter() { return this.node({ type: "bandpass", Q: this.param(), frequency: this.param() }); }
  createBufferSource() { return this.node({ buffer: null }); }
  createBuffer(_channels: number, length: number) { return { getChannelData: () => new Float32Array(length) }; }
}

describe("sons da interface", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeAudioContext.instances = [];
    FakeAudioContext.resumeResult = () => Promise.resolve();
    resetUiSoundsForTests();
    localStorage.removeItem(UI_SOUNDS_STORAGE_KEY);
    vi.stubGlobal("AudioContext", FakeAudioContext);
  });

  afterEach(() => {
    resetUiSoundsForTests();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    localStorage.removeItem(UI_SOUNDS_STORAGE_KEY);
  });

  it("vêm ligados por padrão e tocam", () => {
    expect(uiSoundsEnabled()).toBe(true);
    playUiSound("destravar");
    expect(FakeAudioContext.instances).toHaveLength(1);
  });

  it("desligados, não abrem áudio nenhum; a escolha fica salva neste computador", () => {
    setUiSoundsEnabled(false);
    expect(localStorage.getItem(UI_SOUNDS_STORAGE_KEY)).toBe("off");
    playUiSound("abrir");
    playUiSound("pronto");
    expect(FakeAudioContext.instances).toHaveLength(0);

    setUiSoundsEnabled(true);
    expect(uiSoundsEnabled()).toBe(true);
    playUiSound("pronto");
    expect(FakeAudioContext.instances).toHaveLength(1);
  });

  it("suspende o áudio depois de um tempo sem tocar e retoma no próximo som", () => {
    playUiSound("destravar");
    const ctx = FakeAudioContext.instances[0];
    vi.advanceTimersByTime(200);
    playUiSound("destravar"); // um som novo reinicia a contagem
    vi.advanceTimersByTime(UI_SOUNDS_IDLE_MS);
    expect(ctx.suspend).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(ctx.suspend).toHaveBeenCalledTimes(1);
    expect(ctx.state).toBe("suspended");

    playUiSound("pronto");
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(ctx.resume).toHaveBeenCalledTimes(1);
  });

  it("desligar os sons suspende o áudio na hora", () => {
    playUiSound("destravar");
    setUiSoundsEnabled(false);
    expect(FakeAudioContext.instances[0].suspend).toHaveBeenCalledTimes(1);
  });

  it("falha ao retomar o áudio é tratada e não quebra o fluxo", () => {
    playUiSound("destravar");
    vi.advanceTimersByTime(10_000);
    const ctx = FakeAudioContext.instances[0];
    expect(ctx.state).toBe("suspended");
    const failure = Promise.reject(new Error("sem dispositivo de áudio"));
    const handled = vi.fn();
    const originalCatch = failure.catch.bind(failure);
    const originalThen = failure.then.bind(failure);
    failure.catch = ((onRejected) => { handled(); return originalCatch(onRejected); }) as typeof failure.catch;
    failure.then = ((onFulfilled, onRejected) => { if (onRejected) handled(); return originalThen(onFulfilled, onRejected); }) as typeof failure.then;
    // Função comum, não vi.fn: o mock do Vitest anexa handlers à promessa retornada e esconderia o erro.
    let resumeCalls = 0;
    (ctx as unknown as { resume: () => Promise<void> }).resume = () => { resumeCalls += 1; return failure; };

    expect(() => playUiSound("pronto")).not.toThrow();
    expect(resumeCalls).toBe(1);
    expect(handled).toHaveBeenCalled();
    originalCatch(() => undefined);
  });
});
