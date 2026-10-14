function clamp(n: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, n))
}

type FilterKind = "lowpass" | "highpass"

export class StampSound {
  ctx: AudioContext | null = null
  master: GainNode | null = null
  bus: GainNode | null = null
  bufs = new Map<string, AudioBuffer>()
  lastTick = 0

  wake() {
    if (typeof window === "undefined") return null
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.connect(this.ctx.destination)
      this.cancel()
    }
    if (this.ctx.state === "suspended") void this.ctx.resume()
    return this.ctx
  }

  cancel() {
    if (!this.ctx || !this.master) return
    this.bus?.disconnect()
    this.bus = this.ctx.createGain()
    this.bus.connect(this.master)
  }

  make(name: string, seconds: number, sample: (t: number) => number) {
    const cached = this.bufs.get(name)
    if (cached) return cached
    const ctx = this.ctx
    if (!ctx) throw new Error("audio")
    const length = Math.ceil(seconds * ctx.sampleRate)
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = sample(i / ctx.sampleRate)
    this.bufs.set(name, buffer)
    return buffer
  }

  voice(
    buffer: AudioBuffer,
    when = 0,
    gainDb: number | null,
    gainMul: number,
    filters: [FilterKind, number][] = [],
    dest?: AudioNode,
  ) {
    const ctx = this.ctx
    const bus = dest ?? this.bus
    if (!ctx || !bus) return
    const src = ctx.createBufferSource()
    src.buffer = buffer
    let node: AudioNode = src
    for (const [type, frequency] of filters) {
      const filter = ctx.createBiquadFilter()
      filter.type = type
      filter.frequency.value = frequency
      node.connect(filter)
      node = filter
    }
    if (gainDb !== null) {
      const gain = ctx.createGain()
      gain.gain.value = Math.pow(10, gainDb / 20) * (gainMul || 1)
      node.connect(gain)
      node = gain
    } else if (gainMul !== 1) {
      const gain = ctx.createGain()
      gain.gain.value = gainMul
      node.connect(gain)
      node = gain
    }
    node.connect(bus)
    src.start(ctx.currentTime + Math.max(0, when))
  }

  tick() {
    if (!this.wake()) return
    const now = performance.now()
    if (now - this.lastTick < 45) return
    this.lastTick = now
    const buf = this.make(
      "tick",
      0.035,
      (t) => 0.55 * Math.exp(-t * 1100) * (Math.random() * 2 - 1) + 0.3 * Math.sin(2 * Math.PI * 3900 * t) * Math.exp(-t * 320),
    )
    this.voice(buf, 0, -27, 0, [
      ["highpass", 1400],
      ["lowpass", 11000],
    ])
  }

  tap(when = 0, gainDb = -23) {
    if (!this.wake()) return
    const buf = this.make(
      "tap",
      0.07,
      (t) =>
        0.4 * Math.sin(2 * Math.PI * 620 * t) * Math.exp(-t * 70) +
        0.18 * Math.sin(2 * Math.PI * 1240 * t) * Math.exp(-t * 110) +
        0.25 * Math.exp(-t * 1500) * (Math.random() * 2 - 1),
    )
    this.voice(buf, when, gainDb, 0, [
      ["lowpass", 6000],
      ["highpass", 180],
    ])
  }

  air(when = 0, rise = false) {
    if (!this.wake()) return
    const attack = rise ? 0.35 : 0.4
    const release = rise ? 0.45 : 0.4
    let l = 0
    let b = 0
    let h = 0
    const buf = this.make(rise ? "air-rise" : "air", 0.8, (t) => {
      const n = Math.random() * 2 - 1
      l = 0.99765 * l + n * 0.099046
      b = 0.963 * b + n * 0.2965164
      h = 0.57 * h + n * 1.0526913
      const y = l + b + h + n * 0.1848
      const env =
        t < attack
          ? Math.sin((Math.PI / 2) * (t / attack))
          : t > 0.8 - release
            ? Math.sin((Math.PI / 2) * clamp((0.8 - t) / release))
            : 1
      return y * env
    })
    this.voice(buf, when, rise ? -47 : -43, 0, rise ? [["highpass", 700], ["lowpass", 4000]] : [["highpass", 500], ["lowpass", 3200]])
  }

  impact(when = 0, gainDb = -5) {
    const ctx = this.wake()
    if (!ctx || !this.bus) return
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -8
    comp.knee.value = 0
    comp.ratio.value = 2.5
    comp.attack.value = 0.001
    comp.release.value = 0.06
    const gain = ctx.createGain()
    gain.gain.value = Math.pow(10, gainDb / 20) / 0.9
    comp.connect(gain)
    gain.connect(this.bus)
    const thud = this.make("thud", 0.22, (t) => 0.9 * Math.sin(2 * Math.PI * (55 * t + (65 / 30) * (1 - Math.exp(-30 * t)))) * Math.exp(-t * 22))
    const body = this.make("body", 0.12, (t) => 0.45 * Math.sin(2 * Math.PI * 260 * t) * Math.exp(-t * 45))
    const paper = this.make("paper", 0.06, (t) => (Math.random() * 2 - 1) * Math.pow(clamp(1 - t / 0.055), 3))
    const click = this.make("click", 0.012, (t) => 0.6 * Math.exp(-t * 2400) * (Math.random() * 2 - 1))
    this.voice(thud, when, null, 1, [["lowpass", 220]], comp)
    this.voice(body, when, null, 1, [], comp)
    this.voice(paper, when, null, 0.28, [["highpass", 1600], ["lowpass", 7000]], comp)
    this.voice(click, when, null, 1, [["highpass", 2500]], comp)
  }

  peel(when = 0) {
    if (!this.wake()) return
    const buf = this.make(
      "peel",
      0.16,
      (t) => (Math.random() * 2 - 1) * Math.min(1, t / 0.008) * Math.exp(-t * 28) + 0.35 * Math.sin(2 * Math.PI * 150 * t) * Math.exp(-t * 40),
    )
    this.voice(buf, when, -31, 0, [
      ["highpass", 300],
      ["lowpass", 2400],
    ])
  }

  chime(when = 0) {
    if (!this.wake()) return
    const a = this.make(
      "chime-1",
      0.45,
      (t) => (Math.sin(2 * Math.PI * 1318.5 * t) + 0.25 * Math.sin(2 * Math.PI * 2637 * t)) * Math.exp(-t * 10) * Math.min(1, t * 300),
    )
    const b = this.make(
      "chime-2",
      0.55,
      (t) => (Math.sin(2 * Math.PI * 1975.5 * t) + 0.25 * Math.sin(2 * Math.PI * 3951 * t)) * Math.exp(-t * 8) * Math.min(1, t * 300),
    )
    this.voice(a, when, -19, 0, [["lowpass", 9000]])
    this.voice(b, when + 0.085, -19, 0, [["lowpass", 9000]])
  }

  get awake() {
    return this.ctx !== null
  }
}

let shared: StampSound | null = null

export function getSound() {
  return (shared ??= new StampSound())
}

export function unlockSound() {
  const fx = getSound()
  const ctx = fx.wake()
  if (ctx?.state === "suspended") void ctx.resume()
}

export function armSoundUnlock() {
  if (typeof window === "undefined") return () => {}
  const unlock = () => unlockSound()
  window.addEventListener("pointerdown", unlock, { capture: true })
  window.addEventListener("keydown", unlock, { capture: true })
  window.addEventListener("touchstart", unlock, { capture: true, passive: true })
  unlockSound()
  return () => {
    window.removeEventListener("pointerdown", unlock, true)
    window.removeEventListener("keydown", unlock, true)
    window.removeEventListener("touchstart", unlock, true)
  }
}
