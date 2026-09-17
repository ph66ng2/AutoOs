import { animate, motionValue, type AnimationPlaybackControls, type MotionValue } from "motion"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type React from "react"
import { armSoundUnlock, getSound, unlockSound } from "./audio"
import {
  BOUNCE_WAIT,
  BRAND,
  DAYS,
  EASE_IN_OUT,
  EASE_OUT,
  EASE_STRIKE,
  EASE_WINDUP,
  INKS,
  INK_KEYS,
  INVOICES,
  LABEL,
  LABEL_ALIGN,
  LOADING,
  MONTHS_SHORT,
  PRESS_WINDUP,
  PRINT_AT,
  SHEET,
  STAMP,
  STAMP_HOME,
  STAMP_REST,
  STATUS_COPY,
  TIMING,
  TOAST_AT,
  UNIT,
  WIDE,
  clamp,
  daysInMonth,
  longDate,
  poseAt,
  shortDate,
  smoothstep,
  yearsAround,
  type CameraMode,
  type Ink,
  type Layout,
  type LiveStatus,
  type Pose,
  type PrintMark,
  type StampDate,
  type Timing,
} from "./constants"
import { roundedSides } from "./geometry"
import { InvoiceSheet } from "./InvoiceSheet"
import { StatusSeg, Wheel } from "./Wheel"
import "./stamp.css"

type Phase = "set" | "tilt" | "pov" | "rise" | "done" | "undo" | "quick"

function loadingStatus(load: number, phase: Phase) {
  if (phase === "done") return "Pronto"
  if (load >= 1 || phase !== "set") return "Aplicando etiqueta"
  if (load >= 0.62) return "Sincronizando equipamentos"
  return "Preparando etiquetas"
}

class StampAbort extends Error {
  constructor() {
    super("stamp-abort")
    this.name = "StampAbort"
  }
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  })
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])
  return reduced
}

function applyPose(view: HTMLElement, cam: HTMLElement, pose: Pose) {
  view.style.perspective = `${pose.f}px`
  view.style.perspectiveOrigin = `${pose.cx}px ${pose.cy}px`
  cam.style.transform = `translate3d(${pose.cx}px, ${pose.cy}px, ${pose.f - pose.dist * UNIT}px) rotateX(${pose.rx}deg) translate3d(${-pose.tx}px, ${-pose.ty}px, ${-pose.tz}px)`
}

function revealPrint(nodes: (HTMLElement | null)[], kind: "thump" | "fade" | "instant") {
  for (const node of nodes) {
    if (!node) continue
    node.getAnimations().forEach((anim) => anim.cancel())
    node.style.opacity = "1"
    if (kind === "thump") {
      node.animate(
        [
          { opacity: 0, scale: "1.16" },
          { opacity: 1, scale: "1" },
        ],
        { duration: 150, easing: "cubic-bezier(0.32, 0, 0.67, 0)" },
      )
    } else if (kind === "fade") {
      node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: "ease-out" })
    }
  }
}

type StampDemoProps = {
  motion?: CameraMode
  sound?: boolean
  timing?: Partial<Timing>
  mode?: "demo" | "loading"
  /** 0–100 do boot real; quando informado, dirige a barra e dispara o carimbo ao chegar em 100. */
  progress?: number
  /** Chamado uma vez quando o modo loading chega em phase "done". */
  onComplete?: () => void
}

