import { createIcon } from "../create-icon"

/** Equipamentos */
export const EquipamentosIcon = createIcon("EquipamentosIcon", () => (
  <>
    <rect x="5.4" y="5.4" width="13.2" height="13.2" rx="2.75" stroke="none" style={{ fill: "var(--aic-body, currentColor)", fillOpacity: "var(--aic-body-opacity, 0.28)" }} />
    <rect x="5.4" y="5.4" width="13.2" height="13.2" rx="2.75" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--aic-line, currentColor)", strokeOpacity: "var(--aic-line-opacity, 1)" }} />
    <rect x="9.25" y="9.25" width="5.5" height="5.5" rx="1.1" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--aic-line, currentColor)", strokeOpacity: "var(--aic-line-opacity, 1)" }} />
    <path d="M 9.25 2.1 v 3.3 M 14.75 2.1 v 3.3 M 9.25 18.6 v 3.3 M 14.75 18.6 v 3.3 M 2.1 9.25 h 3.3 M 2.1 14.75 h 3.3 M 18.6 9.25 h 3.3 M 18.6 14.75 h 3.3" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--aic-line, currentColor)", strokeOpacity: "var(--aic-line-opacity, 1)" }} />
  </>
))

export default EquipamentosIcon
