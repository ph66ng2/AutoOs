import { useState } from "react";

export function mapaEmbedUrl(endereco: string) {
  return `https://www.google.com/maps?q=${encodeURIComponent(endereco)}&output=embed`;
}

export function mapaLinkUrl(endereco: string, mapsUrl: string | null) {
  return mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`;
}

export function rotasUrl(endereco: string) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(endereco)}`;
}

export function textoCompartilharEndereco(nome: string, endereco: string, mapsUrl: string | null) {
  return `${nome}\n${endereco}\n${mapaLinkUrl(endereco, mapsUrl)}`;
}

type Props = {
  nome: string;
  endereco: string;
  horario?: string | null;
  mapsUrl?: string | null;
};

/** Endereço de retirada com mapa, "Como chegar" e compartilhamento. */
export function EnderecoRetirada({ nome, endereco, horario, mapsUrl }: Props) {
  const [aviso, setAviso] = useState<{ tipo: "status" | "alert"; texto: string } | null>(null);
  const link = mapsUrl ?? null;

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setAviso({ tipo: "status", texto: "Endereço copiado" });
    } catch {
      setAviso({ tipo: "alert", texto: "Não foi possível copiar o endereço." });
    }
  };

  const compartilhar = async () => {
    const texto = textoCompartilharEndereco(nome, endereco, link);
    setAviso(null);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: nome, text: texto });
        return;
      } catch (erro) {
        if ((erro as { name?: string } | null)?.name === "AbortError") return;
      }
    }
    await copiar(texto);
  };

  return (
    <>
      <address className="portal-endereco">
        <strong>{nome}</strong>
        <span>{endereco}</span>
        {horario && <span className="answer-hint">{horario}</span>}
      </address>
      <iframe
        className="portal-mapa"
        title={`Mapa: ${endereco}`}
        src={mapaEmbedUrl(endereco)}
        loading="lazy"
        referrerPolicy="no-referrer"
        allowFullScreen={false}
      />
      <div className="portal-endereco-acoes">
        <a className="primary-button portal-link-button" href={rotasUrl(endereco)} target="_blank" rel="noopener noreferrer">
          Como chegar
        </a>
        <a className="secondary-button portal-link-button" href={mapaLinkUrl(endereco, link)} target="_blank" rel="noopener noreferrer">
          Abrir no Google Maps
        </a>
        <button type="button" className="secondary-button" onClick={() => void compartilhar()}>
          Compartilhar endereço
        </button>
      </div>
      {aviso?.tipo === "status" && <p role="status">{aviso.texto}</p>}
      {aviso?.tipo === "alert" && <p className="portal-error" role="alert">{aviso.texto}</p>}
    </>
  );
}
