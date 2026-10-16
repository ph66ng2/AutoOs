import { useState, type FormEvent } from "react";
import { PortalError, portalApi } from "./portal-api";
import type { PortalSession } from "./portal-session";

type Props = {
  session: PortalSession;
  onConcluido: () => void;
  onExpirou: (mensagem: string) => void;
};

/** Mesma regra do servidor: 8 a 72 caracteres, com letra e número. */
export function senhaValida(senha: string) {
  return senha.length >= 8 && new TextEncoder().encode(senha).length <= 72 && /\p{L}/u.test(senha) && /\d/.test(senha);
}

/**
 * O contato cria a própria senha. Obrigatório depois da senha provisória da equipe; no
 * "Esqueci minha senha" ele já entrou pelo código e pode deixar para depois.
 */
export default function CriarSenha({ session, onConcluido, onExpirou }: Props) {
  const obrigatoria = session.trocarSenha === "obrigatoria";
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const valida = senhaValida(senha);
  const confere = senha === confirmacao;

  const salvar = async (event: FormEvent) => {
    event.preventDefault();
    if (!valida || !confere || busy) return;
    setBusy(true);
    setErro(null);
    try {
      await portalApi.trocarSenha(session.token, senha);
      onConcluido();
    } catch (cause) {
      if (cause instanceof PortalError && (cause.status === 401 || cause.status === 428)) {
        onExpirou(cause.message);
        return;
      }
      setErro(cause instanceof PortalError ? cause.message : "Não foi possível salvar a senha agora.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="status-card portal-login-card" aria-live="polite">
      <p className="eyebrow">Portal das Impressoras</p>
      <h1 className="portal-title">{obrigatoria ? "Crie sua senha" : "Crie uma nova senha"}</h1>
      <p className="portal-help">
        {obrigatoria
          ? `Olá, ${session.contato}! A senha que a equipe enviou é provisória. Crie a sua para continuar: só você vai conhecê-la.`
          : `Olá, ${session.contato}! Crie uma nova senha para os próximos acessos.`}
      </p>
      <form className="portal-form" onSubmit={(event) => void salvar(event)} noValidate>
        <label htmlFor="portal-nova-senha">Nova senha</label>
        <div className="portal-password">
          <input
            id="portal-nova-senha"
            className="portal-input"
            type={mostrar ? "text" : "password"}
            autoComplete="new-password"
            maxLength={72}
            value={senha}
            onChange={(event) => setSenha(event.target.value)}
            autoFocus
          />
          <button className="link-button" type="button" onClick={() => setMostrar((v) => !v)}
            aria-label={mostrar ? "Ocultar senha" : "Mostrar senha"}>
            {mostrar ? "Ocultar" : "Mostrar"}
          </button>
        </div>
        <p className={`answer-hint${senha && !valida ? " portal-error" : ""}`}>Pelo menos 8 caracteres, com letras e números.</p>
        <label htmlFor="portal-confirma-senha">Repita a nova senha</label>
        <input
          id="portal-confirma-senha"
          className="portal-input"
          type={mostrar ? "text" : "password"}
          autoComplete="new-password"
          maxLength={72}
          value={confirmacao}
          onChange={(event) => setConfirmacao(event.target.value)}
        />
        {confirmacao && !confere && <p className="portal-error" role="alert">As senhas não são iguais.</p>}
        {erro && <p className="portal-error" role="alert">{erro}</p>}
        <button className="primary-button portal-full" type="submit" disabled={!valida || !confere || busy}>
          {busy ? "Salvando…" : "Salvar senha e continuar"}
        </button>
        {!obrigatoria && (
          <button className="link-button" type="button" onClick={onConcluido}>Agora não</button>
        )}
      </form>
    </section>
  );
}
