import type { Equipamento } from "@/types";

/** Ponto de extensão pós-cadastro: recebe somente o registro já persistido. */
export type CounterPostRegistrationHandler = (equipamento: Equipamento) => void | Promise<void>;

/** Mantido sem efeito no MVP; futura integração de fotos/QR será conectada aqui. */
export const afterCounterRegistration: CounterPostRegistrationHandler = async () => undefined;
