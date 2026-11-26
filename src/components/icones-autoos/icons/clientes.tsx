import { createIcon } from "../create-icon"

/** Clientes */
export const ClientesIcon = createIcon("ClientesIcon", () => (
  <>
    <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="none" style={{ fill: "var(--aic-body, currentColor)", fillOpacity: "var(--aic-body-opacity, 0.28)" }} />
    <rect x="3" y="5" width="18" height="14" rx="2.5" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--aic-line, currentColor)", strokeOpacity: "var(--aic-line-opacity, 1)" }} />
    <circle cx="8.5" cy="10.5" r="2" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--aic-line, currentColor)", strokeOpacity: "var(--aic-line-opacity, 1)" }} />
    <path d="M5.5 16a3 3 0 0 1 6 0" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--aic-line, currentColor)", strokeOpacity: "var(--aic-line-opacity, 1)" }} />
    <path d="M14.5 10h3.5M14.5 14h3.5" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--aic-line, currentColor)", strokeOpacity: "var(--aic-line-opacity, 1)" }} />
  </>
))

export default ClientesIcon
