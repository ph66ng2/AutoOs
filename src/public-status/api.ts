export interface PublicStatusResponse {
  equipamento: string;
  titulo: string;
  orientacao: string;
  statusAlteradoEm: string | null;
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
    throw new Error("Acompanhamento indisponível.");
  }

  return await response.json() as PublicStatusResponse;
}
