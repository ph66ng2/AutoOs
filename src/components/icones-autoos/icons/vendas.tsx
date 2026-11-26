import { createIcon } from "../create-icon"

/** Vendas de insumos */
export const VendasIcon = createIcon("VendasIcon", () => (
  <>
    <path d="M6 8h12l1.2 11a1.5 1.5 0 0 1-1.5 1.7H6.3a1.5 1.5 0 0 1-1.5-1.7z" stroke="none" style={{ fill: "var(--aic-body, currentColor)", fillOpacity: "var(--aic-body-opacity, 0.28)" }} />
    <path d="M6 8h12l1.2 11a1.5 1.5 0 0 1-1.5 1.7H6.3a1.5 1.5 0 0 1-1.5-1.7z" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--aic-line, currentColor)", strokeOpacity: "var(--aic-line-opacity, 1)" }} />
    <path d="M9 11V7a3 3 0 0 1 6 0v4" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--aic-line, currentColor)", strokeOpacity: "var(--aic-line-opacity, 1)" }} />
  </>
))

export default VendasIcon
