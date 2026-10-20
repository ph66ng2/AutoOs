import type { TourKind } from "@/lib/tour-steps";

/**
 * Pedido de tour vindo de fora do roteador (primeiro acesso, Perfil › Tutorial, novidades).
 * Fica guardado até o `TourController` conseguir mostrar o tour: se o layout desmontar antes
 * (por exemplo, a pessoa escolhe o Modo Balcão), o pedido continua pendente e vale quando
 * o layout completo voltar.
 */
const TOUR_EVENT = "autoos:tour";
let pending: TourKind | null = null;

export function requestTour(kind: TourKind) {
  pending = kind;
  window.dispatchEvent(new CustomEvent(TOUR_EVENT));
}

export function peekTourRequest(): TourKind | null {
  return pending;
}

export function takeTourRequest(): TourKind | null {
  const kind = pending;
  pending = null;
  return kind;
}

export function clearTourRequest() {
  pending = null;
}

export function onTourRequest(listener: () => void) {
  window.addEventListener(TOUR_EVENT, listener);
  return () => window.removeEventListener(TOUR_EVENT, listener);
}
