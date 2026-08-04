import { invoke } from "@tauri-apps/api/core";
import { useState, useCallback } from "react";
import { Database, ArrowRight, AlertCircle, Loader2, CheckCircle2, UserPlus, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface AuthDialogProps {
  onAuthenticated: (empresaId: number, empresaNome: string) => void;
}

type AuthMode = "login" | "register";

export function AuthDialog({ onAuthenticated }: AuthDialogProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [empresaNome, setEmpresaNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleLogin = useCallback(async () => {
    setError(null);
    setConnecting(true);

    try {
      const result = await invoke<{ empresa_id: number; nome: string; status: string }>(
        "login_empresa",
        { email: email.trim(), senha }
      );
      onAuthenticated(result.empresa_id, result.nome);
    } catch (e: any) {
      const msg = e?.message || e?.toString() || "Erro ao fazer login.";
      // Traduz mensagens do backend
      if (msg.includes("Email não cadastrado")) {
        setError("Email não encontrado. Verifique ou crie uma conta.");
      } else if (msg.includes("pendente")) {
        setError("Sua conta está pendente de aprovação. Aguarde ou entre em contato.");
      } else if (msg.includes("suspenso")) {
        setError("Sua conta foi suspensa. Entre em contato com o suporte.");
      } else {
        setError(msg);
      }
    } finally {
      setConnecting(false);
    }
  }, [email, senha, onAuthenticated]);

  const handleRegister = useCallback(async () => {
    setError(null);
    setConnecting(true);

    try {
      await invoke("registrar_empresa",
        { nome: empresaNome.trim(), email: email.trim(), cnpj: null, senha }
      );
      setSuccess(true);
    } catch (e: any) {
      const msg = e?.message || e?.toString() || "Erro ao criar conta.";
      if (msg.includes("Email já cadastrado")) {
        setError("Este email já está em uso. Tente fazer login.");
      } else if (msg.includes("mínimo 6")) {
        setError("A senha deve ter no mínimo 6 caracteres.");
      } else if (msg.includes("Email inválido")) {
        setError("Email inválido. Use um formato como nome@empresa.com");
      } else {
        setError(msg);
      }
    } finally {
      setConnecting(false);
    }
  }, [empresaNome, email, senha]);

  const handleSubmit = mode === "login" ? handleLogin : handleRegister;
  const isFormValid = mode === "login"
    ? email.trim() && senha.trim()
    : empresaNome.trim() && email.trim() && senha.trim();

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo / Brand */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/10 border border-cyan-500/20">
            <Database className="h-7 w-7 text-cyan-400" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {mode === "login" ? "AutoOS" : "Criar sua conta"}
          </h1>
          <p className="text-sm text-slate-400">
            {mode === "login"
              ? "Acesse sua conta para continuar."
              : "Preencha os dados para começar a usar o AutoOS."}
          </p>
        </div>

        {/* Card de Auth */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm space-y-5">
          {/* Tabs */}
          <div className="flex rounded-lg bg-white/5 p-1">
            <button
              type="button"
              onClick={() => { setMode("login"); setError(null); setSuccess(false); }}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all",
                mode === "login"
                  ? "bg-cyan-500 text-slate-950"
                  : "text-slate-400 hover:text-white"
              )}
            >
              <LogIn className="h-4 w-4" />
              Entrar
            </button>
            <button
              type="button"
              onClick={() => { setMode("register"); setError(null); setSuccess(false); }}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all",
                mode === "register"
                  ? "bg-cyan-500 text-slate-950"
                  : "text-slate-400 hover:text-white"
              )}
            >
              <UserPlus className="h-4 w-4" />
              Cadastrar
            </button>
          </div>

          {/* Form */}
          <div className="space-y-4">
            {mode === "register" && (
              <div className="space-y-1.5">
                <Label htmlFor="empresa-nome" className="text-sm font-medium text-slate-300">
                  Nome da Empresa
                </Label>
                <Input
                  id="empresa-nome"
                  value={empresaNome}
                  onChange={(e) => setEmpresaNome(e.target.value)}
                  placeholder="Ex: Minha Empresa LTDA"
                  className="h-11 border-white/10 bg-white/5 text-white placeholder:text-white/20 focus-visible:ring-cyan-500/50"
                  autoFocus
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium text-slate-300">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="h-11 border-white/10 bg-white/5 text-white placeholder:text-white/20 focus-visible:ring-cyan-500/50"
                autoFocus={mode === "login"}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="senha" className="text-sm font-medium text-slate-300">
                Senha
              </Label>
              <Input
                id="senha"
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="••••••••"
                className="h-11 border-white/10 bg-white/5 text-white placeholder:text-white/20 focus-visible:ring-cyan-500/50"
                onKeyDown={(e) => e.key === "Enter" && isFormValid && handleSubmit()}
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Cadastro realizado!</p>
                <p className="text-emerald-400/80 mt-1">
                  Sua conta está pendente de aprovação. Você será notificado quando estiver ativa.
                </p>
              </div>
            </div>
          )}

          <Button
            size="lg"
            className="w-full bg-cyan-500 text-slate-950 hover:bg-cyan-400 font-semibold h-11"
            onClick={() => void handleSubmit()}
            disabled={connecting || !isFormValid || success}
          >
            {connecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {mode === "login" ? "Entrando..." : "Cadastrando..."}
              </>
            ) : (
              <>
                <ArrowRight className="mr-2 h-4 w-4" />
                {mode === "login" ? "Entrar" : "Criar minha conta"}
              </>
            )}
          </Button>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-600">
          {mode === "register"
            ? "Após o cadastro, aguarde aprovação para acessar o sistema."
            : "Acesso exclusivo para clientes autorizados."}
        </p>
      </div>
    </div>
  );
}
