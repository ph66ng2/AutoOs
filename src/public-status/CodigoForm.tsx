import { useState, type FormEvent } from "react";

type Props = {
  destinoDescricao: string;
  busy: boolean;
  erro: string | null;
  onConfirmar: (codigo: string) => void;
  onReenviar?: () => void;
  onVoltar?: () => void;
  confirmarRotulo?: string;
};

/** Campo do código de 6 dígitos, usado no login e na verificação antes de decidir. */
export function CodigoForm({ destinoDescricao, busy, erro, onConfirmar, onReenviar, onVoltar, confirmarRotulo = "Entrar" }: Props) {
  const [codigo, setCodigo] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (codigo.length === 6) onConfirmar(codigo);
  };
  return (
    <form className="portal-form" onSubmit={submit} noValidate>
      <p className="portal-help">{destinoDescricao}</p>
      <label htmlFor="portal-codigo">Código de 6 dígitos</label>
      <input
        id="portal-codigo"
        className="portal-input portal-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={codigo}
        onChange={(event) => setCodigo(event.target.value.replace(/\D/g, "").slice(0, 6))}
        aria-invalid={Boolean(erro)}
        aria-describedby={erro ? "portal-codigo-erro" : undefined}
        autoFocus
      />
      {erro && <p className="portal-error" id="portal-codigo-erro" role="alert">{erro}</p>}
      <button className="primary-button portal-full" type="submit" disabled={busy || codigo.length !== 6}>
        {busy ? "Conferindo…" : confirmarRotulo}
      </button>
      <div className="action-row">
        {onReenviar && <button className="link-button" type="button" onClick={onReenviar} disabled={busy}>Enviar novo código</button>}
        {onVoltar && <button className="link-button" type="button" onClick={onVoltar} disabled={busy}>Voltar</button>}
      </div>
    </form>
  );
}
