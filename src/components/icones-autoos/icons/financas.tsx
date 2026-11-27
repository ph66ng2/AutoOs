import { createIcon } from "../create-icon"

/** Finanças (cédula) */
export const FinancasIcon = createIcon("FinancasIcon", () => (
  <>
    <rect x="2.1" y="5.4" width="19.8" height="13.2" rx="2.75" stroke="none" style={{ fill: "var(--aic-body, currentColor)", fillOpacity: "var(--aic-body-opacity, 0.28)" }} />
    <rect x="2.1" y="5.4" width="19.8" height="13.2" rx="2.75" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--aic-line, currentColor)", strokeOpacity: "var(--aic-line-opacity, 1)" }} />
    <circle cx="12" cy="12" r="2.75" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--aic-line, currentColor)", strokeOpacity: "var(--aic-line-opacity, 1)" }} />
    <circle cx="6.225" cy="8.975" r="0.99" stroke="none" style={{ fill: "var(--aic-line, currentColor)", fillOpacity: "var(--aic-line-opacity, 1)" }} />
    <circle cx="17.775" cy="15.025" r="0.99" stroke="none" style={{ fill: "var(--aic-line, currentColor)", fillOpacity: "var(--aic-line-opacity, 1)" }} />
  </>
))

export default FinancasIcon
