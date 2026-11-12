/**
 * Sons curtos da interface, sintetizados com Web Audio (sem arquivos de áudio).
 * Só tocam depois de um clique da pessoa, então o navegador permite o áudio.
 * Volume baixo de propósito: é um detalhe, não um aviso.
 */
export type UiSound = "abrir" | "destravar" | "pronto";

/** Preferência deste computador (vale para todos os perfis). Ausente = sons ligados. */
export const UI_SOUNDS_STORAGE_KEY = "autoos:ui-sounds";
/** Sem tocar nada por este tempo, o contexto de áudio é suspenso e o sistema libera o fluxo. */
export const UI_SOUNDS_IDLE_MS = 3000;

export function uiSoundsEnabled(): boolean {
  try {
    return window.localStorage.getItem(UI_SOUNDS_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setUiSoundsEnabled(enabled: boolean) {
  try {
    if (enabled) window.localStorage.removeItem(UI_SOUNDS_STORAGE_KEY);
    else window.localStorage.setItem(UI_SOUNDS_STORAGE_KEY, "off");
  } catch {
    // Sem localStorage a escolha vale só até fechar o app.
  }
  if (!enabled) suspendNow();
}

let context: AudioContext | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function suspendNow() {
  if (idleTimer !== null) clearTimeout(idleTimer);
  idleTimer = null;
  const ctx = context;
  if (!ctx || ctx.state === "closed") return;
  try {
    ctx.suspend().catch(() => undefined);
  } catch {
    // Falha ao suspender não afeta a interface.
  }
}

/** Reinicia a contagem: suspende `afterMs` depois do fim do último som agendado. */
function scheduleIdleSuspend(afterMs: number) {
  if (idleTimer !== null) clearTimeout(idleTimer);
  idleTimer = setTimeout(suspendNow, afterMs + UI_SOUNDS_IDLE_MS);
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    if (context?.state === "closed") context = null;
    context ??= new Ctor();
    if (context.state === "suspended") context.resume().catch(() => undefined);
    return context;
  } catch {
    return null;
  }
}

/** Só para testes: esquece o contexto e o temporizador. */
export function resetUiSoundsForTests() {
  if (idleTimer !== null) clearTimeout(idleTimer);
  idleTimer = null;
  context = null;
}

/** Clique mecânico: estalo agudo bem curto com um "toc" grave por baixo. */
function click(ctx: AudioContext, at: number, volume: number) {
  const high = ctx.createOscillator();
  const highGain = ctx.createGain();
  high.type = "triangle";
  high.frequency.setValueAtTime(2400, at);
  high.frequency.exponentialRampToValueAtTime(900, at + 0.03);
  highGain.gain.setValueAtTime(volume, at);
  highGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
  high.connect(highGain).connect(ctx.destination);
  high.start(at);
  high.stop(at + 0.05);

  const low = ctx.createOscillator();
  const lowGain = ctx.createGain();
  low.type = "sine";
  low.frequency.setValueAtTime(180, at);
  low.frequency.exponentialRampToValueAtTime(90, at + 0.08);
  lowGain.gain.setValueAtTime(volume * 0.9, at);
  lowGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
  low.connect(lowGain).connect(ctx.destination);
  low.start(at);
  low.stop(at + 0.12);
}

/** Sopro: ruído filtrado que sobe de tom, como algo passando perto. */
function whoosh(ctx: AudioContext, at: number, duration: number, volume: number) {
  const length = Math.ceil(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 0.9;
  filter.frequency.setValueAtTime(350, at);
  filter.frequency.exponentialRampToValueAtTime(1800, at + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + duration * 0.45);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(at);
  source.stop(at + duration);
}

/** Nota suave de sino. */
function chime(ctx: AudioContext, at: number, frequency: number, volume: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(frequency, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + 0.75);
}

/**
 * - `abrir`: o avatar voa até o cadeado (sopro) e o cadeado pousa (clique). `landingMs` alinha o clique ao pouso.
 * - `destravar`: o cadeado trava o PIN e vira o avatar (clique duplo).
 * - `pronto`: o perfil está pronto (duas notas).
 */
export function playUiSound(sound: UiSound, landingMs = 700) {
  if (!uiSoundsEnabled()) return;
  const ctx = audio();
  if (!ctx) return;
  let lengthMs = 0;
  try {
    const now = ctx.currentTime + 0.01;
    if (sound === "abrir") {
      whoosh(ctx, now, landingMs / 1000, 0.05);
      click(ctx, now + landingMs / 1000, 0.08);
      lengthMs = landingMs + 120;
    } else if (sound === "destravar") {
      click(ctx, now, 0.07);
      click(ctx, now + 0.09, 0.09);
      lengthMs = 210;
    } else {
      chime(ctx, now, 1318.5, 0.08);
      chime(ctx, now + 0.12, 1975.5, 0.07);
      lengthMs = 870;
    }
  } catch {
    // Sem áudio disponível: a animação segue em silêncio.
  } finally {
    scheduleIdleSuspend(lengthMs);
  }
}
