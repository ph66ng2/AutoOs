import { useState, type FormEvent } from "react";
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

/** Entrada com CPF/CNPJ + senha criada pela equipe. Sem senha ou esqueceu: a equipe cria outra. */
export default function PortalLogin({ aviso, onEntrou }: Props) {
  const [documento, setDocumento] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const docDigits = documento.replace(/\D/g, "");
  const docValido = docDigits.length === 11 || docDigits.length === 14;

  const entrarComSenha = async (event: FormEvent) => {
    event.preventDefault();
    if (!docValido || !senha || busy) return;
    setBusy(true);
    setErro(null);
    try {
      const result = await portalApi.entrarSenha(docDigits, senha);
      onEntrou({ token: result.sessao, contato: result.contato, acesso: result.acesso, expiraEm: result.expiraEm });
    } catch (cause) {
      setErro(cause instanceof PortalError ? cause.message : "Não foi possível entrar agora.");
    } finally {
      setBusy(false);
    }
  };

  const campoDocumento = (
    <>
      <label htmlFor="portal-documento">CPF ou CNPJ</label>
      <input
        id="portal-documento"
        className="portal-input"
        inputMode="numeric"
        autoComplete="username"
        value={documento}
        onChange={(event) => setDocumento(formatarDocumento(event.target.value))}
        placeholder="00.000.000/0000-00"
      />
    </>
  );

  return (
    <section className="status-card portal-login-card" aria-live="polite">
      <p className="eyebrow">Portal das Impressoras</p>
      <h1 className="portal-title">Acompanhe suas impressoras</h1>
      {aviso && <p className="notice-box" role="status">{aviso}</p>}

      <form className="portal-form" onSubmit={(event) => void entrarComSenha(event)} noValidate>
        <p className="portal-help">Entre com o CPF ou CNPJ do cadastro e a senha que a equipe BMI TAG criou para você.</p>
        {campoDocumento}
        <label htmlFor="portal-senha">Senha</label>
        <div className="portal-password">
          <input
            id="portal-senha"
            className="portal-input"
            type={mostrarSenha ? "text" : "password"}
            autoComplete="current-password"
            maxLength={72}
            value={senha}
            onChange={(event) => setSenha(event.target.value)}
          />
          <button className="link-button" type="button" onClick={() => setMostrarSenha((v) => !v)}
            aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}>
            {mostrarSenha ? "Ocultar" : "Mostrar"}
          </button>
        </div>
        {erro && <p className="portal-error" role="alert">{erro}</p>}
        <button className="primary-button portal-full" type="submit" disabled={!docValido || !senha || busy}>
          {busy ? "Entrando…" : "Entrar"}
        </button>
        <p className="answer-hint">Não tem senha ou esqueceu? Peça à equipe BMI TAG uma nova.</p>
      </form>
    </section>
  );
}
