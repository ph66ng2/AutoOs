import { createIcon } from "../create-icon"

/** Suporte (fone) */
export const SuporteIcon = createIcon("SuporteIcon", () => (
  <>
    <rect x="3" y="12" width="4" height="6" rx="1.5" stroke="none" style={{ fill: "var(--aic-body, currentColor)", fillOpacity: "var(--aic-body-opacity, 0.28)" }} />
    <rect x="17" y="12" width="4" height="6" rx="1.5" stroke="none" style={{ fill: "var(--aic-body, currentColor)", fillOpacity: "var(--aic-body-opacity, 0.28)" }} />
    <path d="M4 13v-1a8 8 0 0 1 16 0v1" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--aic-line, currentColor)", strokeOpacity: "var(--aic-line-opacity, 1)" }} />
    <rect x="3" y="12" width="4" height="6" rx="1.5" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--aic-line, currentColor)", strokeOpacity: "var(--aic-line-opacity, 1)" }} />
    <rect x="17" y="12" width="4" height="6" rx="1.5" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--aic-line, currentColor)", strokeOpacity: "var(--aic-line-opacity, 1)" }} />
    <path d="M19 18c0 1.7-1.6 3-4 3h-2" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--aic-line, currentColor)", strokeOpacity: "var(--aic-line-opacity, 1)" }} />
  </>
))

export default SuporteIcon