export function StampDemo({
  motion = "cinematic",
  sound = true,
  timing,
  mode = "demo",
  progress,
  onComplete,
}: StampDemoProps) {
  const reduced = usePrefersReducedMotion()
  const timingRef = useRef({ ...TIMING, ...timing })

  const today = useMemo(() => {
    const now = new Date()
    return { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() }
  }, [])
  const years = useMemo(() => yearsAround(today.y), [today.y])

  const [date, setDate] = useState<StampDate>(today)
  const [status, setStatus] = useState<LiveStatus>("paid")
  const [ink, setInk] = useState<Ink>("blue")
  const [invoiceIndex, setInvoiceIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>("set")
  const [print, setPrint] = useState<PrintMark | null>(null)
  const [toast, setToast] = useState(false)
  const [holding, setHolding] = useState(false)
  const [load, setLoad] = useState(0)
  const [layout, setLayout] = useState<Layout>(mode === "loading" ? LOADING : WIDE)
  const [scale, setScale] = useState(1)

  const invoice = INVOICES[invoiceIndex % INVOICES.length]
  const sides = useMemo(() => roundedSides(STAMP.W, STAMP.D, STAMP.R, 6), [])
  const live = phase === "set"

  const root = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const view = useRef<HTMLDivElement>(null)
  const cam = useRef<HTMLDivElement>(null)
  const scene = useRef<HTMLDivElement>(null)
  const paper = useRef<HTMLDivElement>(null)
  const stamp = useRef<HTMLDivElement>(null)
  const glow = useRef<HTMLDivElement>(null)
  const desk = useRef<HTMLDivElement>(null)
  const halo = useRef<HTMLDivElement>(null)
  const uiSet = useRef<HTMLDivElement>(null)
  const wideShadow = useRef<HTMLDivElement>(null)
  const softShadow = useRef<HTMLDivElement>(null)
  const contactShadow = useRef<HTMLDivElement>(null)
  const print3d = useRef<HTMLElement>(null)
  const printFlat = useRef<HTMLElement>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const nextBtn = useRef<HTMLButtonElement>(null)

  const camProgress = useMemo(() => motionValue(mode === "loading" ? 1 : 0), [mode])
  const stampX = useMemo(() => motionValue(mode === "loading" ? STAMP_REST.x : STAMP_HOME.x), [mode])
  const stampY = useMemo(() => motionValue(mode === "loading" ? STAMP_REST.y : STAMP_HOME.y), [mode])
  const stampZ = useMemo(() => motionValue(mode === "loading" ? STAMP_REST.z : STAMP.HOVER), [mode])
  const press = useMemo(() => motionValue(0), [])
  const lift = useMemo(() => motionValue(0), [])
  const squash = useMemo(() => motionValue(0), [])
  const sceneOpacity = useMemo(() => motionValue(1), [])
  const feed = useMemo(() => motionValue(0), [])
  const stampVis = useMemo(() => motionValue(1), [])

  const gen = useRef(0)
  const running = useRef<AnimationPlaybackControls[]>([])
  const waits = useRef<number[]>([])
  const [inkSeed] = useState(() => Math.floor(Math.random() * 900) + 7)
  const seeded = useRef(inkSeed)
  const stampedOnce = useRef(false)
  const soundOn = useRef(sound)
  const layoutRef = useRef(layout)
  const hold = useRef<{ arm: number; fire: number; started: boolean; fired: boolean; cancelled: boolean } | null>(null)

  useEffect(() => {
    timingRef.current = { ...TIMING, ...timing }
  }, [timing])
  useEffect(() => {
    soundOn.current = sound
  }, [sound])
  useEffect(() => {
    layoutRef.current = layout
  }, [layout])

  const play = useCallback((name: "tick" | "tap" | "air" | "impact" | "peel" | "chime", a?: number, b?: number | boolean) => {
    if (!soundOn.current) return
    unlockSound()
    const fx = getSound()
    if (name === "tick") fx.tick()
    else if (name === "tap") fx.tap(a, typeof b === "number" ? b : undefined)
    else if (name === "air") fx.air(a, Boolean(b))
    else if (name === "impact") fx.impact(a, typeof b === "number" ? b : undefined)
    else if (name === "peel") fx.peel(a)
    else fx.chime(a)
  }, [])

  const cancel = useCallback((opts?: { audio?: boolean }) => {
    gen.current += 1
    running.current.forEach((ctrl) => ctrl.stop())
    running.current = []
    waits.current.forEach((id) => window.clearTimeout(id))
    waits.current = []
    if (opts?.audio !== false && getSound().awake) getSound().cancel()
  }, [])

  const run = useCallback(async (token: number, value: MotionValue<number>, to: number, opts: object) => {
    const ctrl = animate(value, to, opts)
    running.current.push(ctrl)
    await ctrl
    if (token !== gen.current) throw new StampAbort()
  }, [])

  const wait = useCallback((token: number, ms: number) => {
    return new Promise<void>((resolve, reject) => {
      const id = window.setTimeout(() => {
        if (token !== gen.current) reject(new StampAbort())
        else resolve()
      }, ms)
      waits.current.push(id)
    })
  }, [])

  const render = useCallback(() => {
    const progress = camProgress.get()
    const pose = poseAt(layoutRef.current, progress)
    if (view.current && cam.current) applyPose(view.current, cam.current, pose)

    const vis = sceneOpacity.get()
    const uiFade = progress <= 1 ? 1 - smoothstep(0, 0.22, progress) : 0
    const paperFade = progress <= 1 ? smoothstep(0.02, 0.38, progress) : 1
    const deskFade =
      mode === "loading"
        ? 1
        : progress <= 1
          ? smoothstep(0.05, 0.6, progress)
          : 1 - smoothstep(1.15, 1.85, progress)

    if (scene.current) scene.current.style.opacity = String(vis)
    if (uiSet.current) uiSet.current.style.opacity = String(uiFade * vis)
    if (halo.current) halo.current.style.opacity = String(uiFade * vis)
    if (desk.current) desk.current.style.opacity = String(deskFade)
    if (paper.current) paper.current.style.opacity = String(mode === "loading" ? 1 : paperFade)
    if (root.current) {
      const looped = ((feed.get() % LABEL.pitch) + LABEL.pitch) % LABEL.pitch
      root.current.style.setProperty("--label-feed", `${LABEL_ALIGN + looped}px`)
    }
    const z = stampZ.get()
    const sx = stampX.get()
    const sy = stampY.get()
    const p = press.get()
    const up = lift.get()
    const sq = squash.get()
    const shown = stampVis.get()
    const scaleXY = 1 + 0.045 * p - 0.035 * sq
    if (stamp.current) {
      stamp.current.style.transform = `translate3d(${sx}px, ${sy - up * 30 * UNIT}px, ${z + up * 14 * UNIT}px) scale3d(${scaleXY}, ${scaleXY}, ${1 - 0.075 * p})`
      stamp.current.style.opacity = String(shown)
      stamp.current.style.visibility = up > 0.98 || shown < 0.02 ? "hidden" : "visible"
    }
    if (glow.current) glow.current.style.opacity = String(shown * (progress <= 1 ? 0.85 : 0.35))

    const height = Math.max(0, z / UNIT)
    const shadowMul = (mode === "loading" ? 1 : paperFade) * (1 - up) * (1 - up) * shown
    const soft = {
      ox: height * 0.04,
      oy: height * 0.2,
      grow: height * 0.1,
      blur: 0.22 + height * 0.3,
      op: 0.2 / (1 + height * 0.16),
    }
    const contact = {
      ox: height * 0.01,
      oy: height * 0.05,
      grow: -0.12 + height * 0.05,
      op: 0.5 * Math.exp(-height / 1.6),
    }
    const mix = clamp((soft.blur - 0.3) / 2.3)
    const put = (el: HTMLDivElement | null, ox: number, oy: number, grow: number, opacity: number, zOff: number) => {
      if (!el) return
      const psx = (STAMP.W + 2 * grow * UNIT) / STAMP.W
      const psy = (STAMP.D + 2 * grow * UNIT) / STAMP.D
      el.style.transform = `translate3d(${sx - STAMP.W / 2 + ox * UNIT}px, ${sy - STAMP.D / 2 + oy * UNIT}px, ${zOff}px) scale(${psx}, ${psy})`
      el.style.opacity = String(Math.max(0, opacity))
    }
    put(softShadow.current, soft.ox, soft.oy, soft.grow, soft.op * (1 - mix) * shadowMul, 0.3)
    put(wideShadow.current, soft.ox, soft.oy, soft.grow, soft.op * mix * shadowMul, 0.35)
    put(contactShadow.current, contact.ox, contact.oy, contact.grow, contact.op * shadowMul, 0.4)
  }, [feed, mode, stampVis, stampX, stampY])

  useEffect(() => {
    let scheduled = false
    const kick = () => {
      if (scheduled) return
      scheduled = true
      requestAnimationFrame(() => {
        scheduled = false
        render()
      })
    }
    const unsub = [camProgress, stampX, stampY, stampZ, press, lift, squash, sceneOpacity, feed, stampVis].map((value) => value.on("change", kick))
    return () => unsub.forEach((off) => off())
  }, [render, camProgress, stampX, stampY, stampZ, press, lift, squash, sceneOpacity, feed, stampVis])

  useLayoutEffect(() => {
    render()
  }, [render, layout])

  useLayoutEffect(() => {
    if (mode === "loading") camProgress.set(1)
  }, [camProgress, mode])

  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const measure = () => {
      const width = Math.floor(el.clientWidth)
      const height = Math.floor(el.clientHeight)
      if (!width) return
      if (mode === "loading") {
        setLayout(LOADING)
        setScale(Math.min(width / LOADING.w, (height || LOADING.h) / LOADING.h))
        return
      }
      if (width >= 560) {
        setLayout(WIDE)
        setScale(Math.min(1, width / WIDE.w))
        return
      }
      setScale(1)
      setLayout((prev) => (prev.name === "tall" && prev.w === width ? prev : { ...WIDE, name: "tall", w: width, toast: width ? 720 - 56 : WIDE.toast }))
    }
    measure()
    if (typeof ResizeObserver !== "function") return
    const obs = new ResizeObserver(measure)
    obs.observe(el)
    return () => obs.disconnect()
  }, [mode])

  useEffect(() => armSoundUnlock(), [])
  useEffect(() => cancel, [cancel])

  const makePrint = useCallback(
    (voided: boolean): PrintMark => ({
      status: voided ? "void" : status,
      date,
      ink,
      seed: (seeded.current = (seeded.current * 7 + 13) % 997),
      rot: mode === "loading" ? -1.1 : -4 + (Math.random() * 2.4 - 1.2),
      dx: mode === "loading" ? 0 : Math.random() * 6 - 3,
      dy: mode === "loading" ? 0 : Math.random() * 6 - 3,
    }),
    [date, ink, mode, status],
  )

  const stampNow = useCallback(
    async (opts: { quick?: boolean; voided?: boolean; via: string; autoRise?: boolean }) => {
      if (phase !== "set") return
      cancel({ audio: false })
      const token = gen.current
      const mark = makePrint(!!opts.voided)
      setPrint(mark)

      const box = stage.current?.getBoundingClientRect()
      const inView = !box || box.height <= window.innerHeight * 1.04
      const cinematic =
        !reduced &&
        inView &&
        !opts.quick &&
        (motion === "cinematic" || (motion === "auto" && !stampedOnce.current))
      if (cinematic && box && (box.top < -4 || box.bottom > window.innerHeight + 4)) {
        stage.current?.scrollIntoView({ behavior: "smooth", block: "center" })
      }
      stampedOnce.current = true

      try {
        if (!cinematic) {
          if (mode === "loading") {
            camProgress.set(2)
            stampX.set(STAMP_REST.x)
            stampY.set(STAMP_REST.y)
            stampZ.set(STAMP_REST.z)
            lift.set(0)
            press.set(0)
            setPhase("done")
            if (reduced) revealPrint([print3d.current, printFlat.current], "fade")
            else {
              play("impact", 0.13, -9)
              revealPrint([print3d.current, printFlat.current], "thump")
            }
            return "quick"
          }
          setPhase("quick")
          if (!reduced) await run(token, squash, 1, { duration: 0.08, ease: "easeOut" })
          await run(token, sceneOpacity, 0, { duration: reduced ? 0.12 : 0.14, ease: "easeIn" })
          camProgress.set(2)
          lift.set(1)
          squash.set(0)
          setPhase("done")
          await run(token, sceneOpacity, 1, { duration: 0.22, ease: EASE_OUT })
          if (reduced) revealPrint([print3d.current, printFlat.current], "fade")
          else {
            play("impact", 0.13, -9)
            revealPrint([print3d.current, printFlat.current], "thump")
          }
          return "quick"
        }

        setPhase("tilt")
        play("air", 0)
        if (camProgress.get() < 0.98) {
          await run(token, camProgress, 1, { duration: timingRef.current.tilt, ease: EASE_IN_OUT })
        } else {
          camProgress.set(1)
        }
        setPhase("pov")
        await wait(token, 60)
        const strike = timingRef.current.press
        unlockSound()
        const ctx = getSound().wake()
        if (ctx?.state === "suspended") {
          try {
            await ctx.resume()
          } catch {
            /* autoplay */
          }
        }
        await run(token, stampZ, STAMP.HOVER + 0.8 * UNIT, { duration: strike * PRESS_WINDUP, ease: EASE_WINDUP })
        play("impact", Math.max(0, strike - 1 / 60), mode === "loading" ? -1 : -5)
        await run(token, stampZ, 0, { duration: strike, ease: EASE_STRIKE })
        revealPrint([print3d.current, printFlat.current], "instant")
        await run(token, press, 1, { duration: 0.06, ease: "easeOut" })
        await wait(token, 90)
        play("peel", 0)
        running.current.push(
          animate(press, 0, { type: "spring", bounce: timingRef.current.bounce, duration: 0.4 }),
        )
        running.current.push(
          animate(stampZ, STAMP.HOVER, { type: "spring", bounce: timingRef.current.bounce, duration: 0.55 }),
        )
        await wait(token, BOUNCE_WAIT)
        play("air", 0, true)
        if (mode === "loading") {
          play("chime", 0.02)
          await Promise.all([
            run(token, stampX, STAMP_REST.x, { duration: 0.5, ease: [0.77, 0, 0.175, 1] }),
            run(token, stampY, STAMP_REST.y, { duration: 0.5, ease: [0.77, 0, 0.175, 1] }),
            run(token, stampZ, STAMP_REST.z, { duration: 0.46, ease: [0.77, 0, 0.175, 1] }),
            run(token, camProgress, 2, { duration: 0.95, ease: EASE_IN_OUT }),
          ])
          setPhase("done")
          return "cinematic"
        }
        running.current.push(animate(lift, 1, { duration: timingRef.current.liftAway, ease: EASE_STRIKE }))
        await wait(token, timingRef.current.liftAway * 1000 * TOAST_AT)
        if (opts.autoRise) {
          play("chime", 0.02)
          play("air", 0, true)
          running.current.push(animate(lift, 1, { duration: 0.4, ease: EASE_STRIKE }))
          await run(token, camProgress, 2, { duration: timingRef.current.rise, ease: EASE_IN_OUT })
          setPhase("done")
          return "cinematic"
        }
        setToast(true)
        play("chime", 0.02)
        return "cinematic"
      } catch (error) {
        if (!(error instanceof StampAbort)) throw error
      }
    },
    [cancel, makePrint, mode, motion, phase, play, reduced, run, stampX, stampY, wait],
  )

  const stampNowRef = useRef(stampNow)
  useEffect(() => {
    stampNowRef.current = stampNow
  }, [stampNow])

  const completedRef = useRef(false)
  useEffect(() => {
    if (mode !== "loading" || phase !== "done" || completedRef.current) return
    completedRef.current = true
    onComplete?.()
  }, [mode, onComplete, phase])

  const stampKickRef = useRef(false)

  // Boot dirigido por progresso real (AutoOS).
  useEffect(() => {
    if (mode !== "loading" || progress == null) return
    unlockSound()
    const next = Math.min(1, Math.max(0, progress / 100))
    setLoad(next)
    if (!reduced) {
      feed.set(next * 12 * LABEL.pitch)
    }
  }, [feed, mode, progress, reduced])

  useEffect(() => {
    if (mode !== "loading" || progress == null || progress < 100) return
    if (stampKickRef.current || stampedOnce.current) return
    stampKickRef.current = true

    let gone = false
    const prepareAndStamp = async () => {
      try {
        if (reduced) {
          stampX.set(STAMP_HOME.x)
          stampY.set(STAMP_HOME.y)
          stampZ.set(STAMP.HOVER)
          feed.set(0)
        } else {
          const current = feed.get()
          const snapped = Math.round(current / LABEL.pitch) * LABEL.pitch
          await animate(feed, snapped, { duration: 0.28, ease: [0.22, 1, 0.36, 1] })
          if (gone) return
          play("air", 0)
          await Promise.all([
            animate(stampX, STAMP_HOME.x, { duration: 0.5, ease: [0.77, 0, 0.175, 1] }),
            animate(stampY, STAMP_HOME.y, { duration: 0.5, ease: [0.77, 0, 0.175, 1] }),
            animate(stampZ, STAMP.HOVER, { duration: 0.42, ease: [0.77, 0, 0.175, 1] }),
          ])
        }
        if (gone) return
        await stampNowRef.current({ via: "load", autoRise: true })
      } catch (error) {
        if (!(error instanceof StampAbort)) throw error
      }
    }
    void prepareAndStamp()
    return () => {
      gone = true
      // Permite remount do StrictMode reiniciar o carimbo se ainda não concluiu.
      if (!stampedOnce.current) stampKickRef.current = false
    }
  }, [feed, mode, play, progress, reduced, stampX, stampY, stampZ])

  // Demo autônoma (repositório stamp) quando não há progresso externo.
  useEffect(() => {
    if (mode !== "loading" || progress != null) return
    unlockSound()
    let gone = false
    const value = motionValue(0)
    const stop = value.on("change", (next) => {
      if (!gone) setLoad(next)
    })
    const feedLoop = reduced ? null : animate(feed, 40 * LABEL.pitch, { duration: 18, ease: "linear" })

    const runLoad = async () => {
      const pause = async (ms: number) => {
        await new Promise((resolve) => window.setTimeout(resolve, ms))
        if (gone) throw new StampAbort()
      }
      try {
        await animate(value, reduced ? 1 : 0.62, {
          duration: reduced ? 0.35 : 1.35,
          ease: [0.37, 0, 0.63, 1],
        })
        if (gone) return
        if (!reduced) {
          await pause(80)
          await animate(value, 1, { duration: 0.72, ease: [0.23, 1, 0.32, 1] })
        }
        if (gone) return
        setLoad(1)
        feedLoop?.stop()
        if (!reduced) {
          const current = feed.get()
          const snapped = Math.round(current / LABEL.pitch) * LABEL.pitch
          await animate(feed, snapped, { duration: 0.28, ease: [0.22, 1, 0.36, 1] })
        } else {
          feed.set(0)
        }
        if (gone) return
        if (reduced) {
          stampX.set(STAMP_HOME.x)
          stampY.set(STAMP_HOME.y)
          stampZ.set(STAMP.HOVER)
        } else {
          play("air", 0)
          await Promise.all([
            animate(stampX, STAMP_HOME.x, { duration: 0.5, ease: [0.77, 0, 0.175, 1] }),
            animate(stampY, STAMP_HOME.y, { duration: 0.5, ease: [0.77, 0, 0.175, 1] }),
            animate(stampZ, STAMP.HOVER, { duration: 0.42, ease: [0.77, 0, 0.175, 1] }),
          ])
        }
        if (gone) return
        await pause(reduced ? 40 : 90)
        await stampNowRef.current({ via: "load", autoRise: true })
      } catch (error) {
        if (!(error instanceof StampAbort)) throw error
      }
    }

    void runLoad()
    return () => {
      gone = true
      stop()
      feedLoop?.stop()
    }
  }, [feed, mode, play, progress, reduced, stampX, stampY, stampZ])

  const undo = useCallback(
    async (nextInvoice: boolean) => {
      cancel()
      const token = gen.current
      try {
        if (phase === "pov" || phase === "tilt") {
          setToast(false)
          setPhase("undo")
          print3d.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: "forwards" })
          running.current.push(animate(stampZ, STAMP.HOVER, { duration: 0.3, ease: EASE_OUT }))
          running.current.push(animate(press, 0, { duration: 0.2 }))
          running.current.push(animate(lift, 0, { duration: 0.55, ease: EASE_OUT }))
          await run(token, camProgress, 0, { duration: timingRef.current.tilt * 0.875, ease: EASE_IN_OUT })
        } else {
          setToast(false)
          setPhase("undo")
          await run(token, sceneOpacity, 0, { duration: 0.14, ease: "easeIn" })
          camProgress.set(0)
          lift.set(0)
          stampZ.set(STAMP.HOVER)
          press.set(0)
          if (nextInvoice) {
            setInvoiceIndex((n) => n + 1)
            setDate(today)
          }
          setPrint(null)
          setPhase("set")
          await run(token, sceneOpacity, 1, { duration: 0.22, ease: EASE_OUT })
          return
        }
        setPrint(null)
        setPhase("set")
      } catch (error) {
        if (!(error instanceof StampAbort)) throw error
      }
    },
    [cancel, phase, run, today],
  )

  const rise = useCallback(async () => {
    const token = ++gen.current
    setToast(false)
    setPhase("rise")
    play("air", 0, true)
    try {
      running.current.push(animate(lift, 1, { duration: 0.4, ease: EASE_STRIKE }))
      await run(token, camProgress, 2, { duration: timingRef.current.rise, ease: EASE_IN_OUT })
      setPhase("done")
      requestAnimationFrame(() => nextBtn.current?.focus({ preventScroll: true }))
    } catch (error) {
      if (!(error instanceof StampAbort)) throw error
    }
  }, [play, run])

  const skipDone = useCallback(() => {
    cancel()
    camProgress.set(2)
    lift.set(1)
    stampZ.set(STAMP.HOVER)
    press.set(0)
    squash.set(0)
    sceneOpacity.set(1)
    setToast(false)
    setPhase("done")
    if (print) requestAnimationFrame(() => revealPrint([print3d.current, printFlat.current], "instant"))
  }, [cancel, print])

  const downloadPdf = useCallback(async () => {
    const node = sheet.current
    if (!node) return
    const iframe = document.createElement("iframe")
    iframe.setAttribute("aria-hidden", "true")
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden"
    document.body.appendChild(iframe)
    const doc = iframe.contentDocument
    const win = iframe.contentWindow
    if (!doc || !win) {
      iframe.remove()
      return
    }
    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((el) => el.outerHTML)
      .join("")
    const clone = node.cloneNode(true) as HTMLElement
    clone.style.zoom = String(793.7 / 420)
    clone.querySelectorAll<HTMLElement>(".stp-print").forEach((mark) => {
      mark.style.opacity = "1"
    })
    doc.open()
    doc.write(
      `<!doctype html><html><head><title>${invoice.id}</title>${styles}<style>@page{size:A4;margin:0}html,body{margin:0;background:#fff}</style></head><body>${clone.outerHTML}</body></html>`,
    )
    doc.close()
    try {
      await Promise.race([doc.fonts.ready, new Promise((resolve) => setTimeout(resolve, 1200))])
    } catch {
      /* ignore */
    }
    win.focus()
    win.print()
    window.setTimeout(() => iframe.remove(), 60_000)
  }, [invoice.id])

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0 || phase !== "set") return
    play("tap", 0)
    const state = { arm: 0, fire: 0, started: false, fired: false, cancelled: false }
    state.arm = window.setTimeout(() => {
      state.started = true
      setHolding(true)
    }, 250)
    state.fire = window.setTimeout(() => {
      state.fired = true
      setHolding(false)
      void stampNow({ quick: true, via: "hold", voided: true })
    }, 1500)
    hold.current = state
  }

  const onPointerUp = () => {
    const state = hold.current
    if (!state) return
    window.clearTimeout(state.arm)
    window.clearTimeout(state.fire)
    setHolding(false)
    if (state.started && !state.fired && !state.cancelled) state.cancelled = true
  }

  const onClick = (event: React.MouseEvent) => {
    const state = hold.current
    hold.current = null
    if (state && (state.started || state.fired)) return
    void stampNow({ quick: event.detail === 0, via: event.detail === 0 ? "keyboard" : "click" })
  }

  const onStageKey = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && phase === "set" && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault()
      void stampNow({ quick: true, via: "keyboard" })
    } else if (event.key === "Escape" && phase === "pov" && toast) {
      event.preventDefault()
      void rise()
    } else if (event.key === "Escape" && (phase === "tilt" || phase === "pov" || phase === "rise")) {
      event.preventDefault()
      skipDone()
    }
  }

  const changeDay = (index: number) => {
    setDate((prev) => {
      const next = { ...prev, d: index + 1 }
      next.d = Math.min(next.d, daysInMonth(next.y, next.m))
      return next
    })
  }
  const changeMonth = (index: number) => {
    setDate((prev) => {
      const next = { ...prev, m: index }
      next.d = Math.min(next.d, daysInMonth(next.y, next.m))
      return next
    })
  }
  const changeYear = (index: number) => {
    setDate((prev) => {
      const next = { ...prev, y: Number(years[index]) }
      next.d = Math.min(next.d, daysInMonth(next.y, next.m))
      return next
    })
  }

  const enabledDays = daysInMonth(date.y, date.m)
  const yearIndex = Math.max(0, years.indexOf(String(date.y)))
  const copy = STATUS_COPY[print?.status ?? status]
  const inkColor = INKS[print?.ink ?? ink].color
  const paperW = SHEET.w * SHEET.zoom
  const paperH = SHEET.h * SHEET.zoom
  const endScale = layout.end.f / (layout.end.dist * UNIT)
  const flat = {
    w: paperW * endScale,
    h: paperH * endScale,
    left: layout.end.cx - (paperW * endScale) / 2,
    top: layout.end.cy - (paperH * endScale) / 2,
    zoom: SHEET.zoom * endScale,
  }
  const pin = (top: number, extra?: React.CSSProperties): React.CSSProperties => ({
    ...(layout.name === "wide" ? { top } : null),
    ...extra,
  })

  const faces = (from: number, to: number, kind: "base" | "body") =>
    sides.map((side, i) => {
      const light = kind === "body" ? 52 + 16 * side.light : 22 + 10 * side.light
      const dark = kind === "body" ? 34 + 12 * side.light : 12 + 6 * side.light
      const sat = kind === "body" ? 58 : 48
      return (
        <div
          key={`${kind}-${i}`}
          className="stp-f"
          style={{
            width: side.len + 1,
            height: to - from + (kind === "body" ? 1 : 0),
            transform: `translate3d(${side.x}px, ${side.y}px, ${to}px) rotateZ(${side.deg}deg) translateX(-0.5px) rotateX(-90deg)`,
            background: `linear-gradient(180deg, hsl(214 ${sat}% ${light}%), hsl(216 ${sat + 4}% ${dark}%))`,
          }}
        />
      )
    })

  const loadLabel = loadingStatus(load, phase)
  const stageTransform =
    mode === "loading"
      ? `translate(-50%, -50%) scale(${scale})`
      : scale === 1
        ? undefined
        : `scale(${scale})`

  return (
    <div
      ref={root}
      className={["stp", layout.name === "tall" ? "is-tall" : "", phase === "done" ? "is-done" : "", mode === "loading" ? "is-loading" : ""].filter(Boolean).join(" ")}
      style={{
        height: mode === "loading" ? "100dvh" : layout.h * scale,
        ...(mode === "loading" ? { ["--product" as string]: BRAND.color } : null),
      }}
    >
      <div
        ref={stage}
        className="stp-stage"
        style={{
          width: layout.w,
          height: layout.h,
          transform: stageTransform,
          ["--ink" as string]: inkColor,
          ["--hit" as string]: `${(44 / scale).toFixed(1)}px`,
        }}
        tabIndex={0}
        onKeyDown={onStageKey}
      >
        <div ref={halo} className="stp-halo" style={{ left: layout.flat.cx, top: layout.flat.cy + 40 }} />
        <div ref={desk} className="stp-desk" />
        <div
          ref={scene}
          className="stp-scene"
          onPointerDown={() => {
            if (phase === "pov" && toast) void rise()
          }}
        >
          <div ref={view} className="stp-view">
            <div ref={cam} className="stp-cam">
              <div
                ref={paper}
                className="stp-paper"
                style={{
                  width: paperW,
                  height: paperH,
                  transform: `translate3d(${STAMP_HOME.x - PRINT_AT.x * SHEET.zoom}px, ${STAMP_HOME.y - PRINT_AT.y * SHEET.zoom}px, 0)`,
                }}
              >
                <InvoiceSheet print={print} printRef={print3d} sheetRef={sheet} idSuffix="3d" brand={mode === "loading"} />
              </div>
              <div ref={wideShadow} className="stp-shadow is-wide" style={{ width: STAMP.W, height: STAMP.D, borderRadius: STAMP.R }} />
              <div ref={softShadow} className="stp-shadow is-soft" style={{ width: STAMP.W, height: STAMP.D, borderRadius: STAMP.R }} />
              <div ref={contactShadow} className="stp-shadow is-contact" style={{ width: STAMP.W, height: STAMP.D, borderRadius: STAMP.R }} />
              <div ref={stamp} className={mode === "loading" ? "stp-stamp is-ornament" : "stp-stamp"}>
                <div
                  ref={glow}
                  className="stp-f stp-glow"
                  style={{
                    width: STAMP.W,
                    height: STAMP.D,
                    borderRadius: STAMP.R,
                    transform: `translate3d(${-STAMP.W / 2}px, ${-STAMP.D / 2}px, ${STAMP.H - 2}px)`,
                  }}
                />
                {faces(0, STAMP.BASE, "base")}
                {faces(STAMP.BASE, STAMP.H, "body")}
                <div
                  className={live && mode !== "loading" ? "stp-f stp-top is-live" : "stp-f stp-top"}
                  style={{
                    width: STAMP.W,
                    height: STAMP.D,
                    borderRadius: STAMP.R,
                    transform: `translate3d(${-STAMP.W / 2}px, ${-STAMP.D / 2}px, ${STAMP.H}px)`,
                  }}
                  {...({ inert: !live || mode === "loading" } as React.HTMLAttributes<HTMLDivElement>)}
                >
                  {mode === "loading" ? (
                    <div className="stp-ornament" aria-hidden="true">
                      <span className="stp-ornament-recess" />
                      <span className="stp-ornament-screw is-tl" />
                      <span className="stp-ornament-screw is-tr" />
                      <span className="stp-ornament-screw is-bl" />
                      <span className="stp-ornament-screw is-br" />
                    </div>
                  ) : (
                    <>
                      <div className="stp-engraved" aria-hidden="true">
                        {STATUS_COPY[status].word}
                      </div>
                      <div className="stp-inkdot" aria-hidden="true" style={{ ["--ink" as string]: INKS[ink].color }} />
                      <Wheel items={DAYS} index={date.d - 1} enabledCount={enabledDays} label="Day" valueText={String(date.d)} left={27} width={104} live={live} onChange={changeDay} onTick={() => play("tick")} />
                      <Wheel items={MONTHS_SHORT} index={date.m} enabledCount={12} label="Month" valueText={MONTHS_SHORT[date.m]} left={139} width={135} live={live} onChange={changeMonth} onTick={() => play("tick")} />
                      <Wheel items={years} index={yearIndex} enabledCount={years.length} label="Year" valueText={String(date.y)} left={282} width={104} live={live} onChange={changeYear} onTick={() => play("tick")} />
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div
            className="stp-flatpaper"
            aria-hidden="true"
            style={{ left: flat.left, top: flat.top, width: flat.w, height: flat.h }}
          >
            <InvoiceSheet print={print} printRef={printFlat} zoom={flat.zoom} idSuffix="flat" brand={mode === "loading"} />
          </div>
        </div>

        {mode !== "loading" ? (
        <div ref={uiSet} className="stp-ui stp-set" {...({ inert: phase !== "set" } as React.HTMLAttributes<HTMLDivElement>)}>
          <div className="stp-col">
            <div className="stp-eyebrow" style={pin(layout.set.eyebrow)}>
              {invoice.client} · {invoice.total}
            </div>
            <h3 className="stp-title" style={pin(layout.set.title)}>
              Invoice {invoice.id}
            </h3>
            <p className="stp-sub" style={pin(layout.set.sub)}>
              {STATUS_COPY[status].prompt} It's printed on the invoice and saved to its history.
            </p>
            <div className="stp-slot stp-face-slot" aria-hidden="true" />
            <div className="stp-date" style={pin(layout.set.date)}>
              {longDate(date)}
            </div>
            <div className="stp-controls" style={pin(layout.set.controls)}>
              <StatusSeg value={status} onChange={setStatus} tabbable={live} />
              <span className="stp-divider" />
              <div className="stp-swatches" role="radiogroup" aria-label="Ink">
                {INK_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={key === ink}
                    aria-label={INKS[key].name}
                    className="stp-sw"
                    style={{ ["--c" as string]: INKS[key].color }}
                    onClick={() => setInk(key)}
                  >
                    <span />
                  </button>
                ))}
              </div>
            </div>
            <div className="stp-btnrow" style={pin(layout.set.button)}>
              <button
                type="button"
                className={holding ? "stp-btn is-holding" : "stp-btn"}
                onPointerDown={onPointerDown}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
                onPointerCancel={onPointerUp}
                onContextMenu={(event) => event.preventDefault()}
                onClick={onClick}
              >
                <span className="stp-btn-fill" />
                <span className="stp-btn-label">{holding ? "Keep holding to void" : STATUS_COPY[status].button}</span>
              </button>
            </div>
            <div className="stp-hint" style={pin(layout.set.hint)}>
              or press Enter · hold to void
            </div>
          </div>
        </div>
        ) : null}

        {mode !== "loading" ? (
        <div className="stp-ui stp-end" {...({ inert: phase !== "done" } as React.HTMLAttributes<HTMLDivElement>)}>
          <div className="stp-col">
            <div className="stp-eyebrow" style={pin(layout.done.eyebrow, { ["--d" as string]: "0.2s" })}>
              {invoice.client} · {invoice.total}
            </div>
            <h3 className="stp-title" style={pin(layout.done.title, { ["--d" as string]: "0.04s" })}>
              Invoice {invoice.id}
            </h3>
            <div className="stp-status" style={pin(layout.done.status, { ["--d" as string]: "0.13s" })}>
              <i />
              <span>{print ? `${copy.done} ${layout.name === "tall" ? shortDate(print.date) : longDate(print.date)}` : ""}</span>
              <span aria-hidden="true">·</span>
              <button type="button" className="stp-link" onClick={() => void undo(false)}>
                Undo
              </button>
            </div>
            <div className="stp-slot stp-paper-slot" aria-hidden="true" />
            <div className="stp-btnrow" style={pin(layout.done.actions, { ["--d" as string]: "0.3s" })}>
              <button type="button" className="stp-btn is-quiet" onClick={() => void downloadPdf()}>
                Download PDF
              </button>
              <button ref={nextBtn} type="button" className="stp-btn" onClick={() => void undo(true)}>
                Next invoice
              </button>
            </div>
          </div>
        </div>
        ) : null}

        {mode !== "loading" ? (
        <div
          className={toast ? "stp-toast is-in" : "stp-toast"}
          style={{ top: layout.toast }}
          {...({ inert: !toast } as React.HTMLAttributes<HTMLDivElement>)}
          role="status"
        >
          <span className="stp-toast-dot" style={{ ["--i" as string]: 0 }} />
          <span className="stp-toast-text" style={{ ["--i" as string]: 1 }}>
            {print ? (layout.name === "tall" ? copy.toast : `${copy.toast} · ${shortDate(print.date)}`) : ""}
          </span>
          <button
            type="button"
            className="stp-btn is-quiet"
            style={{ ["--i" as string]: 2 }}
            onPointerDown={() => play("tap", 0, -25)}
            onClick={() => void undo(false)}
          >
            Undo
          </button>
          <button
            type="button"
            className="stp-btn"
            style={{ ["--i" as string]: 3 }}
            onPointerDown={() => play("tap", 0, -25)}
            onClick={() => void rise()}
          >
            Done
          </button>
        </div>
        ) : null}
        <p className="stp-sr" aria-live="polite">
          {phase === "done" && print && mode !== "loading"
            ? `${copy.done} ${longDate(print.date)}`
            : mode === "loading"
              ? loadLabel
              : ""}
        </p>
      </div>
      {mode === "loading" ? (
        <>
          <div className="stp-boot">
            <p className="stp-boot-mark">BMI TAG</p>
            <p className="stp-boot-sub">Gestão de equipamentos</p>
          </div>
          <div className={phase === "done" ? "stp-hud is-complete" : "stp-hud"}>
            <p className="stp-hud-status">{loadLabel}</p>
            <div className="stp-hud-row">
              <div
                className="stp-load-track"
                role="progressbar"
                aria-label={loadLabel}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(load * 100)}
              >
                <div className="stp-load-fill" style={{ transform: `scaleX(${load})` }} />
              </div>
              <span className="stp-load-pct">{Math.round(load * 100)}%</span>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
