import { createIcon } from "../create-icon"

/** Finanças (cédula) */
export const FinancasIcon = createIcon("FinancasIcon", () => (
  <>
    <rect x="3" y="6" width="18" height="12" rx="2.5" stroke="none" style={{ fill: "var(--aic-body, currentColor)", fillOpacity: "var(--aic-body-opacity, 0.28)" }} />
    <rect x="3" y="6" width="18" height="12" rx="2.5" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--aic-line, currentColor)", strokeOpacity: "var(--aic-line-opacity, 1)" }} />
    <circle cx="12" cy="12" r="2.5" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--aic-line, currentColor)", strokeOpacity: "var(--aic-line-opacity, 1)" }} />
    <circle cx="6.75" cy="9.25" r="0.9" stroke="none" style={{ fill: "var(--aic-line, currentColor)", fillOpacity: "var(--aic-line-opacity, 1)" }} />
    <circle cx="17.25" cy="14.75" r="0.9" stroke="none" style={{ fill: "var(--aic-line, currentColor)", fillOpacity: "var(--aic-line-opacity, 1)" }} />
  </>
))

export default FinancasIcon
