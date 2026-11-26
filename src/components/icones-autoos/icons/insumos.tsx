import { createIcon } from "../create-icon"

/** Insumos e peças (estoque) */
export const InsumosIcon = createIcon("InsumosIcon", () => (
  <>
    <rect x="3" y="13" width="8" height="8" rx="1.5" stroke="none" style={{ fill: "var(--aic-body, currentColor)", fillOpacity: "var(--aic-body-opacity, 0.28)" }} />
    <rect x="13" y="13" width="8" height="8" rx="1.5" stroke="none" style={{ fill: "var(--aic-body, currentColor)", fillOpacity: "var(--aic-body-opacity, 0.28)" }} />
    <rect x="8" y="3.5" width="8" height="8" rx="1.5" stroke="none" style={{ fill: "var(--aic-body, currentColor)", fillOpacity: "var(--aic-body-opacity, 0.28)" }} />
    <rect x="3" y="13" width="8" height="8" rx="1.5" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--aic-line, currentColor)", strokeOpacity: "var(--aic-line-opacity, 1)" }} />
    <rect x="13" y="13" width="8" height="8" rx="1.5" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--aic-line, currentColor)", strokeOpacity: "var(--aic-line-opacity, 1)" }} />
    <rect x="8" y="3.5" width="8" height="8" rx="1.5" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--aic-line, currentColor)", strokeOpacity: "var(--aic-line-opacity, 1)" }} />
    <path d="M7 13v2.5M17 13v2.5M12 3.5V6" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--aic-line, currentColor)", strokeOpacity: "var(--aic-line-opacity, 1)" }} />
  </>
))

export default InsumosIcon
