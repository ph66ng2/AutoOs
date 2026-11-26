import { createIcon } from "../create-icon"

/** Serviços */
export const ServicosIcon = createIcon("ServicosIcon", () => (
  <>
    <circle cx="15.5" cy="8.5" r="4.5" stroke="none" style={{ fill: "var(--aic-body, currentColor)", fillOpacity: "var(--aic-body-opacity, 0.28)" }} />
    <path d="M16.82 4.2L15.26 5.76L18.24 8.74L19.8 7.18A4.5 4.5 0 1 1 16.82 4.2" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--aic-line, currentColor)", strokeOpacity: "var(--aic-line-opacity, 1)" }} />
    <line x1="12.32" y1="11.68" x2="6.2" y2="17.8" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--aic-line, currentColor)", strokeOpacity: "var(--aic-line-opacity, 1)" }} />
    <circle cx="5.2" cy="18.8" r="1.4" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--aic-line, currentColor)", strokeOpacity: "var(--aic-line-opacity, 1)" }} />
  </>
))

export default ServicosIcon
