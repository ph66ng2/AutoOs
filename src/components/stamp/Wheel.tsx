import { animate, motionValue, type AnimationPlaybackControls } from "motion"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react"
import type React from "react"

const ROW = 34

type WheelProps = {
  items: readonly string[]
  index: number
  enabledCount: number
  label: string
  valueText: string
  left: number
  width: number
  live: boolean
  onChange: (index: number) => void
  onTick: () => void
}

export function Wheel({
  items,
  index,
  enabledCount,
  label,
  valueText,
  left,
  width,
  live,
  onChange,
  onTick,
}: WheelProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const strip = useRef<HTMLDivElement>(null)
  const rows = useRef<(HTMLDivElement | null)[]>([])
  const offset = useMemo(() => motionValue(index * ROW), [])
  const spring = useRef<AnimationPlaybackControls | null>(null)
  const drag = useRef<{ pointer: number; start: number; at: number; last: number; lastAt: number } | null>(null)
  const wheelTimer = useRef(0)
  const shown = useRef(index)
  const target = useRef(index)
  const snapToRef = useRef<(next: number, velocity?: number) => void>(() => {})
  const api = useRef({ index, enabledCount, onChange, onTick })
  const max = (items.length - 1) * ROW
  useEffect(() => {
    api.current = { index, enabledCount, onChange, onTick }
  }, [index, enabledCount, onChange, onTick])

  const paint = useCallback((value: number) => {
    const el = strip.current
    if (el) el.style.transform = `translateY(${-value}px)`
    for (let i = 0; i < rows.current.length; i++) {
      const row = rows.current[i]
      if (!row) continue
      const dist = Math.abs((i * ROW - value) / ROW)
      if (dist > 3.2) continue
      row.style.opacity = String(Math.max(0.2, 1 - dist * 0.13))
      const blur = Math.min(2.6, Math.max(0, dist - 0.55) * 1.05)
      row.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "none"
    }
    const nearest = Math.round(value / ROW)
    if (nearest !== shown.current) {
      shown.current = nearest
      api.current.onTick()
    }
  }, [])

  useLayoutEffect(() => {
    paint(offset.get())
    return offset.on("change", paint)
  }, [offset, paint])

  const snapTo = useCallback(
    (next: number, velocity = 0) => {
      const clamped = Math.max(0, Math.min(items.length - 1, next))
      target.current = clamped
      spring.current?.stop()
      spring.current = animate(offset, clamped * ROW, {
        type: "spring",
        stiffness: 260,
        damping: 30,
        velocity,
        onComplete: () => {
          spring.current = null
          const { index: current, enabledCount: enabled, onChange: change } = api.current
          if (clamped > enabled - 1) {
            snapToRef.current(enabled - 1)
            return
          }
          if (clamped !== current) change(clamped)
        },
      })
    },
    [items.length, offset],
  )

  useEffect(() => {
    snapToRef.current = snapTo
  }, [snapTo])

  useEffect(() => {
    if (drag.current || spring.current) return
    const now = Math.round(offset.get() / ROW)
    if (now !== index) {
      if (Math.abs(now - index) > 6) {
        shown.current = index
        offset.set(index * ROW)
      } else {
        snapTo(index)
      }
    }
  }, [index, snapTo])

  useEffect(
    () => () => {
      spring.current?.stop()
      window.clearTimeout(wheelTimer.current)
    },
    [],
  )

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      if (!live) return
      event.preventDefault()
      window.clearTimeout(wheelTimer.current)
      if (Math.abs(event.deltaY) >= 50 && Number.isInteger(event.deltaY)) {
        const from = spring.current ? target.current : Math.round(offset.get() / ROW)
        snapTo(from + Math.sign(event.deltaY))
        return
      }
      spring.current?.stop()
      spring.current = null
      const next = offset.get() + event.deltaY * 0.7
      offset.set(next < 0 ? next * 0.5 : next > max ? max + (next - max) * 0.5 : next)
      wheelTimer.current = window.setTimeout(() => snapTo(Math.round(offset.get() / ROW)), 90)
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [live, max, snapTo])

  const onPointerDown = (event: React.PointerEvent) => {
    if (!live || event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    spring.current?.stop()
    spring.current = null
    const y = offset.get()
    drag.current = { pointer: event.pointerId, start: event.clientY, at: y, last: event.clientY, lastAt: performance.now() }
  }

  const onPointerMove = (event: React.PointerEvent) => {
    const state = drag.current
    if (!state || state.pointer !== event.pointerId) return
    const delta = state.start - event.clientY
    const next = state.at + delta
    offset.set(next < 0 ? next * 0.5 : next > max ? max + (next - max) * 0.5 : next)
    state.last = event.clientY
    state.lastAt = performance.now()
  }

  const endDrag = (event: React.PointerEvent) => {
    const state = drag.current
    if (!state || state.pointer !== event.pointerId) return
    drag.current = null
    const elapsed = Math.max(16, performance.now() - state.lastAt)
    const velocity = ((state.start - event.clientY - (offset.get() - state.at === 0 ? 0 : 0)) / elapsed) * -1000
    const pxPerMs = (state.last - event.clientY) / elapsed
    const springVel = -pxPerMs * 1000
    snapTo(Math.round(offset.get() / ROW), Number.isFinite(springVel) ? springVel : velocity)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!live) return
    const map: Record<string, number> = {
      ArrowUp: -1,
      ArrowDown: 1,
      PageUp: -5,
      PageDown: 5,
    }
    if (event.key in map) {
      event.preventDefault()
      snapTo((spring.current ? target.current : Math.round(offset.get() / ROW)) + map[event.key])
    } else if (event.key === "Home") {
      event.preventDefault()
      snapTo(0)
    } else if (event.key === "End") {
      event.preventDefault()
      snapTo(enabledCount - 1)
    }
  }

  return (
    <>
      <div className="stp-wheel" style={{ left, width }}>
        <div className="stp-lens" />
        <div
          ref={scroller}
          className="stp-scroll"
          role="spinbutton"
          tabIndex={live ? 0 : -1}
          aria-label={label}
          aria-valuemin={1}
          aria-valuemax={enabledCount}
          aria-valuenow={index + 1}
          aria-valuetext={valueText}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div ref={strip} className="stp-strip">
            {items.map((item, i) => (
              <div
                key={item}
                ref={(node) => {
                  rows.current[i] = node
                }}
                className={i >= enabledCount ? "stp-row is-off" : "stp-row"}
                aria-hidden="true"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="stp-cap" style={{ left, width }} aria-hidden="true">
        {label.toUpperCase()}
      </div>
    </>
  )
}

export function StatusSeg({
  value,
  onChange,
  tabbable,
}: {
  value: string
  onChange: (key: "paid" | "received" | "approved" | "due") => void
  tabbable: boolean
}) {
  const root = useRef<HTMLDivElement>(null)
  const keys = ["paid", "received", "approved", "due"] as const
  const labels = { paid: "Paid", received: "Received", approved: "Approved", due: "Due" }
  const thumb = useRef<HTMLSpanElement>(null)
  const armed = useRef(false)

  useLayoutEffect(() => {
    const selected = root.current?.querySelector<HTMLElement>('[aria-checked="true"]')
    const mark = thumb.current
    if (!selected || !mark) return
    mark.style.transform = `translateX(${selected.offsetLeft}px)`
    mark.style.width = `${selected.offsetWidth}px`
    mark.style.opacity = "1"
    if (!armed.current) {
      requestAnimationFrame(() => mark.classList.add("is-armed"))
      armed.current = true
    }
  }, [value])

  return (
    <div
      ref={root}
      className="stp-seg"
      role="radiogroup"
      aria-label="Status"
      onKeyDown={(event) => {
        const dir = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0
        if (!dir) return
        event.preventDefault()
        const next = keys[(keys.indexOf(value as (typeof keys)[number]) + dir + keys.length) % keys.length]
        onChange(next)
        root.current?.querySelector<HTMLButtonElement>(`[data-key="${next}"]`)?.focus()
      }}
    >
      <span ref={thumb} className="stp-seg-thumb" style={{ opacity: 0 }} />
      {keys.map((key) => (
        <button
          key={key}
          type="button"
          role="radio"
          data-key={key}
          aria-checked={key === value}
          tabIndex={tabbable && key === value ? 0 : -1}
          onClick={() => onChange(key)}
        >
          {labels[key]}
        </button>
      ))}
    </div>
  )
}
