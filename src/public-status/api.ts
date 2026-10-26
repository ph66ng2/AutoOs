export interface PublicStatusResponse {
  equipamento: string;
  titulo: string;
  orientacao: string;
  statusAlteradoEm: string | null;
}

export class PublicStatusRequestError extends Error {
  constructor(public readonly kind: "rate-limit" | "service" | "unavailable") {
    super(kind);
  }
}

const API_URL = import.meta.env.VITE_PUBLIC_STATUS_API_URL
  || "https://sgaqvxubopgwysnyocjs.supabase.co/functions/v1/public-status";

export async function buscarStatusPublico(token: string): Promise<PublicStatusResponse> {
  const response = await fetch(API_URL, {
    method: "POST",
    mode: "cors",
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    throw new PublicStatusRequestError(
      response.status === 429 ? "rate-limit" : response.status >= 500 ? "service" : "unavailable",
    );
  }

  return await response.json() as PublicStatusResponse;
}
