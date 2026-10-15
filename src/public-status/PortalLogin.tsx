import { useState, type FormEvent } from "react";
import { CodigoForm } from "./CodigoForm";
import { PortalError, portalApi } from "./portal-api";
import type { PortalSession } from "./portal-session";

function formatarDocumento(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) {
    return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
}

type Props = {
  aviso: string | null;
  onEntrou: (session: PortalSession) => void;
};

export default function PortalLogin({ aviso, onEntrou }: Props) {
  const [documento, setDocumento] = useState("");
  const [contato, setContato] = useState("");
  const [desafio, setDesafio] = useState<{ id: string; canal: "WHATSAPP" | "EMAIL" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const docDigits = documento.replace(/\D/g, "");
  const contatoValido = contato.includes("@") ? /^\S+@\S+\.\S+$/.test(contato.trim()) : contato.replace(/\D/g, "").length >= 10;
  const podePedir = (docDigits.length === 11 || docDigits.length === 14) && contatoValido;

  const pedirCodigo = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!podePedir || busy) return;
    setBusy(true);
    setErro(null);
    try {
      const result = await portalApi.solicitarCodigo(docDigits, contato.trim());
      setDesafio({ id: result.desafio, canal: result.canal });
    } catch (cause) {
      setErro(cause instanceof PortalError ? cause.message : "Não foi possível pedir o código agora.");
    } finally {
      setBusy(false);
    }
  };

  const confirmar = async (codigo: string) => {
    if (!desafio) return;
    setBusy(true);
    setErro(null);
    try {
      const result = await portalApi.verificarCodigo(desafio.id, codigo);
      if (!result.sessao) throw new PortalError("Não foi possível iniciar a sessão.", 500, null);
      onEntrou({ token: result.sessao, contato: result.contato, acesso: result.acesso, expiraEm: result.expiraEm });
    } catch (cause) {
      setErro(cause instanceof PortalError ? cause.message : "Não foi possível conferir o código agora.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="status-card" aria-live="polite">
      <p className="eyebrow">Portal das Impressoras</p>
      <h1 className="portal-title">Acompanhe suas impressoras</h1>
      {aviso && <p className="notice-box" role="status">{aviso}</p>}

      {!desafio ? (
        <form className="portal-form" onSubmit={pedirCodigo} noValidate>
          <p className="portal-help">
            Informe o CPF ou CNPJ do cadastro e o WhatsApp ou email de um contato autorizado.
            Enviaremos um código de acesso para esse contato.
          </p>
          <label htmlFor="portal-documento">CPF ou CNPJ</label>
          <input
            id="portal-documento"
            className="portal-input"
            inputMode="numeric"
            autoComplete="off"
            value={documento}
            onChange={(event) => setDocumento(formatarDocumento(event.target.value))}
            placeholder="00.000.000/0000-00"
          />
          <label htmlFor="portal-contato">WhatsApp ou email do contato</label>
          <input
            id="portal-contato"
            className="portal-input"
            autoComplete="username"
            value={contato}
            onChange={(event) => setContato(event.target.value.slice(0, 120))}
            placeholder="(71) 98888-7777 ou nome@empresa.com.br"
          />
          {erro && <p className="portal-error" role="alert">{erro}</p>}
          <button className="primary-button portal-full" type="submit" disabled={!podePedir || busy}>
            {busy ? "Enviando…" : "Receber código"}
          </button>
          <p className="answer-hint">
            O CPF/CNPJ sozinho não dá acesso. Se o seu contato ainda não é autorizado, peça à equipe BMI TAG.
          </p>
        </form>
      ) : (
        <CodigoForm
          destinoDescricao={`Se os dados conferirem com um contato autorizado, o código chegará pelo ${desafio.canal === "EMAIL" ? "email" : "WhatsApp"} informado em instantes. Ele vale por 10 minutos.`}
          busy={busy}
          erro={erro}
          onConfirmar={(codigo) => void confirmar(codigo)}
          onReenviar={() => void pedirCodigo()}
          onVoltar={() => { setDesafio(null); setErro(null); }}
        />
      )}
    </section>
  );
}
