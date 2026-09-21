import { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, KeyRound, Loader2, MailCheck, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSaasAuth } from "@/hooks/useSaasAuth";

type Screen = "login" | "recovery";

export function SaasLoginScreen({ initialEmail = "", notice }: { initialEmail?: string; notice?: string }) {
  const { login, requestPasswordRecovery } = useSaasAuth();
  const [screen, setScreen] = useState<Screen>("login");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoverySent, setRecoverySent] = useState(false);

  useEffect(() => setEmail(initialEmail), [initialEmail]);

  function openRecovery() {
    setError(null);
    setRecoverySent(false);
    setScreen("recovery");
  }

  function returnToLogin() {
    setError(null);
    setRecoverySent(false);
    setScreen("login");
  }

  async function handleLogin() {
    if (!email.trim() || !password) return;
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível entrar.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRecovery() {
    if (!email.trim()) {
      setError("Informe seu email para receber a recuperação de senha.");
      return;
    }
    setError(null);
    setRecovering(true);
    try {
      await requestPasswordRecovery(email);
      setRecoverySent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível solicitar a recuperação.");
    } finally {
      setRecovering(false);
    }
  }

  return (
    <main className="fixed inset-0 flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-3 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-700 bg-slate-800">
            <ShieldCheck className="h-7 w-7 text-slate-200" strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">{screen === "login" ? "AutoOS SaaS" : "Recuperar senha"}</h1>
            <p className="mt-1 text-sm text-slate-400">{screen === "login" ? "Acesso administrativo da sua empresa" : "Enviaremos um link seguro para sua Conta."}</p>
          </div>
        </div>

        {screen === "login" ? (
          <form className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm" onSubmit={(event) => { event.preventDefault(); void handleLogin(); }}>
            {notice ? <Notice>{notice}</Notice> : null}
            <div className="space-y-1.5"><Label htmlFor="saas-email" className="text-slate-300">Email</Label><Input id="saas-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} className="h-11 border-white/10 bg-white/5 text-white placeholder:text-white/20" placeholder="admin@empresa.com.br" autoFocus required /></div>
            <div className="space-y-1.5"><Label htmlFor="saas-password" className="text-slate-300">Senha</Label><Input id="saas-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 border-white/10 bg-white/5 text-white placeholder:text-white/20" placeholder="Sua senha" required /></div>
            {error ? <ErrorNotice>{error}</ErrorNotice> : null}
            <Button type="submit" size="lg" className="h-11 w-full bg-slate-100 font-semibold text-slate-950 hover:bg-white" disabled={submitting || !email.trim() || !password}>{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" strokeWidth={2} />}{submitting ? "Entrando..." : "Entrar"}</Button>
            <Button type="button" variant="link" className="flex w-full items-center justify-center gap-2 text-slate-400 hover:text-slate-200" onClick={openRecovery} disabled={submitting}><KeyRound className="h-4 w-4" strokeWidth={1.5} />Esqueci minha senha</Button>
          </form>
        ) : (
          <form className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm" onSubmit={(event) => { event.preventDefault(); void handleRecovery(); }}>
            <div className="space-y-1.5"><Label htmlFor="saas-recovery-email" className="text-slate-300">Email da Conta</Label><Input id="saas-recovery-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-11 border-white/10 bg-white/5 text-white placeholder:text-white/20" placeholder="admin@empresa.com.br" autoFocus required /></div>
            {error ? <ErrorNotice>{error}</ErrorNotice> : null}
            {recoverySent ? <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-900 bg-emerald-950/50 p-3 text-sm text-emerald-100"><MailCheck className="mt-0.5 h-4 w-4 shrink-0" /><span>Se o email estiver habilitado, você receberá as instruções de recuperação.</span></div> : null}
            <Button type="submit" size="lg" className="h-11 w-full bg-slate-100 font-semibold text-slate-950 hover:bg-white" disabled={recovering || recoverySent}>{recovering ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MailCheck className="mr-2 h-4 w-4" strokeWidth={2} />}{recovering ? "Enviando..." : "Enviar link de recuperação"}</Button>
            <Button type="button" variant="link" className="flex w-full items-center justify-center gap-2 text-slate-400 hover:text-slate-200" onClick={returnToLogin} disabled={recovering}><ArrowLeft className="h-4 w-4" strokeWidth={1.5} />Voltar para entrar</Button>
          </form>
        )}
        <p className="text-center text-xs text-slate-500">O cadastro de empresas é feito somente pelo suporte AutoOS.</p>
      </div>
    </main>
  );
}

function ErrorNotice({ children }: { children: string }) {
  return <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{children}</span></div>;
}

function Notice({ children }: { children: string }) {
  return <div className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-slate-200">{children}</div>;
}
