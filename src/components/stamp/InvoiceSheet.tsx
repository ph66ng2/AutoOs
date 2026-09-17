import type React from "react"
import type { PrintMark } from "./constants"
import { INKS, LABEL, MONTHS_SHORT, STATUS_COPY } from "./constants"

export function StampPrint({
  data,
  printRef,
  idSuffix,
  brand,
}: {
  data: PrintMark
  printRef?: React.Ref<HTMLElement>
  idSuffix: string
  brand?: boolean
}) {
  const pos = {
    left: `calc(50% + ${data.dx}px)`,
    top: `calc(50% + ${data.dy}px)`,
    rotate: `${data.rot}deg`,
    opacity: 0,
  }

  if (brand) {
    return (
      <img
        ref={printRef as React.Ref<HTMLImageElement>}
        className="stp-print stp-print-brand"
        src="/bmi-tag-logo.png"
        alt=""
        width="248"
        height="198"
        draggable={false}
        style={pos}
      />
    )
  }

  const filterId = `stp-ink-${data.seed}-${idSuffix}`
  const voided = data.status === "void"
  const top = voided ? `${data.date.d} ${MONTHS_SHORT[data.date.m]} ${data.date.y}` : STATUS_COPY[data.status].word
  const bottom = voided ? "VOID" : `${data.date.d} ${MONTHS_SHORT[data.date.m]} ${data.date.y}`

  return (
    <svg
      ref={printRef as React.Ref<SVGSVGElement>}
      className="stp-print"
      width="172"
      height="82"
      viewBox="0 0 172 82"
      aria-hidden="true"
      style={{ ...pos, color: INKS[data.ink].color }}
    >
      <defs>
        <filter id={filterId} x="-4%" y="-8%" width="108%" height="116%">
          <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed={data.seed} result="grain" />
          <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -7 0 0 0 5.15" result="speck" />
          <feComposite in="SourceGraphic" in2="speck" operator="in" result="inked" />
          <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed={data.seed + 11} result="wander" />
          <feDisplacementMap in="inked" in2="wander" scale="2.4" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <g filter={`url(#${filterId})`} opacity="0.9">
        <rect x="3" y="3" width="166" height="76" rx="9" fill="none" stroke="currentColor" strokeWidth="2.6" />
        <rect x="8.5" y="8.5" width="155" height="65" rx="5.5" fill="none" stroke="currentColor" strokeWidth="1.1" />
        <text
          x="86"
          y="24.5"
          textAnchor="middle"
          fill="currentColor"
          fontFamily="'Barlow Condensed', Inter, sans-serif"
          fontWeight="600"
          fontSize="8.5"
          letterSpacing="3.2"
        >
          {top}
        </text>
        <text
          x="86"
          y="60.5"
          textAnchor="middle"
          fill="currentColor"
          fontFamily="'Barlow Condensed', Inter, sans-serif"
          fontWeight="700"
          fontSize={voided ? 36 : 31}
          letterSpacing={voided ? 4 : 0.6}
        >
          {bottom}
        </text>
      </g>
    </svg>
  )
}

export function InvoiceSheet({
  print,
  printRef,
  sheetRef,
  zoom,
  idSuffix,
  brand,
}: {
  print: PrintMark | null
  printRef?: React.Ref<HTMLElement>
  sheetRef?: React.Ref<HTMLDivElement>
  zoom?: number
  idSuffix: string
  brand?: boolean
}) {
  return (
    <div className="stp-sheet stp-label-sheet" ref={sheetRef} style={zoom ? { zoom } : undefined}>
      <div className="stp-label-web" aria-hidden="true">
        {Array.from({ length: LABEL.units }, (_, i) => (
          <div className="stp-label-unit" key={i}>
            <div className="stp-label-mark" />
            <div className="stp-label-face" />
          </div>
        ))}
      </div>
      {print ? <StampPrint data={print} printRef={printRef} idSuffix={idSuffix} brand={brand} /> : null}
    </div>
  )
}
