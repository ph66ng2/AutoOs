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

type Modo = "senha" | "codigo";

/** Entrada padrão: CPF/CNPJ + senha criada pelo operador. Alternativa: código por WhatsApp/email. */
export default function PortalLogin({ aviso, onEntrou }: Props) {
  const [modo, setModo] = useState<Modo>("senha");
  const [documento, setDocumento] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [contato, setContato] = useState("");
  const [desafio, setDesafio] = useState<{ id: string; canal: "WHATSAPP" | "EMAIL" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const docDigits = documento.replace(/\D/g, "");
  const docValido = docDigits.length === 11 || docDigits.length === 14;
  const contatoValido = contato.includes("@") ? /^\S+@\S+\.\S+$/.test(contato.trim()) : contato.replace(/\D/g, "").length >= 10;
  const podePedir = docValido && contatoValido;

  const trocarModo = (novo: Modo) => {
    setModo(novo);
    setErro(null);
    setDesafio(null);
  };

  const entrarComSenha = async (event: FormEvent) => {
    event.preventDefault();
    if (!docValido || !senha || busy) return;
    setBusy(true);
    setErro(null);
    try {
      const result = await portalApi.entrarSenha(docDigits, senha);
      onEntrou({ token: result.sessao, contato: result.contato, acesso: result.acesso, expiraEm: result.expiraEm, metodo: "SENHA" });
    } catch (cause) {
      setErro(cause instanceof PortalError ? cause.message : "Não foi possível entrar agora.");
    } finally {
      setBusy(false);
    }
  };

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
      onEntrou({ token: result.sessao, contato: result.contato, acesso: result.acesso, expiraEm: result.expiraEm, metodo: "CODIGO" });
    } catch (cause) {
      setErro(cause instanceof PortalError ? cause.message : "Não foi possível conferir o código agora.");
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

      {modo === "senha" && (
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
          <button className="link-button" type="button" onClick={() => trocarModo("codigo")}>
            Entrar com código pelo WhatsApp ou email
          </button>
        </form>
      )}

      {modo === "codigo" && !desafio && (
        <form className="portal-form" onSubmit={pedirCodigo} noValidate>
          <p className="portal-help">
            Informe o CPF ou CNPJ do cadastro e o WhatsApp ou email de um contato autorizado.
            Enviaremos um código de acesso para esse contato.
          </p>
          {campoDocumento}
          <label htmlFor="portal-contato">WhatsApp ou email do contato</label>
          <input
            id="portal-contato"
            className="portal-input"
            autoComplete="off"
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
          <button className="link-button" type="button" onClick={() => trocarModo("senha")}>Entrar com senha</button>
        </form>
      )}

      {modo === "codigo" && desafio && (
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
