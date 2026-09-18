export const UNIT = 48

export const STAMP = {
  W: 8.6 * UNIT,
  D: 5.1 * UNIT,
  R: 1.25 * UNIT,
  BASE: 0.6 * UNIT,
  H: 5.2 * UNIT,
  HOVER: 8 * UNIT,
}

export const STAMP_HOME = { x: 3.5 * UNIT, y: 6.9 * UNIT }
export const STAMP_REST = {
  x: STAMP_HOME.x + 16.4 * UNIT,
  y: STAMP_HOME.y,
  z: 0.42 * UNIT,
}

export const LABEL = {
  w: 400,
  pitch: 280,
  mark: 13,
  insetX: 11,
  insetY: 8,
  units: 10,
  lead: 3,
}

export const SHEET = { w: LABEL.w, h: 680, zoom: 2.22 }
export const PRINT_AT = { x: LABEL.w / 2, y: SHEET.h / 2 }
export const LABEL_MID = LABEL.mark + LABEL.insetY + (LABEL.pitch - LABEL.mark - LABEL.insetY * 2) / 2
export const LABEL_ALIGN = PRINT_AT.y - LABEL_MID - LABEL.lead * LABEL.pitch
export const PAPER_ORIGIN_X = STAMP_HOME.x - PRINT_AT.x * SHEET.zoom
export const LOADING_FOCUS = {
  x: (PAPER_ORIGIN_X + STAMP_REST.x + STAMP.W / 2) / 2,
  y: STAMP_HOME.y,
}
export const BRAND = { color: "#2b6ce8" }

export const TIMING = {
  tilt: 0.8,
  press: 0.15,
  bounce: 0.3,
  liftAway: 0.42,
  rise: 0.7,
}

export type TimingKey = keyof typeof TIMING
export type Timing = typeof TIMING

export const TIMING_DIALS: {
  key: TimingKey
  label: string
  min: number
  max: number
  step: number
  text: (value: number) => string
  tip: string
}[] = [
  {
    key: "tilt",
    label: "Camera tilt",
    min: 0.4,
    max: 1.6,
    step: 0.05,
    text: (v) => `${v.toFixed(2)}s`,
    tip: "How long the camera takes to tilt down to the desk. Double-click any dial to reset it.",
  },
  {
    key: "press",
    label: "Press",
    min: 0.06,
    max: 0.4,
    step: 0.01,
    text: (v) => `${v.toFixed(2)}s`,
    tip: "How fast the stamp comes down onto the paper. Lower hits harder.",
  },
  {
    key: "bounce",
    label: "Bounce",
    min: 0,
    max: 0.6,
    step: 0.05,
    text: (v) => `${Math.round(v * 100)}%`,
    tip: "How much the stamp springs as it lifts off the paper. 0 is no bounce.",
  },
  {
    key: "liftAway",
    label: "Lift away",
    min: 0.2,
    max: 1,
    step: 0.02,
    text: (v) => `${v.toFixed(2)}s`,
    tip: "How long the stamp takes to lift up and out of view after the bounce.",
  },
  {
    key: "rise",
    label: "Camera rise",
    min: 0.35,
    max: 1.5,
    step: 0.05,
    text: (v) => `${v.toFixed(2)}s`,
    tip: "How long the camera takes to rise to the finished invoice.",
  },
]

export const EASE_IN_OUT: [number, number, number, number] = [0.37, 0, 0.63, 1]
export const EASE_WINDUP: [number, number, number, number] = [0.61, 1, 0.88, 1]
export const EASE_STRIKE: [number, number, number, number] = [0.32, 0, 0.67, 0]
export const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1]

export const PRESS_WINDUP = 1.33
export const BOUNCE_WAIT = 300
export const TOAST_AT = 0.62

export const MONTHS_SHORT = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const

export const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1))

export type Status = "paid" | "received" | "approved" | "due" | "void"
export type LiveStatus = Exclude<Status, "void">
export type Ink = "red" | "blue" | "green" | "violet" | "graphite"
export type CameraMode = "cinematic" | "auto" | "quick"

export const LIVE_STATUSES: LiveStatus[] = ["paid", "received", "approved", "due"]

export const STATUS_COPY: Record<
  Status,
  {
    label: string
    word: string
    button: string
    toast: string
    done: string
    prompt: string
  }
> = {
  paid: {
    label: "Paid",
    word: "PAID",
    button: "Mark as paid",
    toast: "Marked as paid",
    done: "Marked as paid on",
    prompt: "Choose the payment date.",
  },
  received: {
    label: "Received",
    word: "RECEIVED",
    button: "Mark as received",
    toast: "Marked as received",
    done: "Marked as received on",
    prompt: "Choose the date it arrived.",
  },
  approved: {
    label: "Approved",
    word: "APPROVED",
    button: "Approve",
    toast: "Approved",
    done: "Approved on",
    prompt: "Choose the approval date.",
  },
  due: {
    label: "Due",
    word: "DUE",
    button: "Set due date",
    toast: "Due date set",
    done: "Due on",
    prompt: "Choose the date it falls due.",
  },
  void: {
    label: "Void",
    word: "VOID",
    button: "Void",
    toast: "Voided",
    done: "Voided on",
    prompt: "",
  },
}

export const INKS: Record<Ink, { name: string; color: string }> = {
  red: { name: "Red ink", color: "#d8342b" },
  blue: { name: "Blue ink", color: "#2463d6" },
  green: { name: "Green ink", color: "#1f8a4c" },
  violet: { name: "Violet ink", color: "#7650dc" },
  graphite: { name: "Graphite ink", color: "#3a3a3c" },
}

