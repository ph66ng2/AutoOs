import type { TourKind } from "@/lib/tour-steps";

/**
 * Pedido de tour vindo de fora do roteador (primeiro acesso, Perfil › Tutorial).
 * Fica guardado até o `TourController` do layout principal estar montado,
 * por exemplo quando a pessoa escolhe o modo de uso antes de ver o sistema.
 */
const TOUR_EVENT = "autoos:tour";
let pending: TourKind | null = null;

export function requestTour(kind: TourKind) {
  pending = kind;
  window.dispatchEvent(new CustomEvent(TOUR_EVENT));
}

export function takeTourRequest(): TourKind | null {
  const kind = pending;
  pending = null;
  return kind;
}

export function onTourRequest(listener: () => void) {
  window.addEventListener(TOUR_EVENT, listener);
  return () => window.removeEventListener(TOUR_EVENT, listener);
}
