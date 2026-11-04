/** Intervalo de polling: normal quando saudável; dobra a cada falha seguida, com teto. */
export function nextPollDelay(
  failures: number,
  healthyMs: number,
  unavailableMs: number,
  maxMs = 5 * 60_000,
): number {
  if (failures <= 0) return healthyMs;
  const exponent = Math.min(failures - 1, 10);
  return Math.min(unavailableMs * 2 ** exponent, maxMs);
}