export const INK_KEYS = Object.keys(INKS) as Ink[]

export type StampDate = { y: number; m: number; d: number }

export function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate()
}

export function toDate(date: StampDate) {
  return new Date(date.y, date.m, date.d)
}

export function longDate(date: StampDate) {
  return `${WEEKDAYS[toDate(date).getDay()]}, ${date.d} ${MONTHS[date.m]} ${date.y}`
}

export function shortDate(date: StampDate) {
  return `${date.d} ${MONTHS[date.m].slice(0, 3)} ${date.y}`
}

export function yearsAround(year: number) {
  return Array.from({ length: 11 }, (_, i) => String(year - 5 + i))
}

export type Invoice = {
  id: string
  client: string
  total: string
  issued: string
  due: string
  lines: { description: string; quantity: string; unitPrice: string; total: string }[]
}

export const INVOICES: Invoice[] = [
  {
    id: "FUI-0067",
    client: "Northwind Pty Ltd",
    total: "$1,572.50",
    issued: "01/09/2026",
    due: "15/09/2026",
    lines: [
      { description: "Component design", quantity: "12.00", unitPrice: "$85/hour", total: "$1,020.00" },
      { description: "Motion prototypes", quantity: "4.50", unitPrice: "$85/hour", total: "$382.50" },
      { description: "Figma handoff", quantity: "2.00", unitPrice: "$85/hour", total: "$170.00" },
    ],
  },
  {
    id: "FUI-0068",
    client: "Harbour & Pine",
    total: "$1,190.00",
    issued: "03/09/2026",
    due: "17/09/2026",
    lines: [
      { description: "Brand refresh", quantity: "8.00", unitPrice: "$85/hour", total: "$680.00" },
      { description: "Icon set", quantity: "6.00", unitPrice: "$85/hour", total: "$510.00" },
    ],
  },
  {
    id: "FUI-0069",
    client: "Lumen Coffee Co",
    total: "$935.00",
    issued: "05/09/2026",
    due: "19/09/2026",
    lines: [
      { description: "Menu board layout", quantity: "5.00", unitPrice: "$85/hour", total: "$425.00" },
      { description: "Loyalty card", quantity: "6.00", unitPrice: "$85/hour", total: "$510.00" },
    ],
  },
]

export type Pose = {
  f: number
  dist: number
  rx: number
  tx: number
  ty: number
  tz: number
  cx: number
  cy: number
}

export type Layout = {
  name: "wide" | "tall"
  w: number
  h: number
  flat: Pose
  pov: Pose
  end: Pose
  set: Record<string, number>
  done: Record<string, number>
  toast: number
}

const HOVER_Z = STAMP.HOVER + STAMP.H

export const WIDE: Layout = {
  name: "wide",
  w: 960,
  h: 720,
  flat: {
    f: 8933,
    dist: 8933 / UNIT,
    rx: 0,
    tx: STAMP_HOME.x,
    ty: STAMP_HOME.y,
    tz: HOVER_Z,
    cx: 480,
    cy: 329,
  },
  pov: {
    f: 1067,
    dist: 48,
    rx: 40,
    tx: 1.6 * UNIT,
    ty: 3 * UNIT,
    tz: 0,
    cx: 480,
    cy: 405,
  },
  end: {
    f: 2967,
    dist: 2967 / (0.348 * UNIT),
    rx: 0,
    tx: 0,
    ty: 0,
    tz: 0,
    cx: 480,
    cy: 382,
  },
  set: { eyebrow: 83, title: 110, sub: 141, date: 497, controls: 546, button: 606, hint: 646 },
  done: { eyebrow: 44, title: 71, status: 101, actions: 670 },
  toast: 662,
}

export const LOADING: Layout = {
  name: "wide",
  w: 960,
  h: 720,
  flat: {
    f: 1260,
    dist: 72,
    rx: 22,
    tx: LOADING_FOCUS.x,
    ty: LOADING_FOCUS.y,
    tz: 0,
    cx: 480,
    cy: 400,
  },
  pov: {
    f: 1260,
    dist: 72,
    rx: 22,
    tx: LOADING_FOCUS.x,
    ty: LOADING_FOCUS.y,
    tz: 0,
    cx: 480,
    cy: 400,
  },
  end: {
    f: 1480,
    dist: 56,
    rx: 12,
    tx: STAMP_HOME.x,
    ty: STAMP_HOME.y,
    tz: 0,
    cx: 480,
    cy: 372,
  },
  set: WIDE.set,
  done: WIDE.done,
  toast: WIDE.toast,
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export function clamp(n: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, n))
}

export function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

export function mixPose(a: Pose, b: Pose, t: number): Pose {
  return {
    f: lerp(a.f, b.f, t),
    dist: lerp(a.dist, b.dist, t),
    rx: lerp(a.rx, b.rx, t),
    tx: lerp(a.tx, b.tx, t),
    ty: lerp(a.ty, b.ty, t),
    tz: lerp(a.tz, b.tz, t),
    cx: lerp(a.cx, b.cx, t),
    cy: lerp(a.cy, b.cy, t),
  }
}

export function poseAt(layout: Layout, progress: number) {
  return progress <= 1
    ? mixPose(layout.flat, layout.pov, progress)
    : mixPose(layout.pov, layout.end, Math.min(1, progress - 1))
}

export type PrintMark = {
  status: Status
  date: StampDate
  ink: Ink
  seed: number
  rot: number
  dx: number
  dy: number
}
