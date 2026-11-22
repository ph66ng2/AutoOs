import { createClient } from "npm:@supabase/supabase-js@2";
import { escapeHtml, handleSaasUserAdminRequest } from "./core.mjs";

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
};

function authError(error: { code?: string; status?: number }) {
  return Object.assign(new Error("Supabase Auth operation failed"), {
    code: error.code ?? error.status ?? "auth_error",
  });
}

Deno.serve(async (request) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Serviço de usuários indisponível.", code: "server_configuration" }), {
      status: 503,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  let userClient: ReturnType<typeof createClient> | undefined;

  return await handleSaasUserAdminRequest(request, {
    allowedOrigins: Deno.env.get("SAAS_ADMIN_ALLOWED_ORIGINS") ?? "",
    verifyAccessToken: async (token: string) => {
      userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      });
      const { data, error } = await userClient.auth.getUser(token);
      if (error || !data.user) throw Object.assign(new Error("Invalid authenticated user"), { code: 401 });
      return { id: data.user.id };
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      return await serviceClient.rpc(name, args);
    },
    acceptInvitation: async () => {
      if (!userClient) return { error: Object.assign(new Error("Missing authenticated session"), { code: 401 }) };
      return await userClient.rpc("accept_company_user_invite");
    },
    createAuthUser: async (email: string) => {
      const { data, error } = await serviceClient.auth.admin.createUser({ email, email_confirm: false });
      if (error) throw authError(error);
      return data.user;
    },
    deleteAuthUser: async (userId: string) => {
      const { error } = await serviceClient.auth.admin.deleteUser(userId);
      if (error) throw authError(error);
    },
    generateInviteLink: async (email: string) => {
      const redirectTo = requiredEnv("SAAS_INVITE_REDIRECT_URL");
      const { data, error } = await serviceClient.auth.admin.generateLink({
        type: "invite",
        email,
        options: { redirectTo },
      });
      if (error) throw authError(error);
      return data.properties.action_link;
    },
    sendInviteEmail: async ({ to, actionLink, idempotencyKey }: { to: string; actionLink: string; idempotencyKey: string }) => {
      const apiKey = requiredEnv("RESEND_API_KEY");
      const from = requiredEnv("RESEND_FROM");
      const safeActionLink = escapeHtml(actionLink);
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject: "Convite para acessar o AutoOS",
          text: `Você foi convidado para acessar o AutoOS. Abra este link para definir sua senha e aceitar o convite: ${actionLink}`,
          html: `<p>Você foi convidado para acessar o AutoOS.</p><p><a href="${safeActionLink}">Definir senha e aceitar convite</a></p><p>Se você não esperava este convite, ignore esta mensagem.</p>`,
        }),
      });
      if (!response.ok) throw Object.assign(new Error("Invitation email provider rejected the request"), { code: `resend_${response.status}` });
    },
    banAuthUser: async (userId: string) => {
      const { error } = await serviceClient.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
      if (error) throw authError(error);
    },
    unbanAuthUser: async (userId: string) => {
      const { error } = await serviceClient.auth.admin.updateUserById(userId, { ban_duration: "none" });
      if (error) throw authError(error);
    },
  });
});
